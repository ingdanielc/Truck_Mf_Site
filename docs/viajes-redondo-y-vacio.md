# Viaje Redondo y Viaje Vacío — Análisis e implementación

> Documento de diseño para una funcionalidad **pendiente de implementar**.
> Repo: `Truck_Mf_Site` (Angular standalone). API externa: `truck.ccsoluciones.com.co`.
> Fecha de análisis: 2026-08-11. Decisiones de negocio D1–D4 confirmadas (ver §10).
> **Planes de ejecución:** [frontend compacto](./plan-accion-frontend-compacto.md) · [frontend detallado](./plan-implementacion-viajes-redondo-vacio.md) · [backend](./plan-implementacion-backend.md)

---

## 1. Contexto de negocio

Hoy el sistema solo sabe registrar un viaje "clásico": un origen, un destino, carga y un flete que alguien paga. La operación real incluye dos casos más que hoy no se pueden registrar sin distorsionar los números.

### 1.1 Viaje redondo

Ofrecen un viaje para **ir a traer algo** a otra ciudad. Implica desplazarse vacío hasta la ciudad de recogida, cargar y regresar.

> **Ejemplo:** desde Ipiales pagan $5.000.000 para ir a Cali a traer un contenedor y regresar a Ipiales.

- El flete **cubre los dos trayectos** (no se divide).
- Se deben registrar gastos **de ambos trayectos** (ida vacía + regreso cargado).
- La ruta tiene tres puntos: `A → B (vacío) → A (cargado)`.

### 1.2 Viaje vacío

El vehículo se desplaza **por voluntad propia** de un lugar a otro sin carga, porque donde está no hay viajes disponibles.

> **Ejemplo:** de Cartagena a Barranquilla, porque al ser puerto allá se consiguen viajes.

- **Nadie paga**: no hay flete, no hay anticipo, no hay saldo.
- Los gastos **los asume el propietario** del vehículo.
- Aun así **se deben registrar los gastos** (es costo operativo real que hoy queda invisible o mal imputado).

---

## 2. Estado actual del código

### 2.1 Modelo

`src/app/models/trip-model.ts`

```ts
export interface ModelTrip {
  id: number | null;
  numberTrip?: string;
  status: string;
  originId: string;
  destinationId: string;
  freight: number;
  manifestNumber: string;
  advancePayment: number;
  balance: number;
  vehicleId?: number;
  driverId?: number;
  company?: string;
  startDate?: string | Date;
  endDate?: string | Date;
  numberOfDays?: number;
  loadType?: string;
  paidBalance?: boolean;
  // ...
}
```

`src/app/models/expense-model.ts` — el gasto se ata al viaje por `tripId` y al vehículo por `vehicleId`, **sin distinguir tramo**.

Las ubicaciones GPS (`ModelDriverLocation`) también se filtran por `tripId`.

### 2.2 Supuestos implícitos que hay que romper

| Supuesto actual | Dónde vive | Rompe con |
|---|---|---|
| Un viaje = un par origen/destino | `trip-model.ts:8-9` | Redondo (3 puntos) |
| Siempre hay flete > 0 | `g-trip-form.component.ts:114-121` | Vacío |
| `manifestNumber` es obligatorio | `g-trip-form.component.ts:111` | Vacío |
| Siempre hay carga (`loadType`) y empresa (`company`) | `g-trip-form.component.ts:130-131` | Vacío / ida del redondo |
| Al completar, el saldo quedó pagado | `trip-detail.component.ts:439-443` | Vacío |
| Ingreso del viaje = `freight` | `trip-detail.component.ts:427-433`, `dashboard.component.ts:711,798,844` | Vacío (ingreso 0, gasto real) |
| El destino para ETA/progreso es fijo | `trip-detail.component.ts:543-608`, `:987-1043` | Redondo (el destino cambia a mitad del viaje) |
| El gasto pertenece al viaje, sin más detalle | `expense-model.ts:4` | Redondo (ida vs. regreso) |
| Un vehículo con viaje "En Curso" no admite otro | `g-trip-form.component.ts:510-522` | Opción C (dos viajes enlazados) |

---

## 3. Opciones de modelado evaluadas

### Opción A — Entidad `TripLeg` (tramos) completa

