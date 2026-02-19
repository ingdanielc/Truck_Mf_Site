import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TokenService } from '../../services/token.service';
import { Router } from '@angular/router';
import { SecurityService } from '../../services/security/security.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';

@Component({
  selector: 'g-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-sidebar.component.html',
  styleUrls: ['./g-sidebar.component.scss'],
})
export class GSidebarComponent implements OnInit {
  @Input() userName: string = 'Daniel Solis';
  @Input() userRole: string = 'Administrador';
  @Input() notificationsCount: number = 5;
  @Output() toggleMenu = new EventEmitter<void>();
  currentTheme: 'light' | 'dark' = 'dark';
  isUserMenuOpen: boolean = false;

  constructor(
    private readonly tokenService: TokenService,
    private readonly router: Router,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    const payload = this.tokenService.getPayload();
    if (payload) {
      this.userName = payload.unique_name || payload.name || 'Usuario';

      const userId = payload.nameid || payload.id || payload.sub;
      if (userId) {
        this.loadUserRole(userId);
      }
    }

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

  private loadUserRole(userId: string): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', userId)],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.securityService.getUserFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          const user = response.data.content[0];
          this.userRole = user.userRoles?.[0]?.role?.name || 'Sin Rol';
        }
      },
      error: (err: any) => {
        console.error('Error loading user role:', err);
      },
    });
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', this.currentTheme);
    this.applyTheme();
  }

  private applyTheme() {
    document.documentElement.setAttribute('data-bs-theme', this.currentTheme);
  }

  toggleUserMenu() {
    this.isUserMenuOpen = !this.isUserMenuOpen;
  }

  goToProfile() {
    console.log('Navegando al perfil...');
    this.isUserMenuOpen = false;
  }

  logout() {
    this.tokenService.clearToken();
    this.router.navigateByUrl('/auth');
    this.isUserMenuOpen = false;
  }
}
