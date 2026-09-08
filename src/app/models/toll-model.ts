/**
 * Estimación de peajes que resuelve el backend contra su propia tabla
 * (`POST /trip/tolls`).
 *
 * Convive con el cálculo que hace Google en `g-trip-info-card`: son dos fuentes
 * distintas que se muestran en paralelo. Contrato en
 * `docs/peajes-estimacion-backend.md`.
 */

/** Un punto del trayecto. `cityId` es la llave con la que el backend resuelve el corredor. */
export interface TollPoint {
  lat: number;
  lng: number;
  cityId?: string | null;
}

/** El trazado que ya calculó el front. Sin esto el backend estima sobre la línea recta. */
export interface TollRouteRequest {
  provider: string;
  encodedPolyline: string;
  distanceMeters?: number;
}

export interface TollEstimateRequest {
  origin: TollPoint;
  destination: TollPoint;
  vehicleId?: number | null;
  travelDate: string;
  /** Solo en viajes redondos: el tercer punto de la ruta. */
  returnDestination?: TollPoint;
  tripType?: string | null;
  tripId?: number | null;
  /** Respaldo por si el backend no resuelve el vehículo. Manda `vehicleId`. */
  axles?: number | null;
  route?: TollRouteRequest;
}

/**
 * Lo que la pantalla sabe del viaje. El padre lo informa completo; los campos
 * que falten solo bajan la precisión de la respuesta.
 */
export interface TollTripContext {
  originId?: string | null;
  destinationId?: string | null;
  returnDestinationId?: string | null;
  vehicleId?: number | null;
  axles?: number | null;
  tripType?: string | null;
  tripId?: number | null;
  /** Fecha del viaje, `YYYY-MM-DD`. Define la tarifa vigente. */
  travelDate?: string | null;
}

/** Cómo resolvió el backend el trayecto. */
export interface TollRouteResult {
  /** `POLYLINE` cruza el trazado real; `CORRIDOR` estima sobre la línea recta. */
  mode?: string;
  provider?: string | null;
  distanceKm?: number;
  durationMinutes?: number;
  /** Radio con el que se buscaron las casetas: 2 km con trazado, 30 km sin él. */
  matchToleranceKm?: number;
}

export interface TollVehicleResult {
  id?: number;
  numberOfAxles?: number;
  tollCategory?: string;
}

export interface TollItem {
  id: number;
  name: string;
  department?: string;
  municipality?: string;
  category?: string;
  amount: number;
  /** La caseta no publica tarifa para la categoría: se cotizó con una inferior. */
  categorySubstituted?: boolean;
  /** `VIGENTE`, `VENCIDA`… El viaje redondo repite la caseta, una por tramo. */
  rateStatus?: string;
  /** `IDA` o `REGRESO` en el viaje redondo; nulo en los demás. */
  leg?: string | null;
  distanceFromRouteKm?: number;
}

export interface TollEstimate {
  route?: TollRouteResult;
  vehicle?: TollVehicleResult;
  /** Un ítem por paso cobrado: el redondo trae la misma caseta dos veces. */
  tolls: TollItem[];
  total: number;
  /** Avisos del backend, ya redactados. */
  warnings?: string[];
}
