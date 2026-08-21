import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { TokenService } from './token.service';

@Injectable({
  providedIn: 'root',
})
export class HttpHeadersInterceptor implements HttpInterceptor {
  constructor(private readonly tokenService: TokenService) {}

  intercept(
    req: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    let headers = req.headers.set('X-API-KEY', environment.subscription);

    // La API no transporta identidad por si misma: resuelve el llamante desde
    // X-USER-ID (el JWT expira a los 5 min, la cookie dura un dia).
    const userId = this.getUserId();
    if (userId) {
      headers = headers.set('X-USER-ID', userId);
    }

    return next.handle(req.clone({ headers }));
  }

  private getUserId(): string | null {
    try {
      const payload = this.tokenService.getPayload();
      const userId = payload?.nameid ?? payload?.id ?? payload?.sub;
      return userId != null && userId !== '' ? String(userId) : null;
    } catch {
      // Sin token (login) o token ilegible: la peticion sale sin identidad.
      return null;
    }
  }
}
