import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  GNotification,
  NotificationType,
} from '../../models/g-notification.model';

@Component({
  selector: 'app-g-notification-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-notification-card.component.html',
  styleUrl: './g-notification-card.component.css',
})
export class GNotificationCardComponent {
  @Input({ required: true }) notification!: GNotification;
  @Output() markRead = new EventEmitter<number>();
  @Output() remove = new EventEmitter<number>();

  getIconClass(): string {
    switch (this.notification.eventType) {
      case NotificationType.BIRTHDAY:
        return 'fa-cake-candles text-primary';
      case NotificationType.EXPIRATION:
        return 'fa-calendar-xmark text-danger';
      case NotificationType.CREATE:
        return 'fa-circle-plus text-success';
      case NotificationType.EDIT:
        return 'fa-pen-to-square text-warning';
      default:
        return 'fa-circle-info text-info';
    }
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
