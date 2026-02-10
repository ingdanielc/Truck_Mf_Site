import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelPayment } from '../models/payment-model';

@Injectable({
  providedIn: 'root',
})
export class PaymentService {
  basePath: string = environment._APIUrl + '/payment';

  constructor(private readonly http: HttpClient) {}

  getListPaymentMethod() {
    return this.http.get<any>(`${this.basePath}/getAllPaymentMethods`);
  }

  payMembership(payment: ModelPayment) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(payment);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }

  getPaymentFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }
}
