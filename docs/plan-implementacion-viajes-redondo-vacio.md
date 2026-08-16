# Plan de acción — Viaje Redondo y Viaje Vacío (versión detallada)

> Plan de implementación **controlado e incremental** del frontend.
> Versión compacta para seguimiento diario: [`plan-accion-frontend-compacto.md`](./plan-accion-frontend-compacto.md).
> Plan del backend: [`plan-implementacion-backend.md`](./plan-implementacion-backend.md).
> Diseño funcional de referencia: [`viajes-redondo-y-vacio.md`](./viajes-redondo-y-vacio.md).
> Stack: Angular 19.2 standalone, Karma/Jasmine, single-spa (`Truck-Mf-Site`, puerto 4202).
> Objetivo transversal: **que ningún viaje existente cambie de comportamiento en ningún punto del proceso.**

---

## 0. Principios de control

Estas cinco reglas son las que hacen que el cambio sea reversible y no toque la lógica actual. Si un paso las viola, el paso está mal planteado.

| # | Principio | Cómo se materializa |
|---|---|---|
| **P1** | **Todo es aditivo** | `tripType` es opcional y su ausencia equivale a `CARGADO`. Ningún `if` existente se modifica: la lógica nueva se agrega como rama adicional, nunca reescribiendo la actual |
| **P2** | **Interruptor de apagado** | Feature flag `features.tripTypes` en `environment*.ts`. Con el flag apagado, la app compila y se comporta **byte a byte** como hoy |
| **P3** | **Red de seguridad antes del cambio** | Los tests de caracterización del formulario y del detalle se escriben **antes** de tocar el código, describiendo lo que hace hoy |
| **P4** | **Un paso = un commit verificable** | Cada paso tiene su propia verificación y puede revertirse solo, sin arrastrar a los demás |
| **P5** | **Tolerancia al backend** | El front nunca asume que la API devuelve los campos nuevos. Si vienen `undefined`, todo se comporta como `CARGADO` |

### Estrategia de ramas

```
main
 └── feature/viajes-tipos            ← rama larga de la funcionalidad
      ├── step/0-red-seguridad
      ├── step/1-feature-flag
      ├── step/2-modelo-y-utils
      ├── step/3-formulario-vacio
      ├── step/4-detalle-vacio
      ├── step/5-tarjetas-vacio
      ├── step/6-dashboard-vacio
      ├── step/7-formulario-redondo
      ├── step/8-vistas-redondo
      └── step/9-tramo-activo
```

Cada `step/*` se integra a `feature/viajes-tipos` con PR propio. `feature/viajes-tipos` solo llega a `main` cuando la API tenga las columnas y las pruebas de regresión pasen.

> **Alternativa si prefieren no mantener rama larga:** integrar cada `step/*` directamente a `main`. Es seguro **precisamente por P2** — con el flag apagado, el código nuevo está en el bundle pero nunca se ejecuta. Recomendado si el equipo despliega seguido.

---

## FASE 1 — Viaje vacío

La fase que entrega valor por sí sola: hace visible el costo de los traslados en vacío.

---

### Paso 0 — Red de seguridad (antes de tocar nada)

**Objetivo:** dejar por escrito, en tests, cómo se comporta hoy el formulario. Si un paso posterior rompe algo, el test lo dice antes que el usuario.

Hoy no existe spec para `g-trip-form` ni para `trip-detail` (solo hay specs de servicios y pipes).

**Archivo nuevo:** `src/app/components/g-trip-form/g-trip-form.component.spec.ts`

Casos de caracterización a cubrir (describen el comportamiento **actual**, no el deseado):

- [ ] El formulario arranca inválido con los campos vacíos.
- [ ] `manifestNumber`, `originId`, `destinationId`, `freight`, `advancePayment`, `startDate`, `ownerId`, `vehicleId`, `driverId` son requeridos.
- [ ] `balance` se recalcula solo como `freight - advancePayment` al cambiar cualquiera de los dos.
- [ ] Con `advancePayment > freight` el grupo expone el error `advanceLimitExceeded`.
- [ ] `onSubmit` arma el payload con `numberOfDays: 0`, `paidBalance` heredado y **sin** `ownerId` ni `balance` (se destructuran fuera, `g-trip-form.component.ts:623`).
- [ ] En modo edición, `patchForm` deja `isModified === false` inmediatamente después de cargar.

**Archivo nuevo:** `src/app/views/trips/trip-detail/trip-detail.component.spec.ts` (mínimo)

