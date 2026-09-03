# Plan de implementación — Notificaciones Push (Web Push)

> API: `https://truck.ccsoluciones.com.co` — **repositorio externo**, fuera de `Truck_Mf_Site`.
> Repos involucrados: `Truck_Mf_Single_Spa` (shell) · `Truck_Mf_Site` (MFE) · **API (backend)**

> ⚠️ **Supuesto de stack:** la API responde `{ data: { content: [], totalElements } }` (forma de `Page` de Spring Data) y autentica por headers `X-API-KEY` + `X-USER-ID`. El plan asume **Spring Boot + JPA**. Si el stack es otro, la secuencia de pasos se mantiene y solo cambia la sintaxis.

---

## 0. Objetivo y regla de oro

Entregar notificaciones **instantáneas y gratuitas** a los usuarios en su celular, incluso con la app cerrada, sin desmontar el canal de WhatsApp existente.

**Regla de oro:** el push **no reemplaza** a WhatsApp ni a la tabla `notifications`. La notificación in-app sigue siendo la **fuente de verdad**; push y WhatsApp son dos **transportes** del mismo evento. Si el push falla o el usuario no está suscrito, el sistema debe comportarse exactamente como hoy.

**Orden de despliegue:** Backend (pasos 1-4) → Shell → Site → activación de envíos (paso 5). Detalle en la sección 7.

---

## 1. Estado actual (verificado en los tres repos)

### Ya existe

| Requisito | Dónde |
|---|---|
| HTTPS en producción | `https://truck.ccsoluciones.com.co` |
| `manifest.json` con `display: standalone` e íconos 192/512 | `Truck_Mf_Single_Spa/src/manifest.json` |
| `<link rel="manifest">`, `theme-color`, `apple-touch-icon` | `Truck_Mf_Single_Spa/src/index.ejs:22-24` |
| Copia de manifest e íconos al build | `CopyWebpackPlugin` en `webpack.config.js` |
| Modelo y endpoints de notificaciones | `/notifications/filter`, `/notifications/save` |
| Tipos de evento definidos | `TRIP_EVENT`, `EXPENSE_EVENT`, `EXPIRATION_EVENT`, `BIRTHDAY_EVENT`, `TRIP_INACTIVITY_ALERT`, `SYSTEM_EVENT` |
| UI del centro de notificaciones | `g-notifications`, `g-notification-card`, badge de no leídas |
| Canal WhatsApp/Twilio | `/notifications/sendMessages` con `ModelNotification` |

### No existe

**Cero código de push o service worker en los tres repos** (verificado por búsqueda de `serviceWorker`, `pushManager`, `VAPID`, `webpush`, `PushSubscription`).

Además, hoy las notificaciones llegan por **polling cada 5 minutos** (`Truck_Mf_Site/src/app/app.component.ts:63`): un evento puede tardar hasta 5 min en aparecer, y solo si la app está abierta.

---

## 2. Cómo funciona Web Push (contexto para el back)

```
[API]  --(HTTP POST cifrado + VAPID)-->  [Push Service del navegador]
                                          FCM (Chrome/Android)
                                          Mozilla Autopush (Firefox)
                                          APNs (Safari/iOS)
                                                 |
                                                 v
                                     [Service Worker en el celular]
                                          muestra la notificación
```

Cuatro cosas que el backend debe tener claras:

1. **La API nunca habla con el celular directamente.** Habla con el push service cuya URL viene en la suscripción (`endpoint`). No hay que registrarse con Google ni Apple: el estándar Web Push con **VAPID** basta.
2. **La suscripción es por dispositivo + navegador**, no por usuario. Un usuario con celular y PC tiene dos filas.
3. **El payload va cifrado** con las llaves `p256dh` y `auth` de la suscripción. La librería lo hace; el back solo entrega el JSON.
4. **La entrega no está garantizada.** Permiso revocado, datos borrados, ahorro de batería. Por eso lo crítico sigue yendo por WhatsApp.

---

## 3. Alcance por repositorio

| Repo | Cambio | Responsable |
|---|---|---|
| **API** | Llaves VAPID, tabla `push_subscription`, 3 endpoints, servicio de envío, limpieza | Backend |
| `Truck_Mf_Single_Spa` | `sw.js` en la raíz + registro + ajuste de `start_url` | Frontend |
| `Truck_Mf_Site` | Servicio de suscripción, UI de permiso, banner iOS, quitar polling | Frontend |

