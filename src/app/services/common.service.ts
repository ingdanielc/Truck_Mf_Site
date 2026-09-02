import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Observable, shareReplay } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CommonService {
  basePath: string = environment._APIUrl + '/common';

  private typeDocumentCache$: Observable<any> | null = null;
  private gendersCache$: Observable<any> | null = null;
  private citiesCache$: Observable<any> | null = null;
  private expenseTypesCache$: Observable<any> | null = null;
  private vehicleBrandsCache$: Observable<any> | null = null;
  private salaryTypesCache$: Observable<any> | null = null;
  private readonly documentFileTypesCache = new Map<string, Observable<any>>();

  constructor(private readonly http: HttpClient) {}

  getCountries(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/countries/filter`, body, {
      headers: headers,
    });
  }

  getListStatus() {
    return [
      { selectId: 1, selectValue: 'Activo' },
      { selectId: 2, value: 'Inactivo' },
    ];
  }

  getListStatusSales() {
    return [
      { selectId: 1, selectValue: 'Completed' },
      { selectId: 2, selectValue: 'Pending' },
      { selectId: 3, selectValue: 'Cancelled' },
    ];
  }

  getListTypeDocument() {
    this.typeDocumentCache$ ??= this.http
      .get<any>(`${this.basePath}/getDocumentTypes`)
      .pipe(shareReplay(1));
    return this.typeDocumentCache$;
  }

  getGenders() {
    this.gendersCache$ ??= this.http
      .get<any>(`${this.basePath}/getGenders`)
      .pipe(shareReplay(1));
    return this.gendersCache$;
  }

  getCities() {
    this.citiesCache$ ??= this.http
      .get<any>(`${this.basePath}/getCities`)
      .pipe(shareReplay(1));
    return this.citiesCache$;
  }

  getExpenseTypes() {
    this.expenseTypesCache$ ??= this.http
      .get<any>(`${this.basePath}/getExpenseTypes`)
      .pipe(shareReplay(1));
    return this.expenseTypesCache$;
  }

  getVehicleBrands() {
    this.vehicleBrandsCache$ ??= this.http
      .get<any>(`${this.basePath}/getVehicleBrands`)
      .pipe(shareReplay(1));
    return this.vehicleBrandsCache$;
  }

  getSalaryTypes() {
    this.salaryTypesCache$ ??= this.http
      .get<any>(`${this.basePath}/getSalaryTypes`)
      .pipe(shareReplay(1));
    return this.salaryTypesCache$;
  }

  /**
   * Tipos de documento archivado acotados por portador (VEHICLE, DRIVER,
   * OWNER). Es un catálogo, así que se cachea por portador igual que el resto.
   */
  getDocumentFileTypes(appliesTo: 'VEHICLE' | 'DRIVER' | 'OWNER') {
    let cached = this.documentFileTypesCache.get(appliesTo);
    if (!cached) {
      cached = this.http
        .get<any>(`${this.basePath}/getDocumentFileTypes`, {
          params: { appliesTo },
        })
        .pipe(shareReplay(1));
      this.documentFileTypesCache.set(appliesTo, cached);
    }
    return cached;
  }

  /**
   * Sube el escaneo y devuelve su URL, que luego viaja en `fileUrl` al guardar
   * el documento. No recibe el id del documento: se puede subir antes de que la
   * fila exista. Acepta pdf, jpg, jpeg, png y webp.
   */
  uploadDocument(file: File | Blob, fileName?: string) {
    const formData = new FormData();
    formData.append('file', file, fileName || (file as File).name);
    return this.http.post<any>(`${this.basePath}/upload-document`, formData);
  }

  uploadPhoto(
    type: 'owner' | 'driver' | 'vehicle',
    id: number,
    photo: File | Blob,
  ) {
    const formData = new FormData();
    formData.append('type', type);
    formData.append('id', id.toString());
    formData.append('photo', photo, `photo${id}.jpg`);
    return this.http.post<any>(`${this.basePath}/upload-photo`, formData);
  }
}