- [ ] `totalIncome` = `freight` cuando `paidBalance === true`; `freight - balance` cuando es `false`.
- [ ] `netProfit` = `totalIncome - totalExpenses`.
- [ ] `onStatusChange('Completado')` pone `paidBalance = true`.

**Verificación:**
```bash
npm run build-test
```
Todos los tests nuevos en verde **contra el código sin modificar**. Si alguno falla aquí, el test está mal escrito — corregirlo antes de seguir.

**Commit:** `test: caracterización de g-trip-form y trip-detail previa a tipos de viaje`

---

### Paso 1 — Feature flag

**Objetivo:** poder integrar todo lo demás sin exponer nada.

**Archivos:** `src/environments/environment.ts`, `environment.dev.ts`, `environment.prod.ts`

```ts
export const environment = {
  // ...campos existentes
  features: {
    tripTypes: false,   // ← true solo cuando la API tenga las columnas
  },
};
```

⚠️ Los tres archivos deben tener la clave, aunque en `prod` arranque en `false`. Si falta en alguno, el build de esa configuración rompe.

**Verificación:** `npm run build` y `npm start` sin errores. La app se ve exactamente igual.

**Commit:** `feat: feature flag tripTypes (apagado)`

---

### Paso 2 — Modelo y utilidades centralizadas

**Objetivo:** que la pregunta "¿de qué tipo es este viaje?" se responda en **un solo lugar**, y no con `trip.tripType === 'VACIO'` regado por 8 componentes.

**Archivo:** `src/app/models/trip-model.ts`

```ts
export type TripType = 'CARGADO' | 'REDONDO' | 'VACIO';

export interface ModelTrip {
  // ...campos existentes, sin tocar
  tripType?: TripType;             // opcional: su ausencia = CARGADO (P1, P5)
  returnDestinationId?: string;
  currentLeg?: 'IDA' | 'REGRESO';
}
```

**Archivo nuevo:** `src/app/utils/trip-type.utils.ts`

```ts
import { environment } from 'src/environments/environment';
import { ModelTrip, TripType } from '../models/trip-model';

export const TRIP_TYPES: { value: TripType; label: string; icon: string }[] = [
  { value: 'CARGADO', label: 'Viaje con carga', icon: 'fa-truck' },
  { value: 'REDONDO', label: 'Viaje redondo',   icon: 'fa-rotate' },
  { value: 'VACIO',   label: 'Viaje vacío',     icon: 'fa-truck-ramp-box' },
];

/** Único punto de verdad. Sin flag o sin dato ⇒ CARGADO. */
export function getTripType(trip?: ModelTrip | null): TripType {
  if (!environment.features?.tripTypes) return 'CARGADO';
  return trip?.tripType ?? 'CARGADO';
}

export function isEmptyTrip(trip?: ModelTrip | null): boolean {
  return getTripType(trip) === 'VACIO';
}

export function isRoundTrip(trip?: ModelTrip | null): boolean {
  return getTripType(trip) === 'REDONDO';
}

/** true si el viaje genera ingreso (flete). */
export function hasFreight(trip?: ModelTrip | null): boolean {
  return getTripType(trip) !== 'VACIO';
}
```

**Por qué así:** el flag vive dentro de `getTripType`, de modo que apagarlo neutraliza la funcionalidad completa **sin tocar ningún componente**. Es el interruptor de P2 hecho código.

**Archivo nuevo:** `src/app/utils/trip-type.utils.spec.ts` — cubrir: sin flag → siempre `CARGADO`; con flag y `tripType` undefined → `CARGADO`; con flag y `'VACIO'` → `isEmptyTrip` true.

**Verificación:** `npm run build-test` en verde. Ningún componente cambió todavía.

**Commit:** `feat: modelo TripType y utilidades de tipo de viaje`

---

### Paso 3 — Formulario: soporte de viaje vacío

Es el paso de mayor riesgo. Se subdivide para poder revertir por partes.

#### 3a — Control `tripType` inerte

**Archivo:** `g-trip-form.component.ts`

- [ ] Agregar al `FormGroup`: `tripType: ['CARGADO']` (sin validadores).
- [ ] En `resetForm`, incluir `tripType: 'CARGADO'` en el objeto de reset.
- [ ] En `patchForm`, incluir `tripType: trip.tripType ?? 'CARGADO'` en el `patchValue`.

En este punto el control existe, viaja en el payload de `onSubmit` (por el spread de `formData`) y **no hace nada más**.

⚠️ **Cuidado con `isModified`:** `captureInitialState()` se llama después del patch (`:390`), así que el control nuevo entra en el snapshot inicial y no marca el formulario como modificado al abrir. Verificarlo con el test del Paso 0.

