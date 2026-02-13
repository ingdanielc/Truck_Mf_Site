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
  currentTheme: 'light' | 'dark' = 'dark';
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

  ngOnInit(): void {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark';
    if (savedTheme) {
      this.currentTheme = savedTheme;
    } else {
      const prefersDark = globalThis.matchMedia(
        '(prefers-color-scheme: dark)',
      ).matches;
      this.currentTheme = prefersDark ? 'dark' : 'light';
    }
    this.applyTheme();
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

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-bs-theme', this.currentTheme);
  }
}
