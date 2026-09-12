import {
  ApplicationConfig,
  LOCALE_ID,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withPreloading } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import {
  HTTP_INTERCEPTORS,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { APP_BASE_HREF, registerLocaleData } from '@angular/common';
import localeEsCo from '@angular/common/locales/es-CO';
import { CookieService } from 'ngx-cookie-service';

import { routes } from './app.routes';
import { PreloadMarkedStrategy } from './utils/preload-marked.strategy';
import { HttpHeadersInterceptor } from './services/utils/http-headers.service';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    /* La precarga es selectiva —ver `PreloadMarkedStrategy`—: arranca cuando
       termina una navegación y solo alcanza a las rutas marcadas, así que el
       código de Reportes baja mientras se mira el inicio en vez de al tocar
       el menú. */
    provideRouter(routes, withPreloading(PreloadMarkedStrategy)),
    provideAnimations(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: HttpHeadersInterceptor,
      multi: true,
    },
    CookieService,
    { provide: APP_BASE_HREF, useValue: '/truck' },
    { provide: LOCALE_ID, useValue: 'es-CO' },
  ],
};