⚠️ **Backend:** hasta que la API acepte `tripType`, enviarlo puede provocar un 400 según cómo esté hecho el binding del DTO. **Validar con el equipo de API antes de este paso.** Si rechaza campos desconocidos, condicionar el envío en `onSubmit`:
```ts
if (!environment.features?.tripTypes) delete (tripData as any).tripType;
```

**Verificación:** crear y editar un viaje normal de punta a punta. El payload debe ser idéntico al actual salvo `tripType: 'CARGADO'`.

#### 3b — Motor de reglas por tipo

**Archivo:** `g-trip-form.component.ts`

Un solo método privado que concentra toda la lógica condicional:

```ts
private applyTripTypeRules(type: TripType): void {
  const isEmpty = type === 'VACIO';

  const manifest = this.tripForm.get('manifestNumber')!;
  manifest.setValidators(isEmpty ? [] : [Validators.required]);
  manifest.updateValueAndValidity({ emitEvent: false });

  const freight = this.tripForm.get('freight')!;
  const advance = this.tripForm.get('advancePayment')!;
  if (isEmpty) {
    freight.setValue(0, { emitEvent: false });
    advance.setValue(0, { emitEvent: false });
    this.tripForm.get('balance')?.setValue(0, { emitEvent: false });
    freight.clearValidators();
    advance.clearValidators();
    this.tripForm.patchValue(
      { manifestNumber: '', loadType: '', company: '' },
      { emitEvent: false },
    );
  } else {
    freight.setValidators([Validators.required, Validators.min(0), Validators.max(999999999)]);
    advance.setValidators([Validators.required, Validators.min(0), Validators.max(999999999)]);
  }
  freight.updateValueAndValidity({ emitEvent: false });
  advance.updateValueAndValidity({ emitEvent: false });
}
```

- [ ] Suscribir `tripType.valueChanges` → `applyTripTypeRules(value)`, respetando el guard `isPatching` como hacen las demás suscripciones (`:286`, `:300`).
- [ ] Llamarlo también al final de `patchForm` y `resetForm`.
- [ ] Ajustar `advancePaymentValidator` (`:140-144`) para exigir `freight === 0 && advance === 0` cuando el tipo es `VACIO`.

⚠️ **Gotcha real:** los inputs de flete y anticipo **no usan `formControlName`** — usan `[value]="getFormattedValue('freight')"` + `(input)="formatCurrencyInput(...)"` (`g-trip-form.component.html:224-239`). Por eso `disable()` sobre el control **no bloquea el input en pantalla**. La solución correcta es **ocultar el bloque financiero completo** en `VACIO`, no deshabilitarlo. Adicionalmente, blindar `formatCurrencyInput` con un `if (isEmpty) return;` al inicio.

#### 3c — HTML del formulario

**Archivo:** `g-trip-form.component.html`

- [ ] Selector de tipo como primer bloque del `offcanvas-body` (línea 6), envuelto en `@if (tripTypesEnabled) { ... }`. Con el flag apagado no se renderiza y el control queda en `'CARGADO'`.
- [ ] Envolver en `@if (!isEmptyTrip) { ... }` los bloques de: `manifestNumber` (~línea 149), `freight` (~218), `advancePayment` (~255), `balance` (~293), `loadType` (~339) y `company` (~359).
- [ ] En `VACIO`, mostrar en su lugar un aviso: *"Los gastos de este traslado los asume el propietario del vehículo."*

**Verificación del paso 3 completo (con flag encendido en local):**

| Prueba | Esperado |
|---|---|
| Crear viaje `CARGADO` | Idéntico a hoy: mismos requeridos, mismo payload |
| Crear viaje `VACIO` sin flete ni manifiesto | Guarda correctamente, `freight = 0` |
| `CARGADO` → `VACIO` con flete ya digitado | Flete pasa a 0, bloque financiero desaparece, form válido |
| `VACIO` → `CARGADO` | Flete y manifiesto vuelven a ser obligatorios; el form queda inválido hasta diligenciarlos |
| Editar un viaje histórico (sin `tripType`) | Abre como `CARGADO`, `isModified === false` al cargar |
| **Flag apagado** | El selector no aparece y el formulario se comporta exactamente como antes |

**Commits:** uno por subpaso — `feat(trip-form): control tripType`, `feat(trip-form): reglas por tipo de viaje`, `feat(trip-form): UI condicional de viaje vacío`

---

### Paso 4 — Detalle del viaje

