import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  imports: [CommonModule, RouterModule],
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
    { label: 'Dashboard', icon: 'fa-solid fa-gauge', route: '/hub/home' },
    {
      label: 'Propietarios',
      icon: 'fa-solid fa-user-tie',
      route: '/site/owners',
    },
    { label: 'Vehículos', icon: 'fa-solid fa-truck', route: '/site/vehicles' },
    {
      label: 'Conductores',
      icon: 'fa-solid fa-address-card',
      route: '/site/drivers',
    },
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
  private userSub?: Subscription;

  constructor(
    private readonly tokenService: TokenService,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    this.menuItems = [...this.allMenuItems];
    this.subscribeToUserContext();
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
