/**
 * Codificación del trazado de una ruta al formato *polyline5* de Google, para
 * poder mandarlo al backend en el request de estimación de peajes.
 *
 * La API de rutas de JavaScript entrega el trazado como un arreglo de puntos
 * (`route.path`), no como cadena codificada: el REST devuelve
 * `polyline.encodedPolyline`, pero el envoltorio de JS no lo expone. Se codifica
 * aquí en vez de cargar la librería `geometry` del SDK, que sería otra descarga
 * justo al abrir el panel del trayecto.
 *
 * Formato: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/** Metros por grado de latitud. Alcanza para medir desvíos de decenas de metros. */
const METERS_PER_DEGREE = 111_320;

/** Desvío que se acepta al simplificar. Los peajes se cruzan con tolerancia de cientos de metros. */
export const DEFAULT_TOLERANCE_METERS = 20;

/** Tope de puntos del trazado que se envía. Una ruta de 400 km trae varios miles. */
export const DEFAULT_MAX_POINTS = 1500;

/**
 * Normaliza un punto del trazado a `{lat, lng}`.
 *
 * La API devuelve el punto de varias formas según de dónde salga: con `lat`/`lng`
 * como función, como propiedad, o como `latitude`/`longitude` dentro de `latLng`.
 */
export function normalizePoint(location: any): LatLngPoint | null {
  const point = location?.latLng ?? location;
  if (!point) return null;

  const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
  const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
  const latitude = lat ?? point.latitude;
  const longitude = lng ?? point.longitude;

  if (latitude === null || latitude === undefined) return null;
  if (longitude === null || longitude === undefined) return null;

  const values = { lat: Number(latitude), lng: Number(longitude) };
  if (Number.isNaN(values.lat) || Number.isNaN(values.lng)) return null;
  return values;
}

/** El trazado completo, ya normalizado y sin los puntos que la API no supo dar. */
export function routePathToPoints(path: any[]): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  for (const item of path ?? []) {
    const point = normalizePoint(item);
    if (point) points.push(point);
  }
  return points;
}

/**
 * Distancia del punto a la recta `start`–`end`, en metros.
 *
 * Se proyecta a un plano local antes de medir: a esta escala —desvíos de metros
 * sobre tramos de kilómetros— la diferencia contra una distancia sobre la esfera
 * es despreciable, y evita trigonometría en el ciclo caliente.
 */
function perpendicularDistance(
  point: LatLngPoint,
  start: LatLngPoint,
  end: LatLngPoint,
): number {
  const scaleLng = Math.cos((point.lat * Math.PI) / 180);

  const x = (point.lng - start.lng) * scaleLng * METERS_PER_DEGREE;
  const y = (point.lat - start.lat) * METERS_PER_DEGREE;
  const dx = (end.lng - start.lng) * scaleLng * METERS_PER_DEGREE;
  const dy = (end.lat - start.lat) * METERS_PER_DEGREE;

  const lengthSquared = dx * dx + dy * dy;
  // Tramo de longitud cero: la distancia es al propio extremo
  if (lengthSquared === 0) return Math.hypot(x, y);

  // Proyección acotada al segmento: sin el tope, un punto por fuera del tramo
  // mediría contra la recta infinita y se conservaría de más
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / lengthSquared));
  return Math.hypot(x - t * dx, y - t * dy);
}

/**
 * Quita los puntos que no cambian la forma del trazado (Douglas-Peucker).
 *
 * Se recorre con una pila y no por recursión: una ruta larga trae miles de
 * puntos y el peor caso de la versión recursiva es una pila del mismo tamaño.
 */
function douglasPeucker(
  points: LatLngPoint[],
  toleranceMeters: number,
): LatLngPoint[] {
  if (points.length <= 2) return [...points];

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const pending: [number, number][] = [[0, points.length - 1]];

  while (pending.length > 0) {
    const [first, last] = pending.pop()!;
    if (last - first < 2) continue;

    let farthest = -1;
    let maxDistance = 0;

    for (let index = first + 1; index < last; index++) {
      const distance = perpendicularDistance(
        points[index],
        points[first],
        points[last],
      );
      if (distance > maxDistance) {
        maxDistance = distance;
        farthest = index;
      }
    }

    if (maxDistance > toleranceMeters && farthest > 0) {
      keep[farthest] = true;
      pending.push([first, farthest], [farthest, last]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

/** Deja como máximo `maxPoints` repartidos parejo, conservando siempre los extremos. */
function downsample(points: LatLngPoint[], maxPoints: number): LatLngPoint[] {
  if (points.length <= maxPoints) return points;

  const step = (points.length - 1) / (maxPoints - 1);
  const result: LatLngPoint[] = [];
  for (let index = 0; index < maxPoints; index++) {
    result.push(points[Math.round(index * step)]);
  }
  return result;
}

/**
 * Simplifica el trazado hasta que quepa en `maxPoints`.
 *
 * Primero se afloja la tolerancia, que respeta la forma de la ruta; el recorte
 * parejo queda como último recurso para trazados que no ceden.
 */
export function simplifyPath(
  points: LatLngPoint[],
  toleranceMeters: number = DEFAULT_TOLERANCE_METERS,
  maxPoints: number = DEFAULT_MAX_POINTS,
): LatLngPoint[] {
  if (points.length <= 2) return [...points];

  let tolerance = Math.max(0, toleranceMeters);
  let simplified = douglasPeucker(points, tolerance);

  for (let attempt = 0; attempt < 6 && simplified.length > maxPoints; attempt++) {
    tolerance = tolerance > 0 ? tolerance * 2 : DEFAULT_TOLERANCE_METERS;
    simplified = douglasPeucker(points, tolerance);
  }

  return downsample(simplified, maxPoints);
}

/** Un valor codificado: signo en el bit bajo y grupos de cinco bits desplazados a ASCII. */
function encodeValue(value: number): string {
  let remaining = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';

  while (remaining >= 0x20) {
    encoded += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }

  return encoded + String.fromCharCode(remaining + 63);
}

/**
 * Codifica los puntos en polyline5. Cada punto se guarda como diferencia contra
 * el anterior, que es lo que hace compacta la cadena.
 *
 * Cinco decimales dan una precisión cercana al metro: de sobra frente a la
 * tolerancia de cientos de metros con la que el backend cruza los peajes.
 */
export function encodePolyline(points: LatLngPoint[]): string {
  let previousLat = 0;
  let previousLng = 0;
  let encoded = '';

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);
    encoded += encodeValue(lat - previousLat) + encodeValue(lng - previousLng);
    previousLat = lat;
    previousLng = lng;
  }

  return encoded;
}

/**
 * El trazado de una ruta, listo para el request: normalizado, simplificado y
 * codificado. Cadena vacía si la ruta no trae un trazado utilizable, y entonces
 * el backend responde por corredor en vez de por ruta.
 */
export function encodeRoutePath(
  path: any[],
  options: { toleranceMeters?: number; maxPoints?: number } = {},
): string {
  const points = routePathToPoints(path);
  if (points.length < 2) return '';

  const simplified = simplifyPath(
    points,
    options.toleranceMeters ?? DEFAULT_TOLERANCE_METERS,
    options.maxPoints ?? DEFAULT_MAX_POINTS,
  );

  return encodePolyline(simplified);
}