**Archivo:** `views/trips/trip-detail/trip-detail.component.ts`

- [ ] Getter `get isEmpty(): boolean { return isEmptyTrip(this.trip); }`.
- [ ] `onStatusChange` (`:435-457`): envolver el `paidBalance = true` en `if (!this.isEmpty)`. **No borrar ni reescribir la línea existente** (P1).
- [ ] `profitMargin` (`:929-932`): retornar `0` de entrada si `this.isEmpty`, para no mostrar un porcentaje sin sentido.
- [ ] `totalIncome` y `netProfit`: **sin cambios de cálculo**. Con flete 0 ya dan el resultado correcto.

**Archivo:** `trip-detail.component.html`

- [ ] Badge del tipo de viaje en el encabezado.
- [ ] En `VACIO`, la tarjeta de utilidad (`:447`) cambia su rótulo a **"Costo del traslado"** y muestra `totalExpenses` en rojo, sin porcentaje de margen.
- [ ] Ocultar el control de saldo pagado y el bloque de flete/anticipo/saldo.

**Verificación:** abrir un viaje `CARGADO` existente → pantalla idéntica a la de antes (comparar contra captura previa). Abrir un `VACIO` → sin bloque de ingresos, con "Costo del traslado", y al completarlo `paidBalance` permanece en `false`.

**Commit:** `feat(trip-detail): soporte de viaje vacío`

---

### Paso 5 — Tarjetas de listado

**Archivos:** `g-trip-card`, `g-trip-mini-card`, `g-vehicle-trip-card`, `g-vehicle-trip-exp-card`

- [ ] Badge de tipo (solo visible si el tipo ≠ `CARGADO`, para no ensuciar la vista actual).
- [ ] En `VACIO`: ocultar flete, anticipo, saldo y la barra de progreso de pago (`g-trip-card.component.ts:46-52` devuelve 0 con flete 0 — no rompe, pero engaña visualmente).
- [ ] Mostrar en su lugar el total de gastos, si ya está disponible en la tarjeta.

**Verificación:** el listado de viajes con datos actuales se ve exactamente igual (ningún viaje tiene `tripType`, así que ningún badge aparece).

**Commit:** `feat(trips): badges y montos condicionales en tarjetas`

---

### Paso 6 — Dashboard

**Archivo:** `views/dashboard/dashboard.component.ts`

- [ ] Las sumas de ingreso (`:711`, `:798`, `:844`) **no se tocan**: un viaje vacío aporta `freight = 0`, que es lo correcto.
- [ ] Excluir los `VACIO` del flete promedio por viaje y de los rankings de rentabilidad por viaje.
- [ ] KPI nuevo **"Costo de recorridos vacíos"** = suma de gastos de los viajes `VACIO` del período.
- [ ] Tooltip del KPI documentando la limitación: no incluye la ida vacía de los viajes redondos (decisión D3).
- [ ] Revisar divisiones por ingreso para evitar `NaN` / `Infinity`.

**Verificación:** con la base actual (cero viajes vacíos), **todos los números del dashboard deben ser idénticos** a los de antes del cambio. Comparar contra capturas previas. Esta es la prueba de regresión más importante de la fase.

**Commit:** `feat(dashboard): KPI de costo de recorridos vacíos`

---

### Paso 7 — Activación

**Precondición bloqueante:** la API ya tiene `trip_type` (default `'CARGADO'`), acepta `manifestNumber` vacío y `freight = 0`, y el backfill corrió.

1. [ ] Encender `features.tripTypes` en `environment.dev.ts` y validar en el ambiente de desarrollo.
2. [ ] Ejecutar la lista completa de regresión (§ "Regresión obligatoria").
3. [ ] Encender en `environment.prod.ts`.
4. [ ] Subir versión en `package.json` (hoy `1.0.3`).
5. [ ] Monitorear el primer viaje vacío real creado en producción.

**Rollback:** poner el flag en `false` y desplegar. No requiere revertir código ni tocar la base de datos.

**Commit:** `feat: activación de tipos de viaje`

---

## FASE 2 — Viaje redondo

Arranca solo con la Fase 1 estable en producción.

### Paso 8 — Formulario del redondo

- [ ] Control `returnDestinationId` en el `FormGroup`, requerido **solo** si `tripType === 'REDONDO'` (dentro de `applyTripTypeRules`, que ya existe del Paso 3b).
- [ ] Al elegir `REDONDO`, precargar `returnDestinationId` con `originId` y mantenerlo editable (decisión D2).
- [ ] Etiquetas contextuales: "Origen / Ciudad de recogida / Ciudad de entrega".
- [ ] Texto de ayuda: *"El flete cubre ida y regreso."*
- [ ] Validar `destinationId ≠ originId`.
- [ ] Reusar el `<select>` agrupado por departamento ya existente (`groupedCities`), sin duplicar la carga de ciudades.

