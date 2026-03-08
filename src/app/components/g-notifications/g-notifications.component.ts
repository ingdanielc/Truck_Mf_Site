import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GNotificationCardComponent } from '../g-notification-card/g-notification-card.component';
import { NotificationsService } from '../../services/notifications.service';
import { SecurityService } from '../../services/security/security.service';
import { DriverService } from '../../services/driver.service';
import { OwnerService } from '../../services/owner.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';
import { forkJoin, Subscription, take } from 'rxjs';

@Component({
  selector: 'app-g-notifications',
  standalone: true,
  imports: [CommonModule, GNotificationCardComponent],
  templateUrl: './g-notifications.component.html',
  styleUrl: './g-notifications.component.css',
})
export class GNotificationsComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  isConfirmOpen = false;

  private readonly notificationsService = inject(NotificationsService);
  private readonly securityService = inject(SecurityService);
  private readonly driverService = inject(DriverService);
  private readonly ownerService = inject(OwnerService);

  private userSub?: Subscription;

  notifications$ = this.notificationsService.notifications$;

  ngOnInit(): void {
    // Subscribe to userData$ so we wait until user is actually loaded
    this.userSub = this.securityService.userData$.subscribe((user) => {
      if (!user?.id) return;
      this.loadNotificationsForUser(user);
    });
  }

  private loadNotificationsForUser(user: any): void {
    const role =
      user?.userRoles?.[0]?.role?.name?.toUpperCase() ||
      user?.role?.toUpperCase() ||
      '';

    if (role === 'ADMINISTRADOR') {
      // Only show global notifications (no ownerId)
      this.fetchNotifications([new Filter('owner', 'isnull', '')]);
    } else if (role === 'PROPIETARIO') {
      // Resolve owner by its own user.id
      const ownerFilter = new ModelFilterTable(
        [new Filter('user.id', '=', String(user.id))],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.ownerService.getOwnerFilter(ownerFilter).subscribe({
        next: (response: any) => {
          const owner = response?.data?.content?.[0];
          if (owner?.id) {
            this.fetchNotifications([
              new Filter('owner.id', '=', String(owner.id)),
            ]);
          }
        },
      });
    } else if (role === 'CONDUCTOR') {
      // First resolve the driver's ownerId by user.id, then filter notifications
      const driverFilter = new ModelFilterTable(
        [new Filter('user.id', '=', String(user.id))],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.driverService.getDriverFilter(driverFilter).subscribe({
        next: (response: any) => {
          const driver = response?.data?.content?.[0];
          if (driver?.ownerId) {
            this.fetchNotifications([
              new Filter('owner.id', '=', String(driver.ownerId)),
            ]);
          }
        },
      });
    }
  }

  private fetchNotifications(filters: Filter[]): void {
    const filter = new ModelFilterTable(
      filters,
      new Pagination(50, 0),
      new Sort('creationDate', false),
    );
    this.notificationsService.getNotificationsFilter(filter).subscribe();
  }
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
