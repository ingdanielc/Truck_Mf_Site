import { Component, Input, OnDestroy, OnInit } from '@angular/core';

import { RouterModule } from '@angular/router';
import { TokenService } from '../../services/token.service';
import { SecurityService } from '../../services/security/security.service';
import { Subscription } from 'rxjs';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'g-menu',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './g-menu.component.html',
  styleUrls: ['./g-menu.component.scss'],
})
export class GMenuComponent implements OnInit, OnDestroy {
  @Input() version: string = '';
  @Input() tituloMenuBar: string = 'CashTruck';
  @Input() isLogoMenuBar: boolean = true;
  @Input() isCollapsed: boolean = false;
  isMobileOpen: boolean = false;

  private readonly allMenuItems: MenuItem[] = [
    { label: 'Inicio', icon: 'fa-solid fa-home', route: '/site/home' },
    { label: 'Dashboard', icon: 'fa-solid fa-gauge', route: '/site/dashboard' },
    {
      label: 'Propietarios',
      icon: 'fa-solid fa-user-tie',
      route: '/site/owners',
    },
    {
      label: 'Conductores',
      icon: 'fa-solid fa-address-card',
      route: '/site/drivers',
    },
    { label: 'Vehículos', icon: 'fa-solid fa-truck', route: '/site/vehicles' },
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
      label: 'Configuración',
      icon: 'fa-solid fa-gear',
      route: '/site/configuration',
    },
    {
      label: 'Seguridad',
      icon: 'fa-solid fa-shield-halved',
      route: '/site/security',
    },
  ];

  menuItems: MenuItem[] = [];
  private userSub?: Subscription;

  constructor(
    private readonly tokenService: TokenService,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    // Start with empty menu to prevent flashing unauthorized options
    this.menuItems = [];

    // First attempt: recover role from token for immediate filtering
    const tokenRole = this.extractRoleFromToken();
    if (tokenRole) {
      this.filterMenu(tokenRole);
    }

    // Subscribe for more detailed user data and reactive updates
    this.subscribeToUserContext();
  }

  private extractRoleFromToken(): string | null {
    try {
      const payload = this.tokenService.getPayload();
      const roles: string | string[] = payload?.role ?? payload?.roles ?? '';
      const roleStr = Array.isArray(roles) ? roles[0] : roles;
      return (roleStr || '').toUpperCase();
    } catch {
      return null;
    }
  }

  private subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          const role = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          this.filterMenu(role);
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
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