**Verificación:** crear el caso real Ipiales → Cali → Ipiales con flete 5.000.000, y un triangular Ipiales → Cali → Pasto.

### Paso 9 — Vistas del redondo

- [ ] Ruta de tres puntos en tarjetas y detalle (`Ipiales → Cali → Ipiales`).
- [ ] Badge de viaje redondo.
- [ ] Gastos: **sin cambios** (decisión D3).

---

## FASE 3 — Tramo activo

### Paso 10 — `currentLeg`

- [ ] Botón **"Carga recogida — iniciar regreso"** en el detalle, visible solo en `REDONDO` con estado "En Curso" y `currentLeg !== 'REGRESO'`.
- [ ] Al pulsarlo: `currentLeg = 'REGRESO'` y persistir vía `saveLogistics`.
- [ ] `calculateETA` (`:987-1043`) y `calculateLocationProgress` (`:543-608`): destino efectivo = `returnDestinationId` cuando `currentLeg === 'REGRESO'`.
- [ ] Extraer un getter `effectiveDestinationId` y usarlo en ambos métodos, en lugar de duplicar el condicional.

**Verificación:** con el tramo en `IDA`, el ETA apunta a la ciudad de recogida; tras marcar la carga recogida, apunta a la de entrega.

---

## Regresión obligatoria (antes de cada activación de flag)

Lista mínima a ejecutar sobre datos reales existentes:

1. [ ] Listado de viajes: contadores de En Curso / Completado / Pendiente iguales a los previos.
2. [ ] Crear un viaje con carga: mismos campos obligatorios, mismo payload, mismo consecutivo.
3. [ ] Editar un viaje existente: se abre con `isModified === false` y guarda sin cambios inesperados.
4. [ ] Completar un viaje con carga: `paidBalance` pasa a `true` y la fecha de llegada se calcula igual.
5. [ ] Registrar un gasto contra un viaje: sin cambios.
6. [ ] Detalle de viaje: mapa, ETA, progreso y utilidad idénticos.
7. [ ] Dashboard: todos los indicadores idénticos a la captura previa.
8. [ ] Filtro de vehículos disponibles al crear viaje: sigue excluyendo los que tienen viaje En Curso y los vendidos.
9. [ ] Roles: PROPIETARIO y CONDUCTOR ven y editan lo mismo que antes.
10. [ ] `npm run build-test` en verde.

---

## Riesgos y mitigación

| Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|
| La API rechaza el campo `tripType` desconocido | Media | Bloquea el guardado de **todos** los viajes | Validar el contrato antes del Paso 3a; envío condicionado al flag |
| `applyTripTypeRules` dispara un ciclo de `valueChanges` | Media | Formulario congelado o "modificado" al abrir | `{ emitEvent: false }` en todos los `setValue`/`updateValueAndValidity` + guard `isPatching` |
| Ocultar campos con `@if` los saca del `getRawValue()` | Baja | Payload incompleto | Los controles siguen en el `FormGroup`; `@if` solo afecta el DOM. Verificado por el test del Paso 0 sobre el payload |
| El dashboard cambia números sin viajes vacíos | Baja | Pérdida de confianza en los indicadores | Paso 6 exige comparación contra capturas previas |
| Alcance que se estira hacia la Fase 2 durante la Fase 1 | **Alta** | Se retrasa el valor entregable | Fases con PRs separados; la Fase 2 no arranca sin la 1 en producción |
| Inputs de moneda sin `formControlName` | Media | El usuario edita un flete que debía estar bloqueado | Ocultar el bloque, no deshabilitarlo; guard en `formatCurrencyInput` |

---

## Resumen de esfuerzo

| Fase | Pasos | Archivos tocados | Riesgo |
|---|---|---|---|
| **1 — Viaje vacío** | 0 a 7 | ~12 | Medio (concentrado en el formulario) |
| **2 — Viaje redondo** | 8 y 9 | ~6 | Bajo (reusa el motor de reglas de la Fase 1) |
| **3 — Tramo activo** | 10 | ~2 | Medio (toca ETA, progreso y mapa) |

**Orden no negociable:** Paso 0 antes que todo lo demás. Es lo que convierte el resto del plan en algo verificable en lugar de algo esperanzador.