`Trip` pasa a ser el contenedor económico y cuelga de él una colección de tramos (`orden`, `origen`, `destino`, `cargado: bool`, fechas). Gastos y ubicaciones apuntan a `tripLegId`.

- ✅ Correcto a largo plazo; soporta triangulares y rutas de 3+ paradas.
- ❌ Tabla nueva, migración de todo el histórico, y toca gastos, GPS, dashboard y reportes. Mayor esfuerzo con diferencia.

### Opción B — `tripType` + tramo opcional en el gasto ← **RECOMENDADA**

El viaje sigue siendo **un registro = una unidad económica**, que es exactamente lo que describe el negocio ("el flete cubre los dos trayectos"). Se agregan pocos campos y ningún viaje histórico requiere migración (todos quedan `CARGADO` por defecto).

- ✅ Cubre los dos casos con cambios acotados.
- ✅ No rompe agregaciones existentes del dashboard.
- ✅ Deja la puerta abierta a evolucionar hacia la Opción A.
- ⚠️ No soporta rutas de más de 3 puntos (no es un requerimiento hoy).

### Opción C — Dos viajes enlazados (`parentTripId`)

El redondo se guarda como dos registros: ida con flete 0 y regreso con el flete total.

- ✅ Reutiliza todo lo existente (ETA, mapa, gastos por tramo salen gratis).
- ❌ Duplica el conteo de viajes en el dashboard.
- ❌ Obliga a repartir el flete arbitrariamente entre los dos registros.
- ❌ Hay que cerrar dos registros por operación.
- ❌ Choca con el filtro de "vehículo ocupado" (`g-trip-form.component.ts:510-522`), que impide crear el segundo viaje mientras el primero está "En Curso".

---

## 4. Diseño propuesto (Opción B)

### 4.1 Cambios de modelo

```ts
// src/app/models/trip-model.ts
export type TripType = 'CARGADO' | 'REDONDO' | 'VACIO';

export interface ModelTrip {
  // ...campos existentes
  tripType: TripType;              // default 'CARGADO'
  returnDestinationId?: string;    // solo REDONDO; por defecto = originId
  currentLeg?: 'IDA' | 'REGRESO';  // solo REDONDO; controla ETA/progreso/mapa
}
```

> **`ModelExpense` no cambia.** Por decisión D3, los gastos del viaje redondo **no se separan por tramo**: se registran contra el viaje completo, igual que hoy. Si más adelante se necesita el desglose, se agrega un campo `leg?: 'IDA' | 'REGRESO'` opcional sin migrar nada.

### 4.2 Semántica por tipo

| Tipo | `originId` | `destinationId` | `returnDestinationId` | `freight` | Gastos |
|---|---|---|---|---|---|
| `CARGADO` | Origen carga | Destino carga | — | > 0 | Del viaje |
| `REDONDO` | Donde estoy (Ipiales) | Ciudad de recogida (Cali) | Ciudad de entrega (Ipiales) | > 0, cubre ambos tramos | Del viaje completo, sin separar tramo |
| `VACIO` | Origen (Cartagena) | Destino (Barranquilla) | — | 0 | Del viaje; los asume el propietario |

### 4.3 Reglas de negocio y validación

| Campo | `CARGADO` | `REDONDO` | `VACIO` |
|---|---|---|---|
| `manifestNumber` | Obligatorio | Obligatorio | **Oculto / no requerido** |
| `loadType` | Opcional | Opcional | **Oculto** |
| `company` | Opcional | Opcional | **Oculto** |
| `freight` | Requerido, > 0 | Requerido, > 0 | **Forzado a 0, deshabilitado** |
| `advancePayment` | 0 ≤ anticipo ≤ flete | 0 ≤ anticipo ≤ flete | **Forzado a 0** |
| `balance` | `freight - advancePayment` | `freight - advancePayment` | **0** |
| `paidBalance` | Aplica | Aplica | **No aplica; oculto, nunca `true`** |
| `returnDestinationId` | — | Requerido (default = `originId`) | — |
| `destinationId ≠ originId` | Sí | Sí | Sí |

**Notas de implementación de validadores:**

- Usar `setValidators()` + `updateValueAndValidity()` al cambiar el tipo de viaje, **no** `disable()` a secas para los requeridos.
- Para `freight`/`advancePayment` en `VACIO`: `setValue(0)` + `disable({emitEvent:false})`. `onSubmit` usa `getRawValue()` (`g-trip-form.component.ts:623`), así que los campos deshabilitados siguen viajando en el payload. ✅
- `advancePaymentValidator` (`g-trip-form.component.ts:140-144`) ya tolera `0 <= 0`; añadirle que en `VACIO` ambos deban ser exactamente 0.

