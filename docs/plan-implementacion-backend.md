# Plan de acción — Backend (API Truck)

> API: `https://truck.ccsoluciones.com.co` — **repositorio externo**, fuera de `Truck_Mf_Site`.
> Diseño funcional: [`viajes-redondo-y-vacio.md`](./viajes-redondo-y-vacio.md) · Frontend: [`plan-accion-frontend-compacto.md`](./plan-accion-frontend-compacto.md)

> ⚠️ **Supuesto de stack:** las respuestas tienen forma `{ data: { content: [], totalElements } }`, que corresponde a un `Page` de Spring Data. El plan asume **Spring Boot + JPA**. Si el stack es otro, la secuencia de pasos se mantiene y solo cambia la sintaxis.

---

## 0. Objetivo y regla de oro

Habilitar tres tipos de viaje (`CARGADO`, `REDONDO`, `VACIO`) **sin romper ningún cliente actual**.

**Regla de oro:** el backend debe desplegarse **antes** que el frontend y ser **retrocompatible en ambos sentidos** — un cliente viejo que no envía `tripType` debe seguir funcionando igual, y un cliente nuevo que sí lo envía no debe fallar contra la versión anterior de la API mientras el flag esté apagado.

**Orden de despliegue:** Backend (pasos 1-5) → verificación → Frontend enciende su feature flag.

---

## 1. Alcance de los cambios

| Objeto | Cambio | Fase |
|---|---|---|
| Tabla `trip` | + `trip_type`, `return_destination_id`, `current_leg` | 1 y 2 |
| Tabla `expense` | **Ninguno** (decisión D3) | — |
| `POST /trip/save` | Acepta y persiste los campos nuevos; relaja validaciones | 1 |
| `POST /trip/filter` | Permite filtrar por `tripType` | 1 |
| Reglas de negocio | Coherencia por tipo de viaje | 1 y 2 |

---

## 2. Paso a paso

### Paso 1 — Migración de esquema (retrocompatible)

Columnas **nullable con default**, sin `NOT NULL`, para que la migración no bloquee inserciones de la versión anterior.

```sql
ALTER TABLE trip ADD COLUMN trip_type VARCHAR(10) NULL DEFAULT 'CARGADO';
ALTER TABLE trip ADD COLUMN return_destination_id BIGINT NULL;
ALTER TABLE trip ADD COLUMN current_leg VARCHAR(10) NULL;

-- Backfill del histórico
UPDATE trip SET trip_type = 'CARGADO' WHERE trip_type IS NULL;

-- Índice solo si se van a filtrar/reportar por tipo con frecuencia
CREATE INDEX idx_trip_trip_type ON trip (trip_type);
```

- [ ] Ejecutar en desarrollo y validar el conteo: `SELECT trip_type, COUNT(*) FROM trip GROUP BY trip_type;` → todo en `CARGADO`.
- [ ] Versionar la migración (Flyway/Liquibase) si el proyecto las usa.
- [ ] **No** poner FK sobre `return_destination_id` si `origin_id`/`destination_id` tampoco la tienen — mantener la consistencia con lo existente.

**Rollback:** las columnas son nullable y nadie las lee todavía. Revertir = ignorarlas o `DROP COLUMN`.

---

### Paso 2 — Entidad y DTO

- [ ] Agregar los tres campos a la entidad `Trip` y al DTO de request/response.
- [ ] `tripType` como `String` o `enum` con `@Enumerated(EnumType.STRING)`. Si se usa enum, **debe tolerar null** al deserializar (viaje viejo o cliente viejo).
- [ ] Default en el constructor/`@PrePersist`: si `tripType == null` ⇒ `CARGADO`. Este default es lo que hace innecesario tocar a los clientes actuales.
- [ ] Verificar la configuración de Jackson: si está activo `FAIL_ON_UNKNOWN_PROPERTIES`, el cliente nuevo rompería contra la API vieja. **Confirmar antes de que el frontend llegue a su Paso 3a** — es el riesgo bloqueante del plan de frontend.

---

### Paso 3 — Validaciones del servidor

El punto crítico: hoy el servidor probablemente exige manifiesto y flete.

| Campo | Regla nueva |
|---|---|
| `manifestNumber` | Quitar `@NotNull`/`@NotBlank` incondicional → requerido **solo** si `tripType != 'VACIO'` |
| `freight` | Permitir `0`. Si `tripType == 'VACIO'` ⇒ debe ser exactamente `0` |
| `advancePayment` | Si `VACIO` ⇒ `0`. En los demás, `0 <= advance <= freight` (ya existente) |
| `balance` | Si `VACIO` ⇒ `0`. El front **no envía** `balance` en `/trip/save` (lo destructura fuera del payload), así que el servidor debe seguir calculándolo |
| `returnDestinationId` | Requerido **solo** si `tripType == 'REDONDO'`. Ignorado (o anulado) en los demás tipos |
| `currentLeg` | Solo aceptado si `tripType == 'REDONDO'`. Valores válidos: `IDA`, `REGRESO` |
| `tripType` | Si viene, debe estar en el enum. Si no viene, `CARGADO` |

- [ ] Implementar como validación condicional (`@AssertTrue` a nivel de clase o validación en el servicio), **no** como anotaciones sueltas por campo.
- [ ] Los mensajes de error deben ser legibles: el frontend los muestra tal cual en el toast.
- [ ] **Saneamiento defensivo:** si llega `VACIO` con flete > 0, decidir explícitamente entre rechazar (400) o normalizar a 0. **Recomendado: rechazar**, para que un bug de cliente no ensucie los reportes financieros en silencio.