---

## 4. Backend — paso a paso

### Paso 1 — Generar el par de llaves VAPID

Un único par para toda la aplicación, generado **una sola vez**. Si se pierde o se rota, **todas las suscripciones existentes quedan inválidas** y hay que re-suscribir a todos los usuarios.

```bash
# Opción A (Node, la más simple)
npx web-push generate-vapid-keys

# Opción B (OpenSSL)
openssl ecparam -genkey -name prime256v1 -out vapid_private.pem
```

- [ ] Llave **privada** en variable de entorno / secreto del servidor. **Nunca** en el repo.
- [ ] Llave **pública** expuesta al frontend (ver Paso 3, `GET /push/public-key`).
- [ ] Definir el `subject` VAPID: `mailto:soporte@ccsoluciones.com.co` (obligatorio por el estándar).
- [ ] Documentar dónde quedó respaldada la llave privada.

**Dependencias (Java/Spring Boot):**

```xml
<dependency>
  <groupId>nl.martijndwars</groupId>
  <artifactId>web-push</artifactId>
  <version>5.1.1</version>
</dependency>
<dependency>
  <groupId>org.bouncycastle</groupId>
  <artifactId>bcprov-jdk18on</artifactId>
  <version>1.78</version>
</dependency>
```

---

### Paso 2 — Tabla de suscripciones

```sql
CREATE TABLE push_subscription (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT       NOT NULL,
  endpoint          TEXT         NOT NULL,
  endpoint_hash     CHAR(64)     NOT NULL UNIQUE,  -- SHA-256 del endpoint
  p256dh            VARCHAR(255) NOT NULL,
  auth              VARCHAR(255) NOT NULL,
  user_agent        VARCHAR(300),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  creation_date     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_success_date TIMESTAMP,
  failure_count     INT          NOT NULL DEFAULT 0
);

CREATE INDEX idx_push_subscription_user ON push_subscription (user_id, is_active);
```

- [ ] **`endpoint_hash` en vez de índice único sobre `endpoint`:** los endpoints pueden superar los 500 caracteres y MySQL no indexa columnas tan largas (límite de 3072 bytes ⇒ 768 chars en utf8mb4). El hash resuelve el unique sin ese límite.
- [ ] Sin FK a `user`, para mantener la consistencia con el resto del esquema si allí tampoco se usan.
- [ ] Versionar la migración (Flyway/Liquibase) si el proyecto las usa.

**Rollback:** nadie lee la tabla hasta el Paso 5. Revertir = `DROP TABLE`.

---

### Paso 3 — Endpoints

Autenticación **igual que el resto de la API**: headers `X-API-KEY` y `X-USER-ID` (el interceptor del frontend ya los envía en toda petición — `src/app/services/utils/http-headers.service.ts`). El `userId` se resuelve del header, **no del body**.

- [ ] ⚠️ **Los tres endpoints necesitan la misma configuración de CORS que el resto de la API.** Verificado en desarrollo: `GET /push/public-key` responde sin `Access-Control-Allow-Origin` y el navegador bloquea la petición desde el front. Como el interceptor agrega headers personalizados (`X-API-KEY`, `X-USER-ID`), toda petición dispara un *preflight* `OPTIONS`, que también debe responderse.

#### `GET /push/public-key`

```json
{ "data": "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U" }
```

Permite rotar la llave sin redesplegar el frontend. Si prefieren, la llave pública puede ir fija en `environment.ts` — pero entonces rotarla exige build del front. **El frontend ya soporta ambas rutas:** usa `environment.vapidPublicKey` si está definida y, si está vacía, consulta este endpoint.

- [ ] ⚠️ **Mientras este endpoint no exista, la app no invita a nadie a activar los push.** Es deliberado: el permiso del navegador se concede una sola vez en la vida del usuario, y pedirlo sin llave VAPID lo gastaría sin que ninguna notificación pueda llegar, dejándolo bloqueado de forma irreversible. La invitación aparece sola en cuanto haya llave — por environment o por este endpoint.

#### `POST /push/subscribe`

