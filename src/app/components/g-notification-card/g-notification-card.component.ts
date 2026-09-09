import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  EVENT_TRANSLATIONS,
  GNotification,
} from '../../models/g-notification.model';

@Component({
  selector: 'app-g-notification-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-notification-card.component.html',
  styleUrl: './g-notification-card.component.scss',
})
export class GNotificationCardComponent {
  @Input({ required: true }) notification!: GNotification;
  @Output() markRead = new EventEmitter<number>();
  @Output() remove = new EventEmitter<number>();

  /**
   * Ícono de las alertas de inactividad, por nombre exacto.
   *
   * Se resuelve antes que la búsqueda por texto de abajo, y ese orden es lo que
   * hace falta: las tres llevan TRIP o EXPENSE en el nombre y caerían en el
   * ícono del evento normal —el camión andando, el dinero moviéndose—, que es
   * justo lo contrario de lo que avisan. Van en ámbar porque las tres son lo
   * mismo: algo que lleva demasiado tiempo quieto y hay que mirar.
   */
  private static readonly ALERT_ICONS: Record<string, string> = {
    /* El camión parado, frente al `fa-truck-fast` del viaje en curso. */
    TRIP_INACTIVITY_ALERT: 'fa-truck text-warning',
    /* Un viaje que arrancó y no ha registrado un solo gasto. */
    EXPENSE_INACTIVITY_ALERT: 'fa-receipt text-warning',
    /* El viaje sigue abierto mucho después de lo que debía durar. */
    TRIP_STALLED_ALERT: 'fa-clock-rotate-left text-warning',
  };

  getIconClass(): string {
    const type = this.notification.eventType.toUpperCase();

    const alerta = GNotificationCardComponent.ALERT_ICONS[type];
    if (alerta) return alerta;

    if (type.includes('BIRTHDAY')) return 'fa-cake-candles text-primary';
    if (type.includes('EXPIRATION')) return 'fa-calendar-xmark text-danger';
    if (type.includes('TRIP')) return 'fa-truck-fast text-info';
    if (type.includes('EXPENSE')) return 'fa-money-bill-transfer text-success';
    if (type.includes('VEHICLE')) return 'fa-car text-secondary';
    if (type.includes('DRIVER')) return 'fa-id-card text-warning';

    return 'fa-circle-info text-info';
  }

  get translatedType(): string {
    return (
      EVENT_TRANSLATIONS[this.notification.eventType] ||
      this.notification.eventType
    );
  }

  onMarkRead() {
    if (!this.notification.isRead) {
      this.markRead.emit(this.notification.id);
    }
  }

  onRemove(event: Event) {
    event.stopPropagation();
    this.remove.emit(this.notification.id);
  }
}
