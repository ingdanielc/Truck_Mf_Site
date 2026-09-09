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

/** Qué se está confirmando. Cada uno tiene su texto y su color. */
export type TripStatusConfirmationKind = 'completar' | 'cancelar' | 'reabrir';

/** Lo que se le muestra a quien hace el cambio, tal cual lo pide la hoja de
 *  confirmación. */
export interface TripStatusConfirmation {
  kind: TripStatusConfirmationKind;
  title: string;
  message: string;
  icon: string;
  variant: 'primary' | 'danger' | 'warning';
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * El diálogo que corresponde al cambio, o `null` si el cambio no se pregunta.
 *
 * Los tres textos viven aquí y no en cada plantilla porque el mismo cambio se
 * hace desde dos sitios —la etiqueta de la tarjeta y el selector del detalle—
 * y antes cada uno llevaba su propia cadena de condiciones: añadir un caso
 * obligaba a tocar los dos, y bastaba olvidar uno para que el mismo cambio se
 * explicara distinto según por dónde se hiciera.
 */
export function tripStatusConfirmation(
  currentStatus: string | null | undefined,
  newStatus: string,
): TripStatusConfirmation | null {
  /* Completar cierra el viaje a la edición. */
  if (newStatus === 'Completado' && currentStatus !== 'Completado') {
    return {
      kind: 'completar',
      title: '¿Completar viaje?',
      message:
        '¿Está seguro de completar el viaje? Una vez completado, no se podrán realizar más ajustes ni ediciones a la información del trayecto.',
      icon: 'fa-solid fa-circle-exclamation',
      variant: 'warning',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
    };
  }

  /* Cancelar lo saca de las cifras. */
  if (isCancelledTrip(newStatus) && !isCancelledTrip(currentStatus)) {
    return {
      kind: 'cancelar',
      title: '¿Cancelar el viaje?',
      message:
        'El viaje se da de baja: deja de contar en los totales y en los reportes, y no admitirá nuevos gastos. Se seguirá viendo en el listado, marcado en rojo.',
      icon: 'fa-solid fa-ban',
      variant: 'danger',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Volver',
    };
  }

  /* Devolver a "Pendiente" un viaje completado deshace un cobro: el saldo que
     estaba dado por recibido vuelve a deberse. Es plata, y desde la etiqueta
     de la tarjeta se llega con un solo clic. */
  if (newStatus === 'Pendiente' && currentStatus === 'Completado') {
    return {
      kind: 'reabrir',
      title: '¿El saldo sigue sin cobrarse?',
      message:
        'El viaje deja de estar completado y su saldo vuelve a contar como pendiente por cobrar: reaparecerá en el reporte de saldos hasta que se registre el pago.',
      icon: 'fa-solid fa-hand-holding-dollar',
      variant: 'warning',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar',
    };
  }

  return null;
}

/**
 * Cambios que no se guardan sin preguntar: completar cierra el viaje a la
 * edición, cancelar lo saca de las cifras y devolverlo a "Pendiente" deshace
 * un cobro. Los tres son difíciles de deshacer, y desde la lista se llega a
 * ellos con un solo clic.
 */
export function statusNeedsConfirmation(
  currentStatus: string | null | undefined,
  newStatus: string,
): boolean {
  return tripStatusConfirmation(currentStatus, newStatus) !== null;
}

/**
 * Los dos roles que responden por las cifras del viaje: son los únicos que lo
 * dan de baja y los únicos que reabren uno ya completado.
 */
const OWNER_ROLES: string[] = ['ADMINISTRADOR', 'PROPIETARIO'];

/**
 * Dar de baja un viaje lo saca de las cifras del propietario, así que la
 * decisión es suya o del administrador. El conductor gestiona el viaje —lo
 * pone en curso, lo completa, lo deja pendiente de saldo— pero no lo borra.
 */
export function canCancelTrip(userRole: string): boolean {
  return OWNER_ROLES.includes(userRole);
}

/** Si este rol puede llevar el viaje a ese estado. */
export function canSetTripStatus(status: string, userRole: string): boolean {
  return !isCancelledTrip(status) || canCancelTrip(userRole);
}

/**
 * Si este rol puede mover el viaje del estado en que está.
 *
 * Dos estados quedan cerrados al conductor: el completado, que reabren el
 * propietario y el administrador, y el cancelado, que solo mueve quien pudo
 * darlo de baja. Un conductor que no puede cancelar tampoco puede
 * descancelar; si no, la restricción se saltaría en dos pasos.
 */
export function canChangeTripStatus(
  currentStatus: string | null | undefined,
  userRole: string,
): boolean {
  if (currentStatus === 'Completado') return OWNER_ROLES.includes(userRole);
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
    /* La fecha de llegada que ya tuviera se respeta; solo se pone la de ahora
       cuando no hay ninguna. Es lo mismo que hace el detalle, donde el campo
       de fecha se rellena con `endDate` y solo cae en "hoy" si viene vacío:
       sin esto, mover a Pendiente un viaje ya cerrado le reescribía la
       llegada con la fecha del día. */
    if (!actualizado.endDate) {
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
