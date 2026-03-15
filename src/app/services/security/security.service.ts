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

  private pendingUserId_?: string | number | null = null;

  getUserData(): ModelUser | null {
    return this.userSubject.value;
  }

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

  authenticate(email: string, password: string) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify({ email, password });
    return this.http.post<any>(`${this.basePath}/authentication`, body, {
      headers: headers,
      observe: 'response',
    });
  }

  getAllRoles() {
    return this.http.get<any>(`${this.basePath}/getAllRoles`);
  }

  fetchUserData(userId: string | number): void {
    if (this.userSubject.value && this.userSubject.value?.id == userId) return;
    if (this.pendingUserId_ == userId) return;

    this.pendingUserId_ = userId;

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
        this.pendingUserId_ = null;
      },
      error: (err: any) => {
        console.error('Error fetching user data in SecurityService:', err);
        this.pendingUserId_ = null;
      },
    });
  }

  async getHashSHA512(text: string): Promise<string> {
    // Limpiamos espacios y normalizamos para asegurar consistencia
    const cleanText = text.trim().normalize('NFC');
    const encoder = new TextEncoder();
    const data = encoder.encode(cleanText);

    const hashBuffer = await crypto.subtle.digest('SHA-512', data);

    // Forma más robusta de convertir a Hex en cualquier entorno
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
}
