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
