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

  getIconClass(): string {
    const type = this.notification.eventType.toUpperCase();
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
