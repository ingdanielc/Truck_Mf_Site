import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelNotification } from '../models/notification-model';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { GNotification } from '../models/g-notification.model';
import {
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
  notifications$ = this.notificationsSubject.asObservable();

  unreadCount$ = this.notifications$.pipe(
    map((notifications) => notifications.filter((n) => !n.isRead).length),
  );

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
    const filter = new ModelFilterTable(
      [],
      new Pagination(20, 0),
      new Sort('id', true),
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

  deleteNotification(id: string): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    return this.http.delete<any>(`${this.basePath}/${id}`, { headers }).pipe(
      tap(() => {
        const current = this.notificationsSubject.value;
        const updated = current.filter((n) => n.id !== Number(id));
        this.notificationsSubject.next(updated);
      }),
    );
  }

  markAllAsRead(userId: string): Observable<any> {
    const headers = { 'content-type': 'application/json' };

    return this.http
      .post<any>(`${this.basePath}/markAllAsRead/${userId}`, {}, { headers })
      .pipe(
        tap(() => {
          const updated = this.notificationsSubject.value.map((n) => ({
            ...n,
            isRead: true,
          }));
          this.notificationsSubject.next(updated);
        }),
      );
  }

  clearAll(userId: string): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    return this.http
      .post<any>(`${this.basePath}/clearAll/${userId}`, {}, { headers })
      .pipe(
        tap(() => {
          this.notificationsSubject.next([]);
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
