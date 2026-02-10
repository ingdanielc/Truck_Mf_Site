import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelUser } from 'src/app/models/user-model';

@Injectable({
  providedIn: 'root',
})
export class SecurityService {
  basePath: string = environment._APIUrl + '/security';

  constructor(private readonly http: HttpClient) {}

  getUserFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }

  createUser(user: ModelUser) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(user);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }

  getAllRoles() {
    return this.http.get<any>(`${this.basePath}/getAllRoles`);
  }

  async getHashSHA512(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