---

## 5. Cambios por archivo

### 5.1 Modelos

- [ ] `src/app/models/trip-model.ts` — agregar `tripType`, `returnDestinationId`, `currentLeg` y el type `TripType`.
- `src/app/models/expense-model.ts` — **sin cambios** (D3).

### 5.2 `components/g-trip-form/` — el grueso del trabajo

- [ ] Selector de **tipo de viaje** como primer control del formulario (radio group o tarjetas). Al cambiarlo, reconfigurar validadores y visibilidad.
- [ ] Validadores dinámicos según la matriz de §4.3.
- [ ] En `VACIO`: ocultar el bloque financiero completo (flete / anticipo / saldo) y el manifiesto, tipo de carga y empresa.
- [ ] En `REDONDO`: tercer selector de ciudad (`returnDestinationId`) precargado con el origen y editable (permite el triangular Ipiales → Cali → Pasto).
- [ ] Etiquetas contextuales en `REDONDO`: "Origen / Ciudad de recogida / Ciudad de entrega" + texto de ayuda *"el flete cubre ida y regreso"*.
- [ ] En `patchForm` (`:333-391`): restaurar el tipo al editar y aplicar la configuración correspondiente antes del `patchValue`.
- [ ] En `resetForm` (`:393-421`): default `tripType = 'CARGADO'`.
- [ ] `fetchNextTripNumber` (`:558-574`) **no cambia**: los viajes vacíos también consumen consecutivo por vehículo (ver decisión D1).

### 5.3 `views/trips/trip-detail/`

- [ ] `totalIncome` (`:427-433`) — sin cambio funcional (flete 0 ⇒ ingreso 0), pero la **etiqueta de UI** en `VACIO` debe leerse **"Costo del traslado"** en rojo, no "Utilidad −X".
- [ ] `profitMargin` (`:929-932`) — cortocircuitar cuando `totalIncome === 0` y no mostrar el porcentaje en `VACIO`.
- [ ] `onStatusChange` (`:435-457`) — **no** forzar `paidBalance = true` al pasar a "Completado" si `tripType === 'VACIO'`.
- [ ] Ocultar el control de saldo pagado en `VACIO`.
- [ ] Badge del tipo de viaje en el encabezado del detalle.
- [ ] `calculateETA` (`:987-1043`) y `calculateLocationProgress` (`:543-608`) — en `REDONDO` con `currentLeg === 'REGRESO'`, calcular contra `returnDestinationId` en lugar de `destinationId`.
- [ ] Botón para el conductor: **"Carga recogida — iniciar regreso"**, que cambia `currentLeg` a `'REGRESO'` y persiste el viaje. Es el único cambio de flujo operativo que introduce el redondo.
- `loadExpenses` (`:697-724`) — **sin cambios**: el total de gastos del redondo cubre los dos trayectos (D3).

### 5.4 Tarjetas

- [ ] `g-trip-card`, `g-trip-mini-card`, `g-vehicle-trip-card`, `g-vehicle-trip-exp-card`:
  - Badge de tipo de viaje.
  - Ruta como `Ipiales → Cali → Ipiales` en `REDONDO`.
  - En `VACIO`: ocultar flete/anticipo/saldo y la barra de progreso de pago. `progressPercentage` (`g-trip-card.component.ts:46-52`) devuelve 0 con flete 0 — no rompe, pero visualmente engaña.

### 5.5 Gastos — sin cambios

Por decisión D3 **no hay trabajo en el módulo de gastos**. Tanto en `VACIO` como en `REDONDO` el gasto se registra contra el viaje exactamente como hoy (`g-add-expense` ya recibe `tripId`, ver `g-add-expense.component.ts:46`).

Única verificación necesaria: que el selector de viaje del formulario de gastos liste también los viajes `VACIO` (hoy filtra por vehículo y viaje activo, no por tipo, así que debería funcionar sin tocar nada — **confirmar en pruebas**).

### 5.6 Dashboard — **riesgo silencioso**

