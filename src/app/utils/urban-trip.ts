/**
 * Viaje urbano: origen y destino son la misma ciudad.
 *
 * En el redondo se pasa el destino de ida: volver a la ciudad de origen es lo
 * normal y no hace urbano al viaje. Se compara como texto porque los ids
 * llegan unas veces como número —del backend— y otras como cadena —del
 * buscador del formulario—.
 *
 * Un viaje urbano no tiene "Información del Trayecto": la ruta se arma entre
 * ciudades, y con la misma en los dos extremos el mapa, la distancia, el tiempo
 * y el combustible salen en cero.
 */
export function isUrbanTrip(
  originId: string | number | null | undefined,
  destinationId: string | number | null | undefined,
): boolean {
  if (!originId || !destinationId) return false;
  return String(originId) === String(destinationId);
}