Body — es exactamente el objeto que entrega el navegador (`PushSubscription.toJSON()`), más el user agent:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91b...",
  "keys": {
    "p256dh": "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM=",
    "auth": "tBHItJI5svbpez7KI4CCXg=="
  },
  "userAgent": "Mozilla/5.0 (Linux; Android 13; SM-A515F) ..."
}
```

Comportamiento — **upsert por `endpoint_hash`**, no insert:

- [ ] Si el `endpoint_hash` ya existe → actualizar `user_id`, `p256dh`, `auth`, `is_active = true`, `failure_count = 0`. Esto cubre el caso real de **un celular compartido** donde entra otro conductor: la suscripción se reasigna, no se duplica.
- [ ] Si no existe → insertar.
- [ ] Un usuario puede tener **N filas activas** (celular, tablet, PC). No limitar.
- [ ] Respuesta: `{ "data": { "id": 123 } }` o `{ "data": true }`, según la convención que prefieran.

#### `POST /push/unsubscribe`

```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/dQw4w9WgXcQ:APA91b..." }
```

- [ ] Marcar `is_active = false` (o borrar la fila). Se llama al cerrar sesión.
- [ ] ⚠️ **Este endpoint NO puede exigir `X-USER-ID`.** El frontend lo dispara durante el cierre de sesión, y para cuando la petición sale el token ya fue borrado: llega sin identidad. La fila se localiza por `endpoint_hash`, que es único, así que la identidad no hace falta. Si el endpoint exige el header, el `unsubscribe` falla siempre y el dispositivo sigue recibiendo notificaciones del usuario anterior.

---

### Paso 4 — Servicio de envío

Un único punto de entrada, para que ningún flujo de negocio conozca los detalles del push:

```java
pushSender.send(userId, PushPayload payload);
```

**Contrato del payload** (JSON que llega tal cual al service worker):

```json
{
  "title": "Viaje asignado",
  "body": "ABC123 · Bogotá → Medellín",
  "icon": "/assets/images/icons/iconV1-192x192.png",
  "badge": "/assets/images/icons/iconV1-192x192.png",
  "tag": "trip-1234",
  "data": {
    "notificationId": 987,
    "eventType": "TRIP_EVENT",
    "url": "/truck/site/trips/1234"
  }
}
```

Reglas del payload:

- [ ] **Máximo 4 KB cifrado.** Apuntar a **menos de 2 KB**: `title` ≤ 50 caracteres, `body` ≤ 120. Los títulos largos se truncan en el celular de todos modos.
- [ ] **`tag`** agrupa/reemplaza notificaciones del mismo objeto. Con `tag: "trip-1234"`, tres actualizaciones del mismo viaje muestran **una sola** notificación actualizada en vez de tres. Muy recomendable para `TRIP_INACTIVITY_ALERT`.
- [ ] **`data.url`** es el deep-link. Rutas reales de la app (el `basePath` es `/truck` y las vistas cuelgan de `/site`):

| Evento | `data.url` |
|---|---|
| `TRIP_EVENT` | `/truck/site/trips/{tripId}` |
| `EXPENSE_EVENT` | `/truck/site/expenses` |
| `VEHICLE_EVENT` / `EXPIRATION_EVENT` | `/truck/site/vehicles/{vehicleId}` |
| `DRIVER_EVENT` / `BIRTHDAY_EVENT` | `/truck/site/drivers/{driverId}` |
| `SYSTEM_EVENT` | `/truck/site/home` |

- [ ] **`data.notificationId`** debe ser el `id` real de la fila en `notifications`. El service worker lo usa para marcarla como leída al abrirla.

**Headers del envío:**

- [ ] `TTL`: cuánto retiene el push service el mensaje si el celular está apagado. Sugerido: `86400` (1 día) para operativos, `259200` (3 días) para vencimientos.
- [ ] `Urgency`: `high` para alertas críticas, `normal` para el resto. En `low` el celular puede retrasar la entrega hasta que salga del ahorro de batería.

---

### Paso 5 — Enganche con el flujo actual

**No crear un flujo paralelo.** Donde hoy se persiste una `GNotification`, después del commit se dispara el fan-out:

```
Evento de negocio
      │
      ├─► INSERT en notifications        (fuente de verdad — ya existe)
      │
      └─► Fan-out por canal:
            ├─ Push      → si el usuario tiene suscripción activa
            └─ WhatsApp  → según la matriz de abajo
