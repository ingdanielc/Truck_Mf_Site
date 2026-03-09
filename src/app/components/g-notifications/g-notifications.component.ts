import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GNotificationCardComponent } from '../g-notification-card/g-notification-card.component';
import { NotificationsService } from '../../services/notifications.service';
import { SecurityService } from '../../services/security/security.service';
import { forkJoin, Subscription, take } from 'rxjs';

@Component({
  selector: 'app-g-notifications',
  standalone: true,
  imports: [CommonModule, GNotificationCardComponent],
  templateUrl: './g-notifications.component.html',
  styleUrl: './g-notifications.component.scss',
})
export class GNotificationsComponent implements OnDestroy {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  isConfirmOpen = false;

  private readonly notificationsService = inject(NotificationsService);
  private readonly securityService = inject(SecurityService);

  private readonly userSub?: Subscription;

  notifications$ = this.notificationsService.notifications$;

  // Component methods
  onClose(): void {
    this.close.emit();
  }

  onMarkRead(id: number): void {
    const notification = this.notificationsService.getNotificationById(id);
    if (notification) {
      this.notificationsService.markAsRead(notification).subscribe();
    }
  }

  onRemove(id: number): void {
    const notification = this.notificationsService.getNotificationById(id);
    if (notification) {
      this.notificationsService.markAsDelete(notification).subscribe();
    }
  }

  onMarkAllRead(): void {
    this.notifications$.pipe(take(1)).subscribe((notifications) => {
      const unread = notifications.filter((n) => !n.isRead);
      if (unread.length === 0) return;

      const requests = unread.map((n) =>
        this.notificationsService.markAsRead(n),
      );
      forkJoin(requests).subscribe();
    });
  }

  onClearAll(): void {
    this.isConfirmOpen = true;
  }

  confirmClearAll(): void {
    this.notifications$.pipe(take(1)).subscribe((notifications) => {
      if (notifications.length === 0) {
        this.isConfirmOpen = false;
        return;
      }

      const requests = notifications.map((n) =>
        this.notificationsService.markAsDelete(n),
      );
      forkJoin(requests).subscribe(() => {
        this.isConfirmOpen = false;
      });
    });
  }

  cancelClearAll(): void {
    this.isConfirmOpen = false;
  }

  ngOnDestroy(): void {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
  }
}
