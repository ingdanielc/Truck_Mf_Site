/**
 * Contrato de los reportes agregados del tablero.
 *
 * Sustituyen la carga cruda de viajes, gastos y vehículos (hasta 61.000
 * registros por entrada) por dos peticiones que ya vienen agregadas por grupo
 * y mes. Ver `docs/reportes-carga-de-datos.md`.
 */

/** Un mes de un grupo. El backend envía siempre los doce, índice 0 = enero. */
export interface DashboardMonth {
  month: number;

  /**
   * Hubo viaje o gasto en el mes. No se deduce de que los montos sean cero: un
   * mes puede cerrar en cero exacto habiendo tenido movimiento, y contarlo como
   * inactivo falsearía el mínimo y el promedio del detalle.
   */
  activity: boolean;

  /** Suma de `trip.freight` de los viajes del mes. */
  freight: number;

  /** Conteo por `trip.tripType`. Es un mapa por clave existente: un tipo nuevo
   *  no obliga a cambiar el contrato. */
  tripsByType: Record<string, number>;

  /** Gastos con `tripId` de un viaje de ESTE mes. */
  tripExpenses: number;

  /** El resto de gastos del mes, por `category.expenseTypeId`. Mantenimiento
   *  es el tipo 4 — ver `MAINTENANCE_EXPENSE_TYPE`. */
  expensesByType: Record<string, number>;
}

/** Un grupo del eje de categorías: un vehículo, un propietario o un conductor. */
export interface DashboardGroup {
  /** Identificador estable (`owner:14`, `vehicle:8`). Es lo que pide el
   *  Endpoint B; la etiqueta es solo para pintar. */
  key: string;
  label: string;
  plates?: string[];
  months: DashboardMonth[];
}

/** Viaje en curso, tal como lo resume el Endpoint A. */
export interface DashboardActiveTrip {
  tripId: number;
  numberTrip?: string;
  plate?: string;
  originId?: string;
  destinationId?: string;
  startDate?: string;
  freight?: number;
  /** Total gastado en el viaje, no el detalle. */
  expenses?: number;
}

/** Endpoint A — `GET /reports/dashboard`. */
export interface DashboardReport {
  meta?: { year: number; groupBy: string; timezone?: string };
  groups: DashboardGroup[];
  activeTrips: DashboardActiveTrip[];
}

/** Una fila del detalle de un grupo. */
export interface DashboardGroupTrip {
  id: number;
  numberTrip?: string;
  plate?: string;
  month: number;
  freight: number;
  /** Gastos con este `tripId`, fechados dentro del periodo. */
  expenses: number;
  originId?: string;
  destinationId?: string;
  loadType?: string;
  numberOfDays?: number;
}

/** Endpoint B — `GET /reports/dashboard/groups/{key}/trips`. */
export interface DashboardGroupTrips {
  group?: { key: string; label: string };
  period?: { year: number; month?: number };
  trips: DashboardGroupTrip[];
  /** Mantenimiento y gastos sin viaje del periodo. */
  otherExpenses: number;
}

/** `category.expenseTypeId` del mantenimiento, tal como lo indexa el reporte. */
export const MAINTENANCE_EXPENSE_TYPE = '4';
