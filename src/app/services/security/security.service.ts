import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { ModelUser } from 'src/app/models/user-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Injectable({
  providedIn: 'root',
})
export class SecurityService {
  basePath: string = environment._APIUrl + '/security';

  private readonly userSubject = new BehaviorSubject<ModelUser | null>(null);
  userData$ = this.userSubject.asObservable();

  constructor(private readonly http: HttpClient) {}

  getUserFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }

  createUser(user: ModelUser) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(user);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }

  getAllRoles() {
    return this.http.get<any>(`${this.basePath}/getAllRoles`);
  }

  fetchUserData(userId: string | number): void {
    if (this.userSubject.value && this.userSubject.value?.id == userId) return;

    const filter = new ModelFilterTable(
      [new Filter('id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.getUserFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          const user = response.data.content[0];
          this.userSubject.next(user);
        }
      },
      error: (err: any) => {
        console.error('Error fetching user data in SecurityService:', err);
      },
    });
  }

  async getHashSHA512(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
