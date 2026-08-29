# Reportes — carga de datos

Insumo para backend. Reemplaza la carga actual del tablero
(`src/app/views/dashboard/`) por dos endpoints. Todo lo que se pide aquí sale de
entidades y campos **que ya existen** (`trip`, `expense`, `vehicle`, `owner`).

---

## 1. Situación actual

Hasta 8 peticiones y ~61.000 registros por carga:

| Petición | Volumen |
| --- | --- |
| `GET /owner` por `user.id` (propietario) | 1 — serial |
| `GET /driver` + `GET /vehicle` (conductor) | 1 + 3.000 — dos seriales |
| `GET /owner` catálogo (administrador) | 500 — serial |
| `GET /trip` del año | **20.000** |
| `GET /expense` del año | **20.000** |
| `GET /vehicle` | **20.000** |
| `GET /trip` activos (`status = 'En Curso'`) | 1.000 |

Las cuatro últimas van en paralelo; el resto no. El filtrado por rol y las nueve
agregaciones ocurren en el navegador.

---

## 2. Endpoint A — carga del tablero

```
GET /api/reports/dashboard?year=2026&groupBy=owner&ownerId=14
```

Único request de la carga inicial. Reemplaza las tres consultas de 20.000, los
viajes activos, el catálogo de propietarios y las resoluciones seriales.

- `year` — obligatorio.
- `groupBy` — `vehicle` | `owner` | `driver`. Si se omite, lo decide el rol.
- `ownerId` — opcional, solo administrador filtrando por propietario.

El **alcance sale del token**, no de los parámetros: el propietario ve sus
vehículos, el conductor los que tenga como `currentDriverId`, el administrador
todos.

```jsonc
{
  "meta": { "year": 2026, "groupBy": "owner", "timezone": "America/Bogota" },

  "groups": [{
    "key": "owner:14",
    "label": "Enrique Castro Solís",
    "plates": ["HTM-123", "WRT-455"],

    "months": [{                    // SIEMPRE 12, índice 0 = enero
      "month": 0,
      "activity": true,             // hubo viaje o gasto; no se deduce de que los montos sean 0
      "freight": 42800000,          // suma de trip.freight
      "tripsByType": { "CARGADO": 9, "REDONDO": 2, "VACIO": 1 },
      "tripExpenses": 11200000,     // gastos con tripId de un viaje de ESTE mes
      "expensesByType": { "4": 3100000, "7": 450000 }  // resto, por category.expenseTypeId
    }]
  }],

  "activeTrips": [{
    "tripId": 8891, "numberTrip": "45", "plate": "HTM-123",
    "originId": "…", "destinationId": "…",
    "startDate": "2026-08-26T06:30:00", "freight": 3800000, "expenses": 940000
  }]
}
```

### Por qué mapas y no campos fijos

`tripsByType` y `expensesByType` son mapas por clave existente
(`trip.tripType`, `category.expenseTypeId`), no campos con nombre. Así, **un
tipo de viaje o de gasto nuevo no obliga a desplegar backend** — ya pasó una vez
al agregar Redondo y Vacío.

Los gastos van en dos cubetas separadas —los de viaje y el resto por tipo—
porque el detalle por viaje solo puede imputar por `tripId`, y el mantenimiento
no pertenece a ningún viaje. Separarlos en origen es lo que permite que los pies
de las tarjetas cuadren con la barra desde la que se abren.

### Tamaño

40 propietarios × 12 meses × ~10 valores ≈ 4.800 números: unos 80 KB sin
comprimir, ~10 KB con gzip.

---

## 3. Endpoint B — detalle de un grupo

```
GET /api/reports/dashboard/groups/{key}/trips?year=2026&month=7
```

Se pide **solo al tocar una barra**, nunca en la carga. Sin `month`, devuelve el
año completo.

```jsonc
{
  "group": { "key": "owner:14", "label": "Enrique Castro Solís" },
  "period": { "year": 2026, "month": 7 },

  "trips": [{
    "id": 8891, "numberTrip": "45", "plate": "HTM-123", "month": 7,
    "freight": 3800000,
    "expenses": 940000,        // gastos con este tripId, fechados dentro del periodo
    "originId": "…", "destinationId": "…",
    "loadType": "…", "numberOfDays": 3
  }],

  "otherExpenses": 850000      // mantenimiento y gastos sin viaje del periodo
}
```

`originId`, `destinationId`, `loadType` y `numberOfDays` ya existen en `trip`.
Incluirlos ahora habilita detalles por ruta o por duración sin volver a tocar el
backend.

---

## 4. Qué queda libre y qué no

| Sin tocar el back | Requiere backend |
| --- | --- |
| Margen %, utilidad por viaje, gasto promedio, % de viajes vacíos | Dimensiones fuera de `groupBy` (ruta, `company`, marca) |
| Acumulados, rankings, comparativos entre meses, trimestres | Granularidad diaria o semanal |
| Orden, colores, tipo de gráfica, títulos, qué se oculta por alcance | Medidas nuevas (`advancePayment`, `balance`, `paidBalance`) |
| Tipos de viaje y de gasto nuevos (van en los mapas) | |

**No retirar los endpoints de filtro actuales**: quedan como vía de escape para
el reporte que se salga de este vocabulario.

---

## 5. Reglas de negocio a replicar

Hoy solo viven en el cliente. Cualquier diferencia mueve cifras que el usuario
ya conoce.

| Concepto | Definición |
| --- | --- |
| Dimensión del eje | rol contiene `ADMINISTRADOR` → propietario; otro → vehículo |
| Propietario de un viaje | `trip.driver.ownerId ?? trip.vehicle.owners[0].ownerId` |
| Vehículo de un gasto | `expense.vehicleId` — no hay otra vía |
| Fecha del viaje | `trip.startDate`, hora local |
| Fecha del gasto | `expense.creationDate`, hora local — **ver 6.1** |
| Viaje vacío | `tripType = 'VACIO'`; nulo o desconocido cuenta como `CARGADO` |
| Mantenimiento | `category.expenseTypeId = 4` |
| Gasto de viaje | `expense.tripId` apunta a un viaje **del mismo periodo** |
| Viajes activos | `status = 'En Curso'`, sin filtro de fecha |
| Grupo sin movimiento | aparece en cero; no se omite del eje |

---

## 6. Decisiones abiertas

**6.1 `creationDate` contra `expenseDate`.** Hoy el servidor filtra el año por
`expenseDate` y el cliente agrupa por `creationDate`. Un gasto de diciembre
registrado en enero entra en un lote y se contabiliza en otro mes. El endpoint
debe elegir uno; `expenseDate` es el semánticamente correcto, pero cambia cifras
ya vistas.

**6.2 Zona horaria.** Agregar en `America/Bogota`. Agrupando en UTC, los viajes
del último día del mes a partir de las 19:00 se corren al mes siguiente.

**6.3 Nombres de rol.** El cliente detecta el rol con
`includes('ADMINISTRADOR')`. Conviene exponer un identificador estable en lugar
de comparar cadenas.

---

## 7. Migración

A y B son independientes. Se puede empezar por **A** —que es el que elimina los
61.000 registros— y dejar el drill-down calculándose en cliente hasta que B
esté listo, porque el detalle solo se abre bajo demanda y trabaja sobre datos ya
cargados.
