export enum NotificationType {
  CREATE = 'CREATE',
  EDIT = 'EDIT',
  BIRTHDAY = 'BIRTHDAY',
  EXPIRATION = 'EXPIRATION',
  INFO = 'INFO',
}

export interface GNotification {
  id: number;
  eventType: string;
  message: string;
  targetUserId?: number;
  targetRoleId: number;
  referenceId?: number;
  isRead: boolean;
  creationDate: string | Date;
  updateDate?: string | Date;
}
