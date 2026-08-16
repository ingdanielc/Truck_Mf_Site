# Plan de acción compacto — Frontend (`Truck_Mf_Site`)

> Versión resumida para seguimiento diario. Detalle completo: [`plan-implementacion-viajes-redondo-vacio.md`](./plan-implementacion-viajes-redondo-vacio.md)
> Diseño funcional: [`viajes-redondo-y-vacio.md`](./viajes-redondo-y-vacio.md) · Backend: [`plan-implementacion-backend.md`](./plan-implementacion-backend.md)

## Reglas de control

1. **Aditivo**: `tripType` es opcional; su ausencia = `CARGADO`. Ningún `if` existente se reescribe.
2. **Un solo interruptor**: flag `features.tripTypes` encapsulado en `getTripType()`. Apagado ⇒ la app se comporta como hoy. Es también el rollback.
3. **Red de seguridad primero**: los specs del Paso 0 se escriben antes de tocar código y deben pasar sin modificarlo.

**Ramas:** una por paso (`step/N-nombre`) → `feature/viajes-tipos` → `main`.

---

## Fase 1 — Viaje vacío

| # | Paso | Archivos | Qué hacer | Verificación |
|---|---|---|---|---|
| **0** | Red de seguridad | `g-trip-form.component.spec.ts` y `trip-detail.component.spec.ts` (nuevos) | Caracterizar lo actual: requeridos, `balance = freight - advance`, error `advanceLimitExceeded`, payload de `onSubmit`, `isModified === false` tras `patchForm`, `onStatusChange('Completado')` ⇒ `paidBalance = true` | `npm run build-test` verde **sin modificar código** |
| **1** | Feature flag | `environment.ts`, `.dev.ts`, `.prod.ts` | `features: { tripTypes: false }` en los **tres** | `npm run build` + app idéntica |
| **2** | Modelo y utils | `trip-model.ts`, `trip-type.utils.ts` (nuevo) + spec | Campos opcionales `tripType`, `returnDestinationId`, `currentLeg`. Utils: `getTripType()` (con el flag adentro), `isEmptyTrip()`, `isRoundTrip()`, `TRIP_TYPES` | Tests verdes; ningún componente cambió |
| **3a** | Control inerte | `g-trip-form.component.ts` | `tripType: ['CARGADO']` en el FormGroup + en `resetForm` y `patchForm` | Crear/editar viaje normal: payload idéntico salvo `tripType` |
| **3b** | Motor de reglas | `g-trip-form.component.ts` | `applyTripTypeRules(type)`: en `VACIO` quita el required de `manifestNumber`, fuerza `freight/advance/balance = 0`, limpia `loadType`/`company`. Suscribir a `tripType.valueChanges` con guard `isPatching`; invocarlo al final de `patchForm`/`resetForm`. Ajustar `advancePaymentValidator` | Alternar tipos ida y vuelta sin dejar el form inconsistente |
| **3c** | UI condicional | `g-trip-form.component.html` | Selector de tipo como primer bloque, dentro de `@if (tripTypesEnabled)`. Envolver en `@if (!isEmptyTrip)`: manifiesto (~149), flete (~218), anticipo (~255), saldo (~293), tipo carga (~339), empresa (~359). Aviso *"Los gastos los asume el propietario"* | Tabla de pruebas de abajo |
| **4** | Detalle | `trip-detail.component.ts/.html` | Getter `isEmpty`. Envolver el `paidBalance = true` de `onStatusChange` en `if (!isEmpty)`. `profitMargin` → 0 si `isEmpty`. Rótulo **"Costo del traslado"** en rojo; ocultar saldo pagado y bloque financiero. `totalIncome`/`netProfit` **sin tocar** | Viaje cargado existente: pantalla idéntica |
| **5** | Tarjetas | `g-trip-card`, `g-trip-mini-card`, `g-vehicle-trip-card`, `g-vehicle-trip-exp-card` | Badge solo si el tipo ≠ `CARGADO`. En `VACIO` ocultar flete/anticipo/saldo y la barra de progreso de pago | Listado actual sin cambios visuales |
| **6** | Dashboard | `dashboard.component.ts` | Excluir `VACIO` del flete promedio y de rankings de rentabilidad. KPI **"Costo de recorridos vacíos"** (+ tooltip con la limitación de D3). Blindar divisiones por ingreso. Las sumas de `freight` **no se tocan** | **Todos los indicadores idénticos** a captura previa |
| **7** | Activación | `environment.dev.ts` → `.prod.ts`, `package.json` | Encender flag en dev, correr regresión, encender en prod, subir versión (hoy `1.0.3`) | Requiere backend desplegado |

