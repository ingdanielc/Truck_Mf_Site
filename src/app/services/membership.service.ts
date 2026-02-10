import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { ModelMembership } from '../models/mermbership-model';

@Injectable({
  providedIn: 'root',
})
export class MembershipService {
  basePath: string = environment._APIUrl + '/membership';

  constructor(private readonly http: HttpClient) {}

  getListMembershipTypes() {
    return this.http.get<any>(`${this.basePath}/getAllMembershipTypes`);
  }

  getMembershipFilter(filter: any) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(filter);
    return this.http.post<any>(`${this.basePath}/filter`, body, {
      headers: headers,
    });
  }

  createMemberhip(membership: ModelMembership) {
    const headers = { 'content-type': 'application/json' };
    const body = JSON.stringify(membership);
    return this.http.post<any>(`${this.basePath}/save`, body, {
      headers: headers,
    });
  }
}
