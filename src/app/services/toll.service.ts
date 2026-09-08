import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, Observable, of, tap, timeout } from 'rxjs';
import { environment } from 'src/environments/environment';
import { TollEstimate, TollEstimateRequest } from '../models/toll-model';

/**
 * Estimación de peajes contra la tabla del backend (`POST /trip/tolls`).
 *
 * Nunca propaga errores: si el endpoint falla, demora o está apagado devuelve
 * `null` y la pantalla se comporta como antes de existir esta fuente. Contrato
 * en `docs/peajes-estimacion-backend.md`.
 */
@Injectable({
  providedIn: 'root',
})
export class TollService {
  private readonly basePath: string = environment._APIUrl + '/trip';

  /**
   * Respuestas ya resueltas. Reabrir el mismo viaje no vuelve a consultar: el
   * panel se abre y se cierra seguido, y la estimación no cambia entre aperturas.
   */
  private readonly cache = new Map<string, TollEstimate | null>();

  /** Corta la espera antes de que el bloque se quede cargando indefinidamente. */
  readonly TIMEOUT_MS = 5000;

  /**
   * Tope del trazado que se envía. Por encima el backend responde `413`, así que
   * se manda sin ruta y la estimación sale por corredor.
   */
  readonly MAX_POLYLINE_LENGTH = 200_000;

  constructor(private readonly http: HttpClient) {}

  estimate(request: TollEstimateRequest): Observable<TollEstimate | null> {
    const key = this.cacheKey(request);
    if (this.cache.has(key)) return of(this.cache.get(key) ?? null);

    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(this.withinSizeLimit(request));

    return this.http
      .post<any>(`${this.basePath}/tolls`, body, { headers: headers })
      .pipe(
        timeout(this.TIMEOUT_MS),
        map((response: any) => (response?.data as TollEstimate) ?? null),
        tap((estimate) => this.cache.set(key, estimate)),
        catchError((error) => {
          console.error('Error estimando los peajes del trayecto:', error);
          // El error no se guarda en caché: un fallo puntual no debe dejar el
          // bloque vacío por el resto de la sesión
          return of(null);
        }),
      );
  }

  /**
   * Un trayecto se identifica por sus puntos, el vehículo y el mes: las tarifas
   * cambian por vigencia, no de un día para otro.
   */
  private cacheKey(request: TollEstimateRequest): string {
    const month = (request.travelDate ?? '').slice(0, 7);
    const point = (value?: { cityId?: string | null; lat?: number }) =>
      value?.cityId ?? value?.lat ?? '';

    return [
      point(request.origin),
      point(request.destination),
      point(request.returnDestination),
      request.vehicleId ?? request.axles ?? '',
      month,
      request.route?.encodedPolyline ? 'route' : 'corridor',
    ].join('|');
  }

  /** Deja fuera el trazado que excede el tope, no la consulta completa. */
  private withinSizeLimit(request: TollEstimateRequest): TollEstimateRequest {
    const polyline = request.route?.encodedPolyline ?? '';
    if (polyline.length <= this.MAX_POLYLINE_LENGTH) return request;

    const { route, ...rest } = request;
    return rest;
  }
}
