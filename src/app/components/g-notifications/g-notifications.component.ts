import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GNotificationCardComponent } from '../g-notification-card/g-notification-card.component';
import { NotificationsService } from '../../services/notifications.service';
import { SecurityService } from '../../services/security/security.service';
import {
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';

@Component({
  selector: 'app-g-notifications',
  standalone: true,
  imports: [CommonModule, GNotificationCardComponent],
  templateUrl: './g-notifications.component.html',
  styleUrl: './g-notifications.component.css',
})
export class GNotificationsComponent implements OnInit {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  private readonly notificationsService = inject(NotificationsService);
  private readonly securityService = inject(SecurityService);

  notifications$ = this.notificationsService.notifications$;

  ngOnInit(): void {
    this.loadNotifications();
  }

  private loadNotifications() {
    const user = this.securityService.getUserData();
    if (!user?.id) return;

    const filter = new ModelFilterTable(
      [], // Backend should handle userId filtering based on token or we pass it
      new Pagination(20, 0),
      new Sort('date', false),
    );

    this.notificationsService.getNotificationsFilter(filter).subscribe();
  }

  onClose() {
    this.close.emit();
  }

  onMarkRead(id: number) {
    const notification = this.notificationsService.getNotificationById(id);
    if (notification) {
      this.notificationsService.markAsRead(notification).subscribe();
    }
  }

  onRemove(id: number) {
    this.notificationsService.deleteNotification(id.toString()).subscribe();
  }

  onMarkAllRead() {
    const user = this.securityService.getUserData();
    if (user?.id === undefined) return;
    this.notificationsService.markAllAsRead(user.id!.toString()).subscribe();
  }

  onClearAll() {
    if (
      confirm('¿Estás seguro de que quieres eliminar todas las notificaciones?')
    ) {
      const user = this.securityService.getUserData();
      if (user?.id === undefined) return;
      this.notificationsService.clearAll(user.id!.toString()).subscribe();
    }
  }
}
