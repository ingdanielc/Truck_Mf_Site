import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

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

  menuItems: MenuItem[] = [
    { label: 'Dashboard', icon: 'fa-solid fa-gauge', route: '/hub/home' },
    {
      label: 'Propietarios',
      icon: 'fa-solid fa-user-tie',
      route: '/site/partners',
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

  constructor() {}

  ngOnInit(): void {}

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
