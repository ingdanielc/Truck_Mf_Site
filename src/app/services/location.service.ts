import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ModelFilterTable } from '../models/model-filter-table';
import { ModelDriverLocation } from '../models/location-model';

@Injectable({
  providedIn: 'root',
})
export class LocationService {
  private readonly apiUrl = `${environment._APIUrl}/locations`;
  private hasReportedLocation = false;

  constructor(private readonly http: HttpClient) {}

  public getLocationService(filter: ModelFilterTable): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.apiUrl}/filter`, body, {
      headers: headers,
    });
  }

  public createLocation(location: ModelDriverLocation): Observable<any> {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(location);
    return this.http.post<any>(`${this.apiUrl}/save`, body, {
      headers: headers,
    });
  }

  public reportDriverLocation(
    driverId: number,
    vehicleId: number,
    tripId?: number | null,
    force: boolean = false,
  ): void {
    if (this.hasReportedLocation && !force) {
      return;
    }
    this.hasReportedLocation = true;

    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    const geoOptions = {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, speed } = position.coords;
        const speedKmh = speed ? speed * 3.6 : 0; // m/s to km/h

        const locationData: ModelDriverLocation = {
          driverId,
          vehicleId,
          tripId: tripId || null,
          latitude,
          longitude,
          speedKmh,
        };

        if (
          typeof (globalThis as any).google !== 'undefined' &&
          (globalThis as any).google?.maps?.Geocoder
        ) {
          const geocoder = new (globalThis as any).google.maps.Geocoder();
          const latlng = { lat: latitude, lng: longitude };
          geocoder.geocode(
            { location: latlng },
            (results: any, status: any) => {
              if (status === 'OK' && results[0]) {
                locationData.addressText = results[0].formatted_address;
              }
              this.saveLocationInfo(locationData);
            },
          );
        } else {
          this.saveLocationInfo(locationData);
        }
      },
      (error) => {
        console.error('Error obtaining location', error);
      },
      geoOptions,
    );
  }

  private saveLocationInfo(data: ModelDriverLocation): void {
    this.createLocation(data).subscribe({
      next: () => console.log('Driver Location reported successfully'),
      error: (err) => console.error('Failed to report driver location', err),
    });
  }
}
