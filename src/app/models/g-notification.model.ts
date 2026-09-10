export enum NotificationType {
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  BIRTHDAY = 'BIRTHDAY',
  EXPIRATION = 'EXPIRATION',
  INFO = 'INFO',
}

export const EVENT_TRANSLATIONS: { [key: string]: string } = {
  TRIP_EVENT: 'VIAJE',
  EXPENSE_EVENT: 'GASTO',
  VEHICLE_EVENT: 'VEHÍCULO',
  DRIVER_EVENT: 'CONDUCTOR',
  OWNER_EVENT: 'PROPIETARIO',
  BIRTHDAY_EVENT: 'CUMPLEAÑOS',
  EXPIRATION_EVENT: 'VENCIMIENTO',
  SUBSCRIPTION_EVENT: 'SUSCRIPCIÓN',
  SYSTEM_EVENT: 'SISTEMA',

  /* Las tres alertas de inactividad. Cada una dice qué falta, y no solo que
     algo falta: con "INACTIVIDAD" para las tres, la tarjeta obligaba a leer el
     mensaje entero para saber de cuál de ellas se trataba. El rótulo es el
     mismo título con el que llega el push, así que el aviso del celular y el
     del panel se reconocen como el mismo. */
  EXPENSE_INACTIVITY_ALERT: 'VIAJE SIN GASTOS',
  TRIP_INACTIVITY_ALERT: 'SIN VIAJE EN CURSO',
  TRIP_STALLED_ALERT: 'VIAJE SIN CERRAR',
};

export interface GNotification {
  id: number;
  eventType: string;
  message: string;
  targetUserId?: number;
  targetRoleId: number;
  referenceId?: number;
  isRead: boolean;
  isDeleted: boolean;
  creationDate: string | Date;
  updateDate?: string | Date;
  ownerId?: number;
}
