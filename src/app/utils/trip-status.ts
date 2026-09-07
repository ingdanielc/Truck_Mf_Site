import { Filter } from '../models/model-filter-table';
import { ModelTrip } from '../models/trip-model';

/**
 * "Cancelado" es la baja lógica de un viaje: se creó mal, era una prueba o
 * nunca llegó a salir.
 *
 * La fila se conserva —el histórico no se reescribe y el viaje se sigue viendo
 * en el listado, en rojo— pero deja de existir para cualquier cifra: no suma en
 * los contadores, no entra en los reportes y no admite gastos nuevos.
 */
export const CANCELLED_TRIP_STATUS = 'Cancelado';

/**
 * Acepta las dos variantes que devuelve el backend. El resto de comparaciones
 * de estado del cliente hacen lo mismo ('COMPLETED' junto a 'COMPLETADO'), y
 * una baja lógica que no se reconozca vuelve a contar en los reportes.
 */
export function isCancelledTrip(status?: string | null): boolean {
  const normalizado = (status || '').toUpperCase();
  return normalizado === 'CANCELADO' || normalizado === 'CANCELLED';
}

/**
 * Excluye las bajas lógicas de una consulta a `/trip/filter`.
 *
 * Se resuelve en el servidor y no en la respuesta: los contadores piden
 * `pageSize = 1` y leen `totalElements`, así que filtrar después no serviría de
 * nada —la cifra ya vendría contaminada.
 */
export function excludeCancelledFilter(): Filter {
  return new Filter('status', '!=', CANCELLED_TRIP_STATUS);
}

/** Los cuatro estados de un viaje, en el orden en que se ofrecen. */
export const TRIP_STATUSES = [
  'En Curso',
  'Completado',
  'Cancelado',
  'Pendiente',
] as const;

/**
 * Estados que cierran el viaje: al entrar en uno se fija la fecha de fin y se
 * recalculan los días. Los tres coinciden con los que ya trataba el detalle.
 */
const CLOSING_STATUSES: string[] = ['Completado', 'Cancelado', 'Pendiente'];

/**
 * Cambios que no se guardan sin preguntar: completar cierra el viaje a la
 * edición y cancelar lo saca de las cifras. Los dos son difíciles de deshacer,
 * y desde la lista se llega a ellos con un solo clic.
 */
export function statusNeedsConfirmation(
  currentStatus: string | null | undefined,
  newStatus: string,
): boolean {
  if (newStatus === 'Completado') return currentStatus !== 'Completado';
  if (isCancelledTrip(newStatus)) return !isCancelledTrip(currentStatus);
  return false;
}

/**
 * Dar de baja un viaje lo saca de las cifras del propietario, así que la
 * decisión es suya o del administrador. El conductor gestiona el viaje —lo
 * pone en curso, lo completa, lo deja pendiente de saldo— pero no lo borra.
 */
export function canCancelTrip(userRole: string): boolean {
  return userRole === 'ADMINISTRADOR' || userRole === 'PROPIETARIO';
}

/** Si este rol puede llevar el viaje a ese estado. */
export function canSetTripStatus(status: string, userRole: string): boolean {
  return !isCancelledTrip(status) || canCancelTrip(userRole);
}

/**
 * Si este rol puede mover el viaje del estado en que está.
 *
 * Dos estados quedan cerrados: el completado, que solo reabre el
 * administrador, y el cancelado, que solo mueve quien pudo darlo de baja. Un
 * conductor que no puede cancelar tampoco puede descancelar; si no, la
 * restricción se saltaría en dos pasos.
 */
export function canChangeTripStatus(
  currentStatus: string | null | undefined,
  userRole: string,
): boolean {
  if (currentStatus === 'Completado') return userRole === 'ADMINISTRADOR';
  if (isCancelledTrip(currentStatus)) return canCancelTrip(userRole);
  return true;
}

/**
 * Aplica un cambio de estado sobre una copia del viaje, con los efectos que
 * arrastra: el saldo que se da por pagado y la fecha de fin.
 *
 * Es la versión sin fecha de llegada editable —la de la lista—, equivalente a
 * lo que hace el detalle cuando se deja la fecha que viene propuesta. El
 * detalle conserva su camino porque allí esa fecha sí se puede mover.
 */
export function applyTripStatusChange(
  trip: ModelTrip,
  newStatus: string,
  now: Date = new Date(),
): ModelTrip {
  const actualizado: ModelTrip = { ...trip, status: newStatus };

  if (newStatus === 'Completado') {
    actualizado.paidBalance = true;
  } else if (newStatus === 'Pendiente') {
    actualizado.paidBalance = false;
  }

  if (CLOSING_STATUSES.includes(newStatus)) {
    /* Completado y Pendiente marcan la llegada ahora. La baja lógica respeta
       la fecha que ya tuviera: no reescribe el cierre de un viaje que sí
       ocurrió y que solo despues se dio de baja. */
    if (!isCancelledTrip(newStatus) || !actualizado.endDate) {
      actualizado.endDate = now.toISOString();
    }

    if (actualizado.startDate && actualizado.endDate) {
      const inicio = new Date(actualizado.startDate);
      const fin = new Date(actualizado.endDate);
      const diff = Math.abs(fin.getTime() - inicio.getTime());
      actualizado.numberOfDays = Math.max(
        1,
        Math.ceil(diff / (1000 * 60 * 60 * 24)),
      );
    }
  }

  return actualizado;
}
