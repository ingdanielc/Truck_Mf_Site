import { Injectable } from '@angular/core';
import { CookieService } from 'ngx-cookie-service';

@Injectable({
  providedIn: 'root',
})
export class TokenService {
  constructor(private readonly cookieService: CookieService) {}

  setToken(token: string, domain: string) {
    this.cookieService.set('token', token, 1, '/', domain, false, 'Strict');
  }

  getToken(): string {
    return this.cookieService.get('token');
  }

  clearToken(): void {
    this.cookieService.delete('token', '/', '.localhost');
    this.cookieService.delete('token', '/', '.truck.ccsoluciones.com.co');
  }

  getPayload(): any {
    const payload = atob(this.getToken().split('.')[1]);
    return JSON.parse(payload);
  }
}