### Pruebas del Paso 3 (flag encendido en local)

| Caso | Esperado |
|---|---|
| Crear `CARGADO` | Idéntico a hoy |
| Crear `VACIO` sin flete ni manifiesto | Guarda con `freight = 0` |
| `CARGADO` → `VACIO` con flete digitado | Flete a 0, bloque financiero desaparece, form válido |
| `VACIO` → `CARGADO` | Flete y manifiesto vuelven a ser obligatorios |
| Editar viaje histórico (sin `tripType`) | Abre como `CARGADO`, `isModified === false` |
| **Flag apagado** | Selector invisible, comportamiento actual intacto |

---

## Fase 2 — Viaje redondo *(no arranca sin la Fase 1 en producción)*

| # | Paso | Qué hacer |
|---|---|---|
| **8** | Formulario | `returnDestinationId` requerido solo en `REDONDO` (dentro de `applyTripTypeRules`, ya existente). Precargar con `originId`, editable (D2). Etiquetas "Origen / Ciudad de recogida / Ciudad de entrega" + ayuda *"el flete cubre ida y regreso"*. Validar `destinationId ≠ originId`. Reusar `groupedCities` |
| **9** | Vistas | Ruta de tres puntos (`Ipiales → Cali → Ipiales`) en tarjetas y detalle + badge. Gastos **sin cambios** (D3) |

## Fase 3 — Tramo activo

| # | Paso | Qué hacer |
|---|---|---|
| **10** | `currentLeg` | Botón "Carga recogida — iniciar regreso" (solo `REDONDO` + En Curso). Getter `effectiveDestinationId` usado por `calculateETA` (`:987-1043`) y `calculateLocationProgress` (`:543-608`) |

---

## Trampas conocidas del código actual

| Trampa | Consecuencia | Solución |
|---|---|---|
| Los inputs de flete/anticipo **no usan `formControlName`** (`html:224-239`), sino `[value]` + `(input)` | `disable()` no bloquea el campo en pantalla | **Ocultar** el bloque, no deshabilitarlo, + `if (isEmpty) return;` al inicio de `formatCurrencyInput` |
| `applyTripTypeRules` puede disparar ciclos de `valueChanges` | Form congelado o "modificado" al abrir | `{ emitEvent: false }` en todos los `setValue`/`updateValueAndValidity` + guard `isPatching` |
| `onSubmit` destructura `{ ownerId, balance, ...formData }` (`:623`) | `balance` nunca viaja a la API | No hay que hacer nada por `balance` en `VACIO` |
| `@if` saca el control del DOM, no del `FormGroup` | Ninguna: el payload sigue completo | Cubierto por el test de payload del Paso 0 |
| `captureInitialState()` corre después del patch (`:390`) | El control nuevo no marca el form como modificado | Verificar con el test de `isModified` |

---

## Regresión obligatoria (antes de cada activación de flag)

1. Contadores En Curso / Completado / Pendiente iguales
2. Crear viaje con carga: mismos requeridos, payload y consecutivo
3. Editar viaje existente: abre con `isModified === false`
4. Completar viaje con carga: `paidBalance = true` y fecha de llegada igual
5. Registrar gasto contra un viaje: sin cambios
6. Detalle: mapa, ETA, progreso y utilidad idénticos
7. Dashboard: todos los indicadores idénticos a captura previa
8. Filtro de vehículos disponibles: sigue excluyendo En Curso y Vendidos
9. Roles PROPIETARIO y CONDUCTOR sin cambios
10. `npm run build-test` verde

**Rollback:** flag a `false` y desplegar. Sin revertir código ni tocar la base de datos.

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La API rechaza `tripType` como campo desconocido | Bloquea el guardado de **todos** los viajes | Validar el contrato antes del Paso 3a; si rechaza, borrar el campo del payload mientras el flag esté apagado |
| El dashboard cambia números sin viajes vacíos | Pérdida de confianza en los indicadores | El Paso 6 exige comparar contra capturas previas |
| El alcance se estira hacia la Fase 2 durante la Fase 1 | Retrasa el valor entregable | PRs separados; la Fase 2 no arranca sin la 1 en producción |

**Orden no negociable:** el Paso 0 va antes que todo lo demás.