---

### Paso 4 — Filtro

`POST /trip/filter` recibe `{ filter: [{fieldFilter, compFilter, valueFilter}], pagination, sort }`.

- [ ] Verificar que el constructor genérico de Specifications/Criteria resuelva `fieldFilter: "tripType"` como cualquier otro campo simple. Si el mapeo de campos es una lista blanca explícita, **agregar `tripType` a esa lista**.
- [ ] Probar: `{"fieldFilter":"tripType","compFilter":"=","valueFilter":"VACIO"}`.
- [ ] Confirmar que los filtros existentes por `status`, `vehicleId` y `vehicle.id` siguen intactos (el frontend los usa en el listado, el dashboard y el selector de vehículos disponibles).

---

### Paso 5 — Pruebas del backend

- [ ] Guardar viaje **sin** `tripType` (cliente viejo) ⇒ se persiste como `CARGADO`.
- [ ] Guardar `CARGADO` completo ⇒ comportamiento idéntico al actual.
- [ ] Guardar `VACIO` sin manifiesto y con flete 0 ⇒ 200.
- [ ] Guardar `VACIO` con flete > 0 ⇒ 400 con mensaje claro.
- [ ] Guardar `CARGADO` sin manifiesto ⇒ 400 (la validación **no** se relajó de más).
- [ ] Guardar `REDONDO` sin `returnDestinationId` ⇒ 400.
- [ ] Guardar `REDONDO` con `returnDestinationId` ≠ origen ⇒ 200 (triangular, decisión D2).
- [ ] Filtrar por `tripType` ⇒ devuelve solo los del tipo pedido.
- [ ] Filtrar sin `tripType` ⇒ devuelve todos, como hoy.
- [ ] Regresión sobre los endpoints que devuelven viajes anidados (vehículo, conductor, gastos, ubicaciones).

---

### Paso 6 — Despliegue y coordinación

1. [ ] Desplegar backend en **desarrollo** con los pasos 1-5.
2. [ ] Confirmar al equipo de frontend que `/trip/save` acepta `tripType` → desbloquea su Paso 3a.
3. [ ] Regresión del frontend actual **contra el backend nuevo, con el flag apagado**: nada debe cambiar. Esta es la prueba que valida la retrocompatibilidad.
4. [ ] Desplegar backend en **producción** (sigue siendo transparente: ningún cliente envía todavía los campos nuevos).
5. [ ] Recién ahí el frontend enciende su flag.

---

## 3. Fase 2 y 3 (backend)

Casi todo el trabajo del backend queda hecho en la Fase 1. Lo que resta:

- **Fase 2 (redondo):** solo activar la validación de `returnDestinationId` (ya contemplada en el Paso 3). Sin cambios de esquema adicionales.
- **Fase 3 (tramo activo):** permitir actualizar `currentLeg` vía `/trip/save`. Verificar que el guardado parcial desde el detalle no pise otros campos.

---

## 4. Reportes y consultas de negocio

Con `trip_type` en la tabla se habilitan consultas que hoy no existen. Vale la pena entregarlas junto con la Fase 1:

```sql
-- Costo total de recorridos vacíos por período
SELECT SUM(e.amount)
FROM expense e
JOIN trip t ON t.id = e.trip_id
WHERE t.trip_type = 'VACIO'
  AND t.start_date BETWEEN :desde AND :hasta;

-- Proporción de viajes vacíos por vehículo
SELECT t.vehicle_id,
       COUNT(*) FILTER (WHERE t.trip_type = 'VACIO') AS vacios,
       COUNT(*)                                      AS total
FROM trip t
GROUP BY t.vehicle_id;
```

> `FILTER (WHERE ...)` es sintaxis PostgreSQL. En MySQL/SQL Server: `SUM(CASE WHEN t.trip_type = 'VACIO' THEN 1 ELSE 0 END)`.

**Limitación conocida (D3):** estas consultas no capturan el costo de la ida vacía de los viajes redondos, porque los gastos no se separan por tramo. Documentarlo donde se publiquen los indicadores.

---

## 5. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| `FAIL_ON_UNKNOWN_PROPERTIES` activo en Jackson | El frontend nuevo rompe **todo** guardado de viajes | Verificarlo en el Paso 2, antes de que el frontend llegue a su Paso 3a |
| Relajar de más la validación de `manifestNumber` | Se pueden crear viajes con carga sin manifiesto | Validación **condicional** por tipo, con test explícito (Paso 5) |
| Columna con `NOT NULL` sin default | La migración rompe inserciones en vuelo | Nullable + default + backfill (Paso 1) |
| El filtro genérico usa lista blanca de campos | El filtro por `tripType` devuelve todo o falla | Revisar el builder en el Paso 4 |
| Backend desplegado después del frontend | Errores 400 en producción al guardar | Orden de despliegue del Paso 6, no negociable |

---

## 6. Checklist de entrega (Fase 1)

- [ ] Migración versionada y aplicada en dev
- [ ] Backfill verificado (`SELECT trip_type, COUNT(*) ... GROUP BY`)
- [ ] Entidad, DTO y default `CARGADO`
- [ ] Validaciones condicionales por tipo
- [ ] Filtro por `tripType` operativo
- [ ] 10 pruebas del Paso 5 en verde
- [ ] Regresión del frontend actual contra el backend nuevo, sin cambios
- [ ] Desplegado en producción y comunicado al equipo de frontend
