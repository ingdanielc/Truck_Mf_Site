import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelNotification } from '../models/notification-model';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { GNotification } from '../models/g-notification.model';
import { SecurityService } from './security/security.service';
import { OwnerService } from './owner.service';
import { DriverService } from './driver.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../models/model-filter-table';

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  basePath: string = environment._APIUrl + '/notifications';

  private readonly notificationsSubject = new BehaviorSubject<GNotification[]>(
    [],
  );
  notifications$ = this.notificationsSubject
    .asObservable()
    .pipe(map((notifications) => notifications.filter((n) => !n.isDeleted)));

  unreadCount$ = this.notifications$.pipe(
    map((notifications) => notifications.filter((n) => !n.isRead).length),
  );

  private readonly securityService = inject(SecurityService);
  private readonly ownerService = inject(OwnerService);
  private readonly driverService = inject(DriverService);

  constructor(private readonly http: HttpClient) {}

  getNotificationById(id: number): GNotification | undefined {
    return this.notificationsSubject.value.find((n) => n.id === id);
  }

  getNotificationsFilter(filter: ModelFilterTable): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http
      .post<any>(`${this.basePath}/filter`, body, {
        headers: headers,
      })
      .pipe(
        tap((response) => {
          if (response?.data?.content) {
            this.notificationsSubject.next(response.data.content);
          }
        }),
      );
  }

  refreshNotifications(): void {
    const user = this.securityService.getUserData();
    if (user) {
      this.loadNotificationsForUser(user);
    }
  }

  loadNotificationsForUser(user: any): void {
    if (!user) return;

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
    this.getNotificationsFilter(filter).subscribe();
  }

  markAsRead(notification: GNotification): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    const updatedNotification = { ...notification, isRead: true };
    return this.http
      .post<any>(`${this.basePath}/save`, JSON.stringify(updatedNotification), {
        headers,
      })
      .pipe(
        tap(() => {
          const current = this.notificationsSubject.value;
          const updated = current.map((n) =>
            n.id === notification.id ? { ...n, isRead: true } : n,
          );
          this.notificationsSubject.next(updated);
        }),
      );
  }

  markAsDelete(notification: GNotification): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    const updatedNotification = { ...notification, isDeleted: true };
    return this.http
      .post<any>(`${this.basePath}/save`, JSON.stringify(updatedNotification), {
        headers,
      })
      .pipe(
        tap(() => {
          const current = this.notificationsSubject.value;
          const updated = current.map((n) =>
            n.id === notification.id ? { ...n, isDeleted: true } : n,
          );
          this.notificationsSubject.next(updated);
        }),
      );
  }

  sendMessages(modelNotification: ModelNotification) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(modelNotification);
    return this.http.post<any>(`${this.basePath}/sendMessages`, body, {
      headers: headers,
    });
  }
}
