import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelVehicle } from '../models/vehicle-model';

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

  createVehicle(vehicle: ModelVehicle) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(vehicle);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }
}
