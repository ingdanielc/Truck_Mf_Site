import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelVehicle } from '../models/vehicle-model';
import { ModelDocumentFile } from '../models/document-model';

@Injectable({
  providedIn: 'root',
})
export class VehicleService {
  basePath: string = environment._APIUrl + '/vehicle';

  constructor(private readonly http: HttpClient) {}

  getPhotoDefault() {
    return 'assets/images/default-vehicle.png'; // Reference to a default image
  }

  getVehicleFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }

  getVehicleCount(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/counts`, body, {
      headers: headers,
    });
  }

  createVehicle(vehicle: ModelVehicle) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(vehicle);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }

  getVehicleOwnerFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filterVehicleOwner`, body, {
      headers: headers,
    });
  }

  sellVehicle(id: number) {
    return this.http.post<any>(`${this.basePath}/${id}/sell`, {});
  }

  /**
   * Alta y actualización de documentos en una sola llamada: se manda la lista
   * completa y el backend crea los que no traen id y actualiza los que sí.
   */
  saveVehicleDocuments(documents: ModelDocumentFile[]) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(documents);
    return this.http.post<any>(`${this.basePath}/saveDocuments`, body, {
      headers: headers,
    });
  }

  getVehicleDocuments(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filterDocuments`, body, {
      headers: headers,
    });
  }

  /** Borrado real, para el documento cargado por error. */
  deleteVehicleDocument(id: number) {
    return this.http.delete<any>(`${this.basePath}/documents/${id}`);
  }
}
