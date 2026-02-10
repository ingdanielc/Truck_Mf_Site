import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class CommonService {
  basePath: string = environment._APIUrl + '/common';

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
      { selectId: 1, selectValue: 'Active' },
      { selectId: 2, value: 'Inactive' },
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
    return this.http.get<any>(`${this.basePath}/getDocumentTypes`);
  }

  getExpires() {
    return this.http.get<any>(`${this.basePath}/getExpires`);
  }

  getGenders() {
    return this.http.get<any>(`${this.basePath}/getGenders`);
  }

  getCities() {
    return this.http.get<any>(`${this.basePath}/getCities`);
  }

  getListPaymentMethod() {
    return this.http.get<any>(`${this.basePath}/getPaymentMethods`);
  }
}
