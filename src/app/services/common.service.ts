import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Observable, shareReplay } from 'rxjs';
import {
  DocumentAppliesTo,
  ModelDocumentFile,
} from '../models/document-model';

/**
 * Valores de `type` que acepta `/common/upload-document`. Los cuatro primeros
 * son los de `appliesTo`; `expense` y `subscription` van fijos porque esos
 * comprobantes no se guardan como documento, solo su URL.
 */
export type DocumentUploadType =
  | 'vehicle'
  | 'driver'
  | 'owner'
  | 'trip'
  | 'expense'
  | 'subscription';

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
   * OWNER) o por viaje (TRIP). Es un catálogo, así que se cachea por portador
   * igual que el resto.
   */
  getDocumentFileTypes(appliesTo: DocumentAppliesTo) {
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
   *
   * `type` decide la carpeta. Con `driver` va el driverId: el backend lo usa
   * para guardar en `/owner` cuando el conductor es el mismo propietario. Sin
   * `type` el backend responde 400.
   */
  uploadDocument(
    file: File | Blob,
    fileName: string | undefined,
    holder: { type: DocumentUploadType; id?: number | null },
  ) {
    const formData = new FormData();
    formData.append('file', file, fileName || (file as File).name);
    formData.append('type', holder.type);
    if (holder.id != null) formData.append('id', holder.id.toString());
    return this.http.post<any>(`${this.basePath}/upload-document`, formData);
  }

  /**
   * Alta y actualización de documentos en una sola llamada: se manda la lista
   * completa y el backend crea los que no traen id y actualiza los que sí.
   * Sirve para cualquier portador: vehículo, conductor o propietario.
   */
  saveDocuments(documents: ModelDocumentFile[]) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(documents);
    return this.http.post<any>(`${this.basePath}/saveDocuments`, body, {
      headers: headers,
    });
  }

  getDocuments(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filterDocuments`, body, {
      headers: headers,
    });
  }

  /** Borrado real, para el documento cargado por error. */
  deleteDocument(id: number) {
    return this.http.delete<any>(`${this.basePath}/documents/${id}`);
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