Las agregaciones suman `t.freight || 0` como ingreso (`dashboard.component.ts:711, 798, 844`) y los gastos por `tripId` (`:713, :846`). Un viaje vacío entra con ingreso 0 y gasto real: **contablemente es correcto**, pero:

- [ ] Excluir los `VACIO` del "flete promedio por viaje" y de rankings de rentabilidad por viaje.
- [ ] Añadir KPI nuevo: **"Costo de recorridos vacíos"** = suma de gastos de los viajes `VACIO`. Es justamente la métrica que este cambio hace visible por primera vez.
  - ⚠️ **Limitación conocida (D3):** el KPI no incluye el costo de la ida vacía de los viajes redondos, porque esos gastos no se separan por tramo. Queda subestimado a propósito; documentarlo en el tooltip del indicador para no inducir a error.
- [ ] Revisar cualquier cálculo de margen que divida por ingreso, para evitar `NaN`/`Infinity`.

---

## 6. Contrato con el backend (repo externo)

La API vive fuera de este repositorio (`environment._APIUrl = https://truck.ccsoluciones.com.co`, ver `trip.service.ts:10`).

**Requerido antes de poder liberar el frontend:**

1. Columnas nuevas en `trip`: `trip_type` (default `'CARGADO'`), `return_destination_id` (nullable), `current_leg` (nullable).
2. Relajar del lado servidor la obligatoriedad de `manifestNumber` y cualquier validación de `freight > 0`.
3. Backfill: `UPDATE trip SET trip_type = 'CARGADO' WHERE trip_type IS NULL`.

La tabla `expense` **no se toca** (D3).

**No requerido:** soporte de filtro específico. `ModelFilterTable` es genérico, así que filtrar por `Filter('tripType', '=', 'VACIO')` funciona en cuanto exista la columna.

> ⚠️ **El frontend no puede salir antes que la API.** Si hiciera falta algo antes, el único atajo razonable es marcar los vacíos con `loadType = 'Vacío'` y `freight = 0` (el campo es texto libre con autocompletado, `g-trip-form.component.ts:198-213`), pero ensucia la lista de tipos de carga y no resuelve el redondo. Plan B únicamente.

---

## 7. Plan por fases

### Fase 1 — Viaje vacío (~20% del esfuerzo, valor inmediato)

Entrega visibilidad del costo de los traslados en vacío, que hoy es invisible.

- `tripType` en modelo + backend.
- Selector de tipo en el formulario + validadores condicionales.
- Ajustes de UI en detalle y tarjetas (etiqueta "Costo del traslado", ocultar bloque financiero).
- KPI de costo de recorridos vacíos.

### Fase 2 — Viaje redondo

- `returnDestinationId` + tercer selector de ciudad (entrega editable, D2).
- Ruta de 3 puntos en tarjetas y detalle.
- Sin trabajo en gastos (D3).

### Fase 3 — Tramo activo

- `currentLeg` + botón "Carga recogida — iniciar regreso".
- ETA, progreso y mapa correctos por tramo.

---

## 8. Criterios de aceptación

**Viaje vacío**

1. Puedo crear un viaje `VACIO` sin diligenciar flete, anticipo, manifiesto, tipo de carga ni empresa.
2. El formulario no permite guardar un `VACIO` con flete distinto de 0.
3. Puedo registrar gastos contra ese viaje igual que en cualquier otro.
4. El detalle muestra "Costo del traslado" con el total de gastos, no una "utilidad negativa".
5. Al completar el viaje no queda marcado como "saldo pagado".
6. El dashboard refleja los gastos del viaje vacío en costos, sin sumarlo al flete promedio.

**Viaje redondo**

7. Puedo crear un viaje `REDONDO` indicando origen, ciudad de recogida y ciudad de entrega, con un único flete.
8. La ciudad de entrega se precarga con el origen y puedo cambiarla por otra ciudad (ruta triangular).
9. Las tarjetas y el detalle muestran la ruta de tres puntos.
10. Los gastos del redondo se registran contra el viaje completo y el detalle muestra un único total.
11. Al marcar "carga recogida", el ETA y el progreso pasan a calcularse contra la ciudad de entrega.

**Regresión**

12. Los viajes existentes se siguen viendo y editando exactamente igual (quedan `CARGADO`).
13. Los totales del dashboard para viajes `CARGADO` no cambian.
14. El consecutivo por vehículo (`numberTrip`) avanza también con los viajes `VACIO` y `REDONDO`, sin saltos ni duplicados.

