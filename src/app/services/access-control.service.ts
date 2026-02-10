import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelAccessControl } from '../models/access-control-model';

@Injectable({
  providedIn: 'root',
})
export class AccessControlService {
  basePath: string = environment._APIUrl + '/access-control';
  listAccessControl: any[] = [];

  constructor(private readonly http: HttpClient) {}

  getAccessControlFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }

  getAccessControlByPartner(partnerId: number) {
    return this.http.get<any>(
      `${this.basePath}/getAccessControlByPartner/${partnerId}`
    );
  }

  createAccessControl(accessControl: ModelAccessControl) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(accessControl);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }

  getCountAccessControlFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/count`, body, {
      headers: headers,
    });
  }
}
