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
  SYSTEM_EVENT: 'SISTEMA',
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
}