---

## 9. Casos de prueba sugeridos

| # | Escenario | Esperado |
|---|---|---|
| 1 | Crear `VACIO` Cartagena → Barranquilla | Guarda con `freight=0`, `balance=0`, sin manifiesto |
| 2 | Cambiar tipo de `CARGADO` a `VACIO` con flete ya digitado | Flete se pone en 0 y se deshabilita; el form queda válido |
| 3 | Cambiar de `VACIO` a `CARGADO` | Manifiesto y flete vuelven a ser obligatorios; el form queda inválido hasta diligenciarlos |
| 4 | Completar un `VACIO` | `paidBalance` sigue en `false` |
| 5 | Crear `REDONDO` Ipiales → Cali → Ipiales, flete 5.000.000 | Un solo registro, un solo flete |
| 6 | `REDONDO` con ciudad de entrega ≠ origen | Permitido (triangular) |
| 7 | Registrar dos gastos en un `REDONDO` | Ambos suman al total del viaje, sin pedir tramo |
| 8 | Marcar "carga recogida" en el redondo | ETA recalcula contra la ciudad de entrega |
| 9 | Editar un viaje histórico (sin `tripType`) | Se trata como `CARGADO`, sin cambios visibles |
| 10 | Dashboard con mezcla de los 3 tipos | Ingresos solo de cargados/redondos; gastos de los tres |

---

## 10. Decisiones tomadas

Confirmadas con negocio el 2026-08-11. No quedan decisiones abiertas para las fases 1 a 3.

| # | Decisión | Resolución | Impacto |
|---|---|---|---|
| D1 | ¿El viaje vacío consume número de viaje del vehículo? | **Sí** | `fetchNextTripNumber` (`g-trip-form.component.ts:558-574`) no se toca. El consecutivo por vehículo es continuo e incluye los tres tipos |
| D2 | ¿La ciudad de entrega del redondo puede ser distinta al origen? | **Sí**, con default = origen | Se implementa `returnDestinationId` como selector editable. Soporta rutas triangulares (Ipiales → Cali → Pasto) |
| D3 | ¿Los gastos del redondo se separan por tramo? | **No, por el momento** | `ModelExpense` y todo el módulo de gastos quedan **sin cambios**. Se pierde el desglose ida/regreso y el KPI de recorridos vacíos subestima el costo de las idas de los redondos (ver §5.6) |
| D4 | ¿El vacío se liga al viaje cargado que lo motivó? | **No: es un viaje independiente** | No se agrega `relatedTripId`. Cada viaje vacío es una unidad económica propia, con su costo imputado directamente al propietario |

### Puerta de salida si D3 cambia

Si más adelante se necesita el desglose por tramo, el camino es aditivo y no requiere migración:

1. Agregar `leg?: 'IDA' | 'REGRESO'` (nullable) a `expense` y a `ModelExpense`.
2. Mostrar el selector Ida/Regreso en `g-add-expense` solo cuando el viaje sea `REDONDO`, con default = `currentLeg`.
3. Los gastos históricos quedan con `leg = null` y se siguen contando en el total del viaje.

---

## 11. Referencias de código

| Archivo | Líneas relevantes |
|---|---|
| `src/app/models/trip-model.ts` | 4-28 (interfaz completa) |
| `src/app/models/expense-model.ts` | 1-19 |
| `src/app/components/g-trip-form/g-trip-form.component.ts` | 108-135 (FormGroup), 140-144 (validador anticipo), 333-391 (`patchForm`), 393-421 (`resetForm`), 510-522 (vehículos ocupados), 558-574 (consecutivo), 621-675 (`onSubmit`) |
| `src/app/views/trips/trip-detail/trip-detail.component.ts` | 427-433 (`totalIncome`), 435-457 (`onStatusChange`), 543-608 (progreso), 697-724 (`loadExpenses`), 924-932 (utilidad y margen), 987-1043 (ETA) |
| `src/app/components/g-trip-card/g-trip-card.component.ts` | 46-64 (progreso y montos) |
| `src/app/views/dashboard/dashboard.component.ts` | 711-714, 795-800, 841-847 (agregaciones de ingreso/gasto) |
| `src/app/services/trip.service.ts` | 10 (base path de la API) |
