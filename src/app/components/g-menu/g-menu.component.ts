import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TokenService } from '../../services/token.service';
import { SecurityService } from '../../services/security/security.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'g-menu',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './g-menu.component.html',
  styleUrls: ['./g-menu.component.scss'],
})
export class GMenuComponent implements OnInit {
  @Input() version: string = '';
  @Input() tituloMenuBar: string = 'CashTruck';
  @Input() isLogoMenuBar: boolean = true;
  @Input() isCollapsed: boolean = false;
  isMobileOpen: boolean = false;

  private readonly allMenuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'fa-solid fa-gauge', route: '/hub/home' },
    {
      label: 'Propietarios',
      icon: 'fa-solid fa-user-tie',
      route: '/site/owners',
    },
    { label: 'Vehículos', icon: 'fa-solid fa-truck', route: '/site/vehicles' },
    { label: 'Conductores', icon: 'fa-solid fa-truck', route: '/site/drivers' },
    { label: 'Viajes', icon: 'fa-solid fa-route', route: '/site/trips' },
    {
      label: 'Gastos',
      icon: 'fa-solid fa-money-bill-wave',
      route: '/site/expenses',
    },
    {
      label: 'Mantenimiento',
      icon: 'fa-solid fa-wrench',
      route: '/site/maintenance',
    },
    {
      label: 'Seguridad',
      icon: 'fa-solid fa-shield-halved',
      route: '/site/security',
    },
    {
      label: 'Configuración',
      icon: 'fa-solid fa-gear',
      route: '/site/configuration',
    },
  ];

  menuItems: MenuItem[] = [];

  constructor(
    private readonly tokenService: TokenService,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    this.menuItems = [...this.allMenuItems];
    this.loadUserRole();
  }

  private loadUserRole(): void {
    const payload = this.tokenService.getPayload();
    if (payload) {
      const userId = payload.nameid || payload.id || payload.sub;
      if (userId) {
        const filter = new ModelFilterTable(
          [new Filter('id', '=', userId)],
          new Pagination(1, 0),
          new Sort('id', true),
        );

        this.securityService.getUserFilter(filter).subscribe({
          next: (response: any) => {
            if (response?.data?.content?.length > 0) {
              const user = response.data.content[0];
              const role = (
                user.userRoles?.[0]?.role?.name || ''
              ).toUpperCase();
              this.filterMenu(role);
            }
          },
          error: (err: any) => {
            console.error('Error loading role for menu:', err);
          },
        });
      }
    }
  }

  private filterMenu(role: string): void {
    if (role.includes('ADMINISTRADOR')) {
      this.menuItems = this.allMenuItems;
    } else if (role.includes('PROPIETARIO')) {
      this.menuItems = this.allMenuItems.filter(
        (item) => item.label !== 'Propietarios' && item.label !== 'Seguridad',
      );
    } else if (role.includes('CONDUCTOR')) {
      this.menuItems = this.allMenuItems.filter(
        (item) =>
          item.label !== 'Propietarios' &&
          item.label !== 'Seguridad' &&
          item.label !== 'Conductores' &&
          item.label !== 'Configuración',
      );
    }
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  toggleMobileMenu() {
    this.isMobileOpen = !this.isMobileOpen;
  }

  closeMobileMenu() {
    this.isMobileOpen = false;
  }
}
