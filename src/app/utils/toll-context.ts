import { TollTripContext } from '../models/toll-model';

/**
 * Datos del viaje que necesita la estimación de peajes del backend.
 *
 * Las pantallas que abren el panel del trayecto arman esto una sola vez, al
 * abrirlo, en vez de exponerlo como getter: un getter devolvería un objeto nuevo
 * en cada ciclo de detección de cambios.
 */

/** Fecha en `YYYY-MM-DD`, que es como viaja la vigencia de las tarifas. */
export function toIsoDate(value?: string | Date | null): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return toIsoDate(new Date());

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Contexto a partir del viaje. `axles` es el respaldo cuando el viaje no trae
 * el vehículo anidado; el backend prefiere `vehicleId` sobre los ejes.
 */
export function tollContextFromTrip(
  trip: any,
  axles?: number | null,
): TollTripContext {
  return {
    originId: trip?.originId ?? null,
    destinationId: trip?.destinationId ?? null,
    returnDestinationId:
      trip?.tripType === 'REDONDO' ? (trip?.returnDestinationId ?? null) : null,
    vehicleId: trip?.vehicleId ?? null,
    axles: trip?.vehicle?.numberOfAxles ?? axles ?? null,
    tripType: trip?.tripType ?? null,
    tripId: trip?.id ?? null,
    travelDate: toIsoDate(trip?.startDate),
  };
}
