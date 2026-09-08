# Estimación de peajes — `POST /trip/tolls`

> Endpoint **desplegado y en uso**. Este documento describe el contrato real,
> verificado contra `https://truck.ccsoluciones.com.co` y `http://168.231.93.145:8089`
> el 7 de septiembre de 2026.
> Consume: `g-trip-info-card` (panel "Información del Trayecto").
> Relacionado: [`viajes-redondo-y-vacio.md`](./viajes-redondo-y-vacio.md) · [`plan-implementacion-backend.md`](./plan-implementacion-backend.md)

---

## 0. Qué resuelve

La estimación de peajes que hoy calcula Google se va lejos de lo real, por cuatro atajos que se
acumulan en `g-trip-info-card.component.ts`:

| Causa | Línea | Efecto |
|---|---|---|
| `mockTollPrice()` devuelve una constante por ejes | 268 | Todos los peajes valen lo mismo |
| Los peajes se cuentan buscando "peaje" en las instrucciones de Google | 229 | La API nueva no las garantiza: la lista queda vacía |
| Respaldo que inserta un único ítem "Peajes detectados en la ruta" | 254 | Siempre marca **1 peaje** |
| `extraComputations: ['TOLLS']` no admite ejes del vehículo | 134 | Precio de categoría liviana, no de C3/C5 |

**Regla de oro:** la fuente nueva es **aditiva**. El cálculo de Google se queda intacto y las dos
estimaciones se muestran en paralelo. La consulta al endpoint sale siempre; si falla o demora, el
bloque nuevo no se pinta y el panel se comporta exactamente como antes.

---

## 1. Endpoint

```
POST {_APIUrl}/trip/tolls
Content-Type: application/json
X-API-KEY: <environment.subscription>
```

**Mínimo para responder:** `origin`, `destination`, `vehicleId`, `travelDate`.

### Modos de resolución

El backend informa en `data.route.mode` cómo resolvió el trayecto:

| `mode` | Cuándo | Tolerancia de búsqueda | Precisión |
|---|---|---|---|
| `POLYLINE` | Llegó `route.encodedPolyline` | **2 km** alrededor del trazado | Alta: las casetas que realmente se cruzan |
| `CORRIDOR` | No llegó trazado | **30 km** alrededor de la línea recta | Baja: barre un corredor muy ancho |

> ⚠️ **El modo corredor infla el resultado.** Medido en Bogotá → Medellín sin trazado: **25 peajes**
> por $1.824.400, contra un puñado con el trazado real. El front siempre manda la polilínea cuando
> Google respondió; el corredor es solo el respaldo, y la pantalla lo rotula "estimado sin trazado".

---

## 2. Request

```jsonc
{
  // ---- Núcleo obligatorio ----
  "origin":      { "lat": 4.711, "lng": -74.072, "cityId": "11001" },
  "destination": { "lat": 6.244, "lng": -75.581, "cityId": "05001" },
  "vehicleId": 123,
  "travelDate": "2026-09-07",          // tarifa vigente a esa fecha

  // ---- Opcional ----
  "returnDestination": { "lat": 4.711, "lng": -74.072, "cityId": "11001" },  // solo REDONDO
  "tripType": "REDONDO",               // CARGADO | REDONDO | VACIO
  "tripId": 4821,
  "axles": 3,                          // respaldo si el back no resuelve el vehículo

  "route": {                           // presente ⇒ modo POLYLINE
    "provider": "GOOGLE_ROUTES",
    "encodedPolyline": "_p~iF~ps|U_ulLnnqC…",   // polyline5
    "distanceMeters": 830640,
    "legs": [
      { "index": 0, "label": "IDA",     "distanceMeters": 415320 },
      { "index": 1, "label": "REGRESO", "distanceMeters": 415320 }
    ]
  }
}
```

| Campo | Oblig. | De dónde sale en el front |
|---|---|---|
| `origin` / `destination` | Sí | Extremos de los `legs` de la ruta; `cityId` de `ModelTrip.originId` / `.destinationId` |
| `vehicleId` | Sí | `ModelTrip.vehicleId`. El back resuelve ejes y categoría contra su propia tabla |
| `travelDate` | Sí | `ModelTrip.startDate`, o la fecha de hoy |
| `returnDestination` | Redondo | `ModelTrip.returnDestinationId`. Sin esto el viaje redondo no se puede representar |
| `tripType` | Rec. | `ModelTrip.tripType` |
| `axles` | Rec. | `ModelVehicle.numberOfAxles`. Respaldo; manda `vehicleId` |
| `route.encodedPolyline` | Rec. | `route.path` de Google, codificado con `utils/polyline.ts` |

---

## 3. Comportamiento por tipo de viaje

| `tripType` | Ruta | Peajes |
|---|---|---|
| `CARGADO` | Origen → Destino | Un ítem por caseta, con `leg: null` |
| `REDONDO` | Origen → Destino → Regreso | La caseta cruzada dos veces llega **repetida**, un ítem por tramo, con `leg: "IDA"` y `leg: "REGRESO"` |
| `VACIO` | Origen → Destino | Igual que `CARGADO`: el vehículo paga peajes aunque vaya sin carga |

