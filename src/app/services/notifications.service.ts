import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelNotification } from '../models/notification-model';

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  basePath: string = environment._APIUrl + '/notifications';

  constructor(private readonly http: HttpClient) {}

  sendMessages(modelNotification: ModelNotification) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(modelNotification);
    return this.http.post<any>(`${this.basePath}/sendMessages`, body, {
      headers: headers,
    });
  }
}