```

**Matriz de enrutamiento por criticidad:**

| Evento | In-app | Push | WhatsApp |
|---|:---:|:---:|:---:|
| Viaje asignado / iniciado / finalizado | ✅ | ✅ | — |
| Gasto registrado | ✅ | ✅ | — |
| `TRIP_INACTIVITY_ALERT` | ✅ | ✅ | Escalamiento |
| Documento subido | ✅ | ✅ | — |
| Vencimiento a 30 / 15 / 7 días | ✅ | ✅ | — |
| **Vencimiento a 3 días y el día** | ✅ | ✅ | ✅ **siempre** |
| **Liquidación de viaje** | ✅ | ✅ | ✅ **siempre** |
| Cumpleaños | ✅ | ✅ | — |
| **Usuario sin suscripción push activa** | ✅ | — | ✅ **fallback** |

**Escalamiento (opcional, fase 2):** si una notificación marcada como crítica sigue con `isRead = false` después de N horas, disparar el WhatsApp. Baja el gasto de Twilio sin perder garantía de entrega. El campo `isRead` ya existe, no requiere esquema nuevo.

- [ ] El envío push debe ser **asíncrono** (`@Async` o cola). Nunca dentro de la transacción del evento de negocio: un push service lento no puede bloquear el guardado de un viaje.
- [ ] **Pool dedicado y acotado (10-20 hilos), no el `@Async` por defecto.** Cada usuario tiene N dispositivos ⇒ N llamadas HTTP salientes por evento. Un job de vencimientos a 500 propietarios son más de 1000 conexiones a FCM/APNs: sobre el executor por defecto de Spring, eso compite con las peticiones de los usuarios y degrada la API.
- [ ] Un fallo de push **nunca** debe revertir la transacción ni propagar excepción al flujo de negocio.

---

### Paso 6 — Limpieza de suscripciones muertas

**Este paso no es opcional.** Sin él la tabla se llena de endpoints muertos, cada envío intenta N entregas fallidas y el sistema se degrada solo.

Manejo por código de respuesta del push service:

| Código | Significado | Acción |
|---|---|---|
| `201` / `200` | Entregado al push service | `last_success_date = now()`, `failure_count = 0` |
| `404` / `410` | Suscripción expirada o revocada | **`is_active = false`** (o borrar la fila) |
| `413` | Payload muy grande | Log de error — es un bug del payload, no del usuario |
| `429` | Rate limit | Reintentar respetando el header `Retry-After` |
| `5xx` | Falla temporal del push service | Reintentar hasta 3 veces con backoff; luego `failure_count++` |

- [ ] Job de aseo: borrar filas con `is_active = false` de más de 30 días, o con `failure_count > 10`.

---

### Paso 7 — Pruebas del backend

- [ ] `POST /push/subscribe` inserta correctamente.
- [ ] `POST /push/subscribe` con el **mismo endpoint** actualiza, no duplica.
- [ ] `POST /push/subscribe` con el mismo endpoint y **otro `X-USER-ID`** reasigna el `user_id` (celular compartido).
- [ ] `POST /push/unsubscribe` desactiva.
- [ ] Envío a un usuario con 2 dispositivos llega a los 2.
- [ ] Envío a un usuario **sin** suscripciones no lanza excepción y cae al fallback de WhatsApp.
- [ ] Respuesta `410` simulada ⇒ la fila queda `is_active = false`.
- [ ] Payload de más de 4 KB ⇒ se trunca o se rechaza con log, no se cae el proceso.
- [ ] El fallo del push **no** revierte la transacción de negocio.
- [ ] Envío real a un Android físico y a un iPhone con la PWA instalada.

---

## 5. Frontend — Shell (`Truck_Mf_Single_Spa`)

### Paso 8 — `sw.js` en la raíz

**Crítico:** el archivo debe quedar en la **raíz del build** (`/sw.js`), junto al `manifest.json`. Un service worker solo controla rutas **por debajo** de su propia ubicación: si se publica en `/truck/truck-mf-site/sw.js`, **no controla `/truck/site/*`** y el push nunca llega.

- [ ] Crear `src/sw.js` con los listeners de `push` y `notificationclick`.
- [ ] Agregarlo al `CopyWebpackPlugin` del `webpack.config.js`: `{ from: "src/sw.js", to: "." }`.
- [ ] En `notificationclick`: si ya hay una pestaña de la app abierta, enfocarla y navegar a `data.url`; si no, `clients.openWindow(data.url)`.

> 🔴 **Regla dura — sin listener `fetch`.** El service worker **no debe cachear nada**. No usar `@angular/service-worker` ni Workbox: sus configuraciones por defecto interceptan `fetch` y empezarían a cachear los `main.js` de los micro-frontends, que SystemJS carga desde URLs fijas. Consecuencia: usuarios clavados en una versión vieja del MFE, sin forma de actualizar, mientras se despliega y nadie ve el cambio. El archivo es de ~30 líneas escritas a mano. **Si contiene la palabra `caches` o `fetch`, está mal.**

- [ ] **Killswitch listo desde el día uno.** Un service worker roto **persiste en el dispositivo** y borrar el archivo del servidor **no lo desinstala** — deja el viejo corriendo. Tener preparado un `sw.js` alterno que solo haga `self.registration.unregister()`, para desplegar y recuperar si algo sale mal.

### Paso 9 — Registro y `start_url`

- [ ] Registrar el SW en `src/Truck-root-config.ts`: `navigator.serviceWorker.register('/sw.js')`, con guarda de `'serviceWorker' in navigator`.
- [ ] **Verificar la CSP del `index.ejs` — no asumir.** La cadena de fallback es `worker-src` → `child-src` → **`script-src`** (no `default-src`). El `script-src` de producción **no incluye `'self'`**, pero sí `truck.ccsoluciones.com.co:*`, que cubre `/sw.js` servido por HTTPS desde ese host. Debería funcionar sin cambios; confirmarlo en la consola del navegador antes de dar el paso por cerrado.
- [ ] **`start_url`: opcional, y con orden.** Hoy es `"."`, que resuelve a `/` y obliga al redirect del root-config; `"/truck/site/home"` es mejor. **Pero el manifest no tiene campo `id`**, y cuando `id` no está, el navegador usa `start_url` como identidad de la app: cambiarlo puede dejar **dos íconos** a quien ya tenga la PWA instalada. Agregar `"id": "/"` en un despliegue previo, y cambiar `start_url` después. No es un requisito del push — si hay dudas, no tocarlo.

---

## 6. Frontend — Site (`Truck_Mf_Site`)

### Paso 10 — Servicio de suscripción

- [ ] `PushService` con `subscribe()`: pide permiso, `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, y envía el resultado a `POST /push/subscribe`.
- [ ] Convertir la llave VAPID pública de base64url a `Uint8Array` antes de pasarla.
- [ ] `unsubscribe()` al cerrar sesión (hay un flujo de cierre de sesión ya implementado — commit `4e7a2d2`).
- [ ] Re-verificar la suscripción en cada arranque: los push services la rotan silenciosamente.

### Paso 11 — UI del permiso

- [ ] **Nunca pedir el permiso al cargar la app.** Solo hay un intento por usuario: si lo bloquea, no se puede volver a pedir por código, solo desde la configuración del navegador.
- [ ] Pedirlo **en contexto**, con una tarjeta previa que explique el valor ("Recibe avisos de tus viajes al instante"), y solo tras un gesto explícito del usuario.
- [ ] Buen momento: al abrir el centro de notificaciones, o tras crear el primer viaje.

### Paso 12 — iOS

- [ ] Detectar iOS + no instalado (`navigator.standalone === false`) y mostrar un banner con las instrucciones de "Compartir → Agregar a pantalla de inicio".
- [ ] En iOS el permiso **solo puede pedirse dentro de la PWA ya instalada**, nunca desde Safari.

### Paso 13 — Retirar el polling

- [ ] Una vez el push esté verificado en producción, eliminar o alargar el `interval(300000)` de `src/app/app.component.ts:63`.
- [ ] **Dejar un refresco al volver al foreground** (evento `visibilitychange`) como red de seguridad para los push perdidos.

---

## 7. Orden de despliegue

1. **Backend** (Pasos 1-4, 6): tabla y endpoints en producción. Nadie los consume todavía. Riesgo cero.
2. **Shell** (Pasos 8-9): `sw.js` registrado. La app queda instalable, sin cambio visible.
3. **Site** (Pasos 10-12): empieza la captación de suscripciones. Las notificaciones siguen llegando por polling y WhatsApp.
4. **Esperar** a tener una masa de suscripciones (una o dos semanas).
5. **Activar el fan-out de push** (Paso 5). WhatsApp sigue intacto.
6. **Medir** entrega y lectura. Solo entonces, ajustar la matriz de canales y retirar el polling (Paso 13).

> **No negociable:** los endpoints del backend deben estar en producción antes de desplegar el Site, o el `POST /push/subscribe` devuelve 404 en cada arranque.

---

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **El SW cachea los `main.js` de los MFEs** | **Usuarios clavados en una versión vieja del micro-frontend, sin forma de actualizar** | `sw.js` **sin listener `fetch`**, escrito a mano, sin Workbox ni `@angular/service-worker` (Paso 8) |
| SW roto ya instalado en dispositivos | Borrar el archivo del servidor **no lo desinstala** | Killswitch con `unregister()` listo desde el día uno (Paso 8) |
| Cambiar `start_url` sin campo `id` | Doble ícono para quien ya instaló la PWA | Agregar `"id": "/"` en un despliegue previo, o no tocar `start_url` (Paso 9) |
| Fan-out sobre el executor por defecto | Un job masivo compite con las peticiones de usuarios y degrada la API | Pool dedicado y acotado de 10-20 hilos (Paso 5) |
| `sw.js` publicado bajo `/truck/truck-mf-site/` | El push **no funciona nunca**, sin error visible | Servirlo desde la raíz del shell (Paso 8) |
| Usuarios en iPhone que no instalan la PWA | **Cero push** para ese segmento | Banner de instalación (Paso 12) + WhatsApp como fallback obligatorio |
| Pedir el permiso al cargar la app | Bloqueo permanente, irreversible por código | Permiso en contexto, tras gesto del usuario (Paso 11) |
| Sin limpieza de suscripciones muertas | La tabla se llena, cada envío degrada | Manejo de 404/410 (Paso 6), no opcional |
| Rotar o perder la llave VAPID privada | **Todas** las suscripciones quedan inválidas | Respaldo documentado (Paso 1) |
| Envío push dentro de la transacción de negocio | Un push service lento bloquea el guardado de viajes | Envío asíncrono (Paso 5) |
| Retirar el polling antes de validar el push | Los usuarios dejan de enterarse de todo | Paso 13 solo después de medir (Paso 7.6) |
| Probar en `http://168.231.93.145` | El SW **no carga**: requiere HTTPS o localhost | Probar en localhost o contra el dominio de producción |
| Ahorro de batería agresivo (Xiaomi, Huawei, Oppo) | Entregas retrasadas horas | `Urgency: high` en lo crítico + WhatsApp para lo que no puede esperar |

---

## 9. Checklist de entrega

**Backend**
- [ ] Par VAPID generado, privada en secreto, respaldo documentado
- [ ] Migración `push_subscription` versionada y aplicada en dev
- [ ] `GET /push/public-key`, `POST /push/subscribe`, `POST /push/unsubscribe` operativos
- [ ] Upsert por `endpoint_hash` verificado (incluido el caso de celular compartido)
- [ ] `PushSenderService` asíncrono, con el contrato de payload del Paso 4
- [ ] Manejo de 404/410/429 y job de aseo
- [ ] Matriz de canales del Paso 5 implementada, con fallback a WhatsApp
- [ ] Las 10 pruebas del Paso 7 en verde

**Frontend**
- [ ] `sw.js` en la raíz del shell y registrado
- [ ] `start_url` corregido a `/truck/site/home`
- [ ] `PushService` con subscribe/unsubscribe y re-verificación al arranque
- [ ] UI de permiso en contexto, nunca al cargar
- [ ] Banner de instalación para iOS
- [ ] Verificado en Android físico y en iPhone con PWA instalada
- [ ] Polling retirado **solo después** de medir la entrega en producción
