import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SecurityService } from '../../services/security/security.service';
import { TokenService } from '../../services/token.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly allCards: any = [
    {
      routing: '/site/owners',
      title: 'Propietarios',
      icon: 'fa-solid fa-user-tie',
      descriptions:
        'Gestiona de manera eficiente el registro y control de propietarios de vehículos.',
    },
    {
      routing: '/site/drivers',
      title: 'Conductores',
      icon: 'fa-solid fa-id-card',
      descriptions:
        'Controla la información y documentación de tus conductores asociados.',
    },
    {
      routing: '/site/vehicles',
      title: 'Vehículos',
      icon: 'fa-solid fa-truck-moving',
      descriptions:
        'Administra tu flota de vehículos, documentos y mantenimientos.',
    },
    {
      routing: '/site/trips',
      title: 'Viajes',
      icon: 'fa-solid fa-route',
      descriptions:
        'Realiza el seguimiento detallado de los despachos y rentabilidad por viaje.',
    },
    {
      routing: '/site/security',
      title: 'Seguridad',
      icon: 'fa-solid fa-shield-halved',
      descriptions:
        'Administra usuarios, roles y permisos de acceso al sistema.',
    },
  ];

  listCard: any = [];
  private userSub?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    this.listCard = [...this.allCards];
    this.subscribeToUserContext();
  }

  private subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          const role = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          this.filterCards(role);
        } else {
          // If no user data yet, try to fetch it using token payload if available
          const payload = this.tokenService.getPayload();
          if (payload?.id) {
            this.securityService.fetchUserData(payload.id);
          }
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  private filterCards(role: string): void {
    if (role.includes('ADMINISTRADOR')) {
      this.listCard = this.allCards;
    } else {
      // Basic filtering example: non-admins might not see security
      this.listCard = this.allCards.filter(
        (card: any) => card.title !== 'Seguridad',
      );
    }
  }

  navigateTo(path: string): void {
    this.router.navigateByUrl(path);
  }
}
