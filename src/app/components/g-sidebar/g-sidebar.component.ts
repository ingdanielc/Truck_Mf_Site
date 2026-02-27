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
import { OwnerService } from '../../services/owner.service';
import { DriverService } from '../../services/driver.service';
import { Subscription } from 'rxjs';
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
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
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
    this.isUserMenuOpen = false;
    const user = this.securityService.getUserData();
    if (!user) return;

    const roleName = user.userRoles?.[0]?.role?.name?.toUpperCase();

    if (roleName === 'PROPIETARIO') {
      // Filtrar propietario por user.id para obtener el owner.id
      const filter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id!.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );

      this.ownerService.getOwnerFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content?.length > 0) {
            const ownerId = response.data.content[0].id;
            this.router.navigate(['/site/owners', ownerId]);
          } else {
            console.error(
              'No se encontró el propietario para el usuario actual',
            );
          }
        },
        error: (err) => {
          console.error('Error al buscar el propietario:', err);
        },
      });
    } else if (roleName === 'CONDUCTOR') {
      // Filtrar conductor por user.id para obtener el driver.id
      const filter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id!.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );

      this.driverService.getDriverFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content?.length > 0) {
            const driverId = response.data.content[0].id;
            this.router.navigate(['/site/drivers', driverId]);
          } else {
            console.error('No se encontró el conductor para el usuario actual');
          }
        },
        error: (err) => {
          console.error('Error al buscar el conductor:', err);
        },
      });
    } else {
      console.log('Navegando al perfil general...');
      // Logic for other roles profile could go here if implemented
    }
  }

  logout() {
    this.tokenService.clearToken();
    this.router.navigateByUrl('/auth');
    this.isUserMenuOpen = false;
  }
}
