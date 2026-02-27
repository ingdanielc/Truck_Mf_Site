import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelExpense } from '../models/expense-model';

@Injectable({
  providedIn: 'root',
})
export class VehicleService {
  basePath: string = environment._APIUrl + '/expense';

  constructor(private readonly http: HttpClient) { }

  getExpenseFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }

  createExpense(expense: ModelExpense) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(expense);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }

  getExpenseCategoryFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filterExpenseCategory`, body, {
      headers: headers,
    });
  }
}