> El viaje vacío no tiene flete ni anticipo, así que el estimado de peajes es **costo puro**. Enviar
> `tripType` deja el dato disponible para separar después el costo de los recorridos vacíos.
> El `VACIO` nunca trae `returnDestination`.

---

## 4. Response

Mismo sobre que el resto de la API: `{ data: … }`.

```jsonc
{
  "data": {
    "route": {
      "mode": "POLYLINE",              // POLYLINE | CORRIDOR
      "provider": "GOOGLE_ROUTES",
      "distanceKm": 415.0,
      "durationMinutes": 519,
      "matchToleranceKm": 2.0
    },
    "vehicle": {
      "id": 123,
      "numberOfAxles": 6,
      "tollCategory": "VI"             // categoría resuelta por el back
    },
    "tolls": [
      {
        "id": 145,
        "name": "SIBERIA",
        "department": "Cundinamarca",
        "municipality": "Tenjo",
        "category": "VI",
        "amount": 57000,
        "categorySubstituted": false,  // true ⇒ se cotizó con una categoría inferior
        "rateStatus": "VENCIDA",       // vigencia de la tarifa aplicada
        "leg": "IDA",                  // IDA | REGRESO | null
        "distanceFromRouteKm": 0.47
      }
    ],
    "total": 57000,
    "warnings": [
      "1 peaje(s) se cotizaron con la última tarifa conocida, ya vencida a la fecha del viaje."
    ]
  }
}
```

| Campo | Uso en pantalla |
|---|---|
| `tolls.length` | El contador de peajes (pasos cobrados; el redondo cuenta doble) |
| `total` | El monto grande del bloque |
| `tolls[].name` + `municipality`/`department` | Cada fila de la lista desplegable |
| `tolls[].leg` | Etiqueta IDA / REGRESO en la fila del viaje redondo |
| `tolls[].amount` | Valor de la fila |
| `tolls[].categorySubstituted` | Nota "Cat. X sustituida" en la fila |
| `vehicle.tollCategory` + `numberOfAxles` | Subtítulo "Categoría VI · 6 ejes" |
| `route.mode` | Rótulo "estimado sin trazado" cuando no es `POLYLINE` |
| `warnings` | **No se muestran.** Hablan del estado del catálogo de peajes, no del viaje |

**Una sola tarjeta a la vez.** El panel muestra "Peajes en la Ruta" una única vez: con la respuesta
del endpoint cuando trae peajes, y con el estimado de Google en cualquier otro caso — fallo, timeout
o lista vacía. Nunca las dos, y nunca un mensaje de error: el usuario siempre ve una cifra.

---

## 5. Implementación en el front

| Archivo | Rol |
|---|---|
| `models/toll-model.ts` | Tipos del request y de la respuesta |
| `services/toll.service.ts` (+ spec) | La llamada, la caché, el timeout de 5 s y el tope de polilínea |
| `utils/polyline.ts` (+ spec) | Normaliza, simplifica y codifica `route.path` a polyline5 |
| `utils/toll-context.ts` | Arma el contexto del viaje desde `ModelTrip` |
| `g-trip-info-card` (ts + html) | La tarjeta de peajes: la del endpoint cuando responde, la de Google si no |

**Garantías de aislamiento**

- La consulta sale siempre; el front decide qué pintar con lo que llegue.
- El servicio nunca propaga errores: timeout, 500 o endpoint caído devuelven `null`.
- La consulta sale **después** de que el panel ya abrió y pintó el mapa, sin `await`.
- Se descarta con el mismo `requestId` que ya usa el panel si se cierra o se vuelve a abrir.
- Ningún otro componente lee estos campos: viajes, gastos y reportes quedan intactos.

**Costo medido** (build de producción, con y sin el cambio): `main.js` **+23 bytes**; JS total
**+9,3 KB**, todo en el chunk diferido de la vista de viajes. Tiempo de apertura del panel: sin
cambio, porque la consulta es posterior al render.

---

## 6. Pendientes del lado de los datos

Detectados al probar el endpoint con un vehículo de 6 ejes en la ruta Bogotá → Medellín:

1. **Tarifas vencidas.** Casi todas las casetas responden `rateStatus: "VENCIDA"`; el backend avisa que
   cotizó con la última tarifa conocida. Los totales quedan por debajo del real hasta que se cargue la
   vigencia del año.
2. **Categorías sin tarifa.** Varias casetas no publican tarifa para la categoría VI y se cotizan con la
   inferior más alta (`categorySubstituted: true`), lo que también deja el total corto.
3. **Casetas sin coordenadas.** Dos estaciones del catálogo no tienen lat/lng y no se pueden ubicar sobre
   la ruta: nunca aparecerán en modo `POLYLINE`.
4. **Tolerancia del corredor.** Los 30 km del modo sin trazado barren demasiado. Solo se usa como
   respaldo, pero conviene revisarla.
