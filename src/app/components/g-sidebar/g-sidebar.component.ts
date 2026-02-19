import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TokenService } from '../../services/token.service';
import { Router } from '@angular/router';
import { SecurityService } from '../../services/security/security.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'g-sidebar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-sidebar.component.html',
  styleUrls: ['./g-sidebar.component.scss'],
})
export class GSidebarComponent implements OnInit, OnDestroy {
  @Input() userName: string = 'Daniel Solis';
  @Input() userRole: string = 'Administrador';
  @Input() notificationsCount: number = 5;
  @Output() toggleMenu = new EventEmitter<void>();
  currentTheme: 'light' | 'dark' = 'dark';
  isUserMenuOpen: boolean = false;
  private userSub?: Subscription;

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

    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = user.userRoles?.[0]?.role?.name || 'Sin Rol';
        }
      },
    });

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
    this.securityService.fetchUserData(userId);
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
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
