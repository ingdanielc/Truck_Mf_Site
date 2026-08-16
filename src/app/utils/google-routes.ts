/**
 * Acceso a la API moderna de rutas de Google Maps
 * (`google.maps.routes.Route.computeRoutes`), que reemplaza a
 * `google.maps.DirectionsService`, obsoleto desde el 25 de febrero de 2026.
 *
 * Guía de migración:
 * https://developers.google.com/maps/documentation/javascript/routes/routes-js-migration
 */

/** Campos del `Route` que se pueden pedir en el field mask. */
export type RouteField =
  | 'path'
  | 'legs'
  | 'distanceMeters'
  | 'durationMillis'
  | 'staticDurationMillis'
  | 'viewport'
  | 'travelAdvisory'
  | 'speedPaths';

export interface ComputeRouteRequest {
  origin: any;
  destination: any;
  /** Paradas intermedias. Reemplaza a `waypoints` del servicio anterior. */
  intermediates?: any[];
  travelMode?: string;
  routingPreference?: string;
  extraComputations?: string[];
  /** Obligatorio: sin field mask la API rechaza la petición. */
  fields: RouteField[];
}

let routesLibraryPromise: Promise<any> | null = null;

/**
 * Resuelve la clase `Route`, cargando la librería `routes` bajo demanda.
 * Devuelve `null` si el SDK de Maps no está disponible en la página.
 */
export async function getRouteClass(): Promise<any> {
  const maps = (globalThis as any).google?.maps;
  if (!maps) return null;

  // Ya disponible: el SDK cargó la librería de rutas
  if (maps.routes?.Route) return maps.routes.Route;

  if (typeof maps.importLibrary !== 'function') return null;

  routesLibraryPromise ??= maps.importLibrary('routes');
  try {
    const library = await routesLibraryPromise;
    return library?.Route ?? maps.routes?.Route ?? null;
  } catch (error) {
    // Se limpia para permitir un reintento posterior
    routesLibraryPromise = null;
    console.error(
      'No se pudo cargar la librería "routes" de Google Maps:',
      error,
    );
    return null;
  }
}

/**
 * Ejecuta `computeRoutes` y devuelve la primera ruta, o `null` si la API no
 * está disponible o no encontró rutas.
 */
export async function computeRoute(request: ComputeRouteRequest): Promise<any> {
  const Route = await getRouteClass();
  if (!Route) return null;

  const response = await Route.computeRoutes(request);
  return response?.routes?.[0] ?? null;
}

/** Distancia total de la ruta en kilómetros. */
export function routeDistanceKm(route: any): number {
  return route?.distanceMeters ? route.distanceMeters / 1000 : 0;
}

/**
 * Duración de la ruta en segundos.
 *
 * `durationMillis` considera el tráfico cuando se pide `TRAFFIC_AWARE`;
 * `staticDurationMillis` es la duración sin tráfico.
 */
export function routeDurationSeconds(
  route: any,
  options: { withTraffic?: boolean } = {},
): number {
  const withTraffic = options.withTraffic ?? true;
  const millis = withTraffic
    ? (route?.durationMillis ?? route?.staticDurationMillis)
    : (route?.staticDurationMillis ?? route?.durationMillis);
  return millis ? Math.round(millis / 1000) : 0;
}

/**
 * Costo estimado de peajes de la ruta. Requiere `TOLLS` en
 * `extraComputations` y `travelAdvisory` en el field mask.
 * Devuelve 0 si la API no reportó peajes.
 */
export function routeTollCost(route: any): number {
  const sumPrices = (tollInfo: any): number => {
    if (!tollInfo) return 0;
    const prices =
      tollInfo.estimatedPrices ??
      (tollInfo.estimatedPrice ? [tollInfo.estimatedPrice] : []);
    let total = 0;
    for (const price of prices) {
      total += Number(price?.units ?? 0) + Number(price?.nanos ?? 0) / 1e9;
    }
    return total;
  };

  // El resumen de la ruta ya viene totalizado; si no está, se suman los tramos
  const routeLevel = sumPrices(route?.travelAdvisory?.tollInfo);
  if (routeLevel > 0) return Math.round(routeLevel);

  let legLevel = 0;
  for (const leg of route?.legs ?? []) {
    legLevel += sumPrices(leg?.travelAdvisory?.tollInfo);
  }
  return Math.round(legLevel);
}
