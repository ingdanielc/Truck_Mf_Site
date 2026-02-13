import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SecurityService } from '../../services/security/security.service';
import { ModelUser } from '../../models/user-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  roleType: 'conductor' | 'propietario' | 'otro';
  status: 'online' | 'offline' | 'away';
  avatar?: string;
}

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss'],
})
export class SecurityComponent implements OnInit {
  users: User[] = [];
  activeFilter: string = 'Todos';
  filters: string[] = ['Todos', 'Conductores', 'Propietarios'];
  rows: number = 10;
  page: number = 0;

  constructor(private readonly securityService: SecurityService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.securityService.getUserFilter(filter).subscribe({
      next: (response: any) => {
        console.log('aqui');
        if (response?.data?.content) {
          console.log('aqui2');
          this.users = response.data.content.map((u: ModelUser) =>
            this.mapUser(u),
          );
          console.log(this.users);
        }
      },
      error: (err) => {
        console.error('Error loading users:', err);
      },
    });
  }

  private mapUser(u: ModelUser): User {
    const roleName = 'Propietario'; //u.userRoles?.[0]?.role?.name || 'OTRO';
    return {
      id: u.id || 0,
      name: u.name || 'Sin nombre',
      email: u.email || 'Sin email',
      role: roleName.toUpperCase(),
      roleType: this.getRoleType(roleName),
      status: u.status === 'Active' ? 'online' : 'offline',
      avatar: undefined,
    };
  }

  private getRoleType(roleName: string): 'conductor' | 'propietario' | 'otro' {
    const name = roleName.toLowerCase();
    if (name.includes('conductor')) return 'conductor';
    if (name.includes('propietario')) return 'propietario';
    return 'otro';
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    // In a real scenario, you might want to call loadUsers with a filter object
  }
}
