import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  DashboardGroupTrips,
  DashboardReport,
} from '../models/dashboard-report-model';

/**
 * Reportes agregados del tablero.
 *
 * A diferencia del resto de servicios, estos endpoints son `GET` y ya vienen
 * agregados: el alcance (qué vehículos ve quién) sale del token, no de los
 * parámetros. Ver `docs/reportes-carga-de-datos.md`.
 */
@Injectable({
  providedIn: 'root',
})
export class ReportService {
  basePath: string = environment._APIUrl + '/reports/dashboard';

  constructor(private readonly http: HttpClient) {}

  /**
   * Endpoint A — carga del tablero. Única petición de la entrada: reemplaza
   * las tres consultas de 20.000 registros y la de viajes activos.
   *
   * `groupBy` es la dimensión del eje de categorías y `ownerId` solo lo manda
   * el administrador cuando filtra por un propietario.
   */
  getDashboard(options: {
    year: number;
    groupBy: 'vehicle' | 'owner' | 'driver';
    ownerId?: number | string | null;
  }): Observable<DashboardReport> {
    let params = new HttpParams()
      .set('year', String(options.year))
      .set('groupBy', options.groupBy);

    if (options.ownerId != null && options.ownerId !== '') {
      params = params.set('ownerId', String(options.ownerId));
    }

    return this.http
      .get<any>(this.basePath, { params })
      .pipe(map((resp) => this.unwrap<DashboardReport>(resp, 'groups')));
  }

  /**
   * Endpoint B — detalle viaje a viaje de un grupo. Se pide solo al tocar una
   * barra, nunca en la carga. Sin `month` devuelve el año completo.
   */
  getGroupTrips(
    key: string,
    year: number,
    month?: number | null,
  ): Observable<DashboardGroupTrips> {
    let params = new HttpParams().set('year', String(year));
    if (month != null) params = params.set('month', String(month));

    return this.http
      .get<any>(`${this.basePath}/groups/${encodeURIComponent(key)}/trips`, {
        params,
      })
      .pipe(map((resp) => this.unwrap<DashboardGroupTrips>(resp, 'trips')));
  }

  /**
   * Saca el reporte de la envoltura de la API.
   *
   * La API responde `{ data: ... }` cuando todo va bien y
   * `{ code, message, i18n }` cuando no. Devolver la envoltura de error tal
   * cual dejaba un objeto sin `groups`, y el tablero lo pintaba como un año
   * sin movimiento: nueve gráficas vacías y nada en la consola. Un reporte
   * que no trae la colección esperada es un fallo, y se trata como tal.
   */
  private unwrap<T>(resp: any, coleccion: 'groups' | 'trips'): T {
    const payload =
      resp && typeof resp === 'object' && 'data' in resp ? resp.data : resp;

    if (!payload || !Array.isArray(payload[coleccion])) {
      throw new Error(
        resp?.message ??
          `El reporte no trajo "${coleccion}" (respuesta inesperada).`,
      );
    }

    return payload as T;
  }
}
