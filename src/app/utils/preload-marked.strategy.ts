import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Precarga selectiva: solo las rutas marcadas con `data: { preload: true }`.
 *
 * No se usa `PreloadAllModules` a propósito. Ese descarga los chunks de toda
 * la aplicación —gastos, vehículos, viajes, mapa— detrás de la primera
 * pantalla, y en un plan de datos móvil eso es peor que la espera que se
 * quería evitar. Aquí se paga solo por la vista que de verdad duele al
 * abrirse.
 *
 * Precargar únicamente descarga el código; el router no evalúa los guardas
 * hasta que alguien navega, así que esto no adelanta ninguna petición ni
 * cambia lo que cada rol puede abrir.
 */
@Injectable({ providedIn: 'root' })
export class PreloadMarkedStrategy implements PreloadingStrategy {
  preload(route: Route, load: () => Observable<any>): Observable<any> {
    return route.data?.['preload'] ? load() : of(null);
  }
}
