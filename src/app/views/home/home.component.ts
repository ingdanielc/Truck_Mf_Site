import { Component, OnDestroy, OnInit } from '@angular/core';

import { Router } from '@angular/router';
import { Subscription, lastValueFrom } from 'rxjs';
import { SecurityService } from '../../services/security/security.service';
import { TokenService } from '../../services/token.service';
import { LocationService } from '../../services/location.service';
import { DriverService } from '../../services/driver.service';
import { VehicleService } from '../../services/vehicle.service';
import { TripService } from '../../services/trip.service';
import {
  ModelFilterTable,
  Filter,
  Pagination,
  Sort,
} from '../../models/model-filter-table';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [],
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly allCards: any = [
    {
      routing: '/site/dashboard',
      title: 'Dashboard',
      icon: 'fa-solid fa-gauge-high',
      descriptions:
        'Visualiza el rendimiento y métricas clave de tu flota con gráficos interactivos.',
    },
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
      routing: '/site/expenses',
      title: 'Gastos',
      icon: 'fa-solid fa-receipt',
      descriptions:
        'Registra y consulta todos los gastos operativos relacionados con los vehículos y viajes.',
    },
    {
      routing: '/site/maintenance',
      title: 'Mantenimiento',
      icon: 'fa-solid fa-screwdriver-wrench',
      descriptions:
        'Programas, gestionas y haz seguimiento a los mantenimientos de tu flota vehicular.',
    },
    {
      routing: '/site/map',
      title: 'Mapa',
      icon: 'fa-solid fa-map-location-dot',
      descriptions:
        'Visualiza en tiempo real la ubicación de los conductores y las rutas de los viajes en curso.',
    },
    {
      routing: '/site/configuration',
      title: 'Configuración',
      icon: 'fa-solid fa-gear',
      descriptions:
        'Edita catálogos, preferencias y ajusta el comportamiento general del ecosistema.',
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
    private readonly locationService: LocationService,
    private readonly driverService: DriverService,
    private readonly vehicleService: VehicleService,
    private readonly tripService: TripService,
  ) {}

  ngOnInit(): void {
    this.listCard = [...this.allCards];
    this.subscribeToUserContext();
  }

  private subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          const role = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          this.filterCards(role);

          if (role.includes('CONDUCTOR') && user.id) {
            this.handleDriverLocation(user.id);
          }
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
      this.listCard = [...this.allCards];
    } else if (role.includes('PROPIETARIO')) {
      this.listCard = this.allCards.filter(
        (card: any) =>
          card.title !== 'Propietarios' && card.title !== 'Seguridad',
      );
    } else if (role.includes('CONDUCTOR')) {
      this.listCard = this.allCards.filter(
        (card: any) =>
          card.title !== 'Propietarios' &&
          card.title !== 'Seguridad' &&
          card.title !== 'Conductores' &&
          card.title !== 'Configuración',
      );
    }
  }

  navigateTo(path: string): void {
    this.router.navigateByUrl(path);
  }

  private async handleDriverLocation(userId: number) {
    try {
      const driverFilter = new ModelFilterTable(
        [new Filter('user.id', '=', userId.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      const driverResp: any = await lastValueFrom(
        this.driverService.getDriverFilter(driverFilter),
      );
      const currentDriverId = driverResp?.data?.content?.[0]?.id;

      if (!currentDriverId) return;

      const vehicleDriverFilter = new ModelFilterTable(
        [new Filter('currentDriverId', '=', currentDriverId.toString())],
        new Pagination(9999, 0),
        new Sort('id', true),
      );
      const vehiclesResp: any = await lastValueFrom(
        this.vehicleService.getVehicleFilter(vehicleDriverFilter),
      );
      const vehiclesContext: any[] = vehiclesResp?.data?.content ?? [];

      if (vehiclesContext.length === 0) return;

      const vehicleIds = vehiclesContext
        .map((v) => v.id)
        .filter((id) => id != null)
        .join(',');

      const tripFilterPayload = new ModelFilterTable(
        [new Filter('vehicle.id', 'in', vehicleIds)],
        new Pagination(1000, 0),
        new Sort('id', false),
      );

      const tripsResp: any = await lastValueFrom(
        this.tripService.getTripFilter(tripFilterPayload),
      );
      const trips: any[] = tripsResp?.data?.content || [];

      let activeVehicleId = vehiclesContext[0].id;
      let activeTripId: number | null = null;

      for (const v of vehiclesContext) {
        const activeTrip = trips.find(
          (t) =>
            (t.vehicleId === v.id || t.vehiclePlate === v.plate) &&
            (t.status?.toUpperCase() === 'EN CURSO' ||
              t.status?.toUpperCase() === 'PENDIENTE'),
        );
        if (activeTrip) {
          activeVehicleId = v.id;
          activeTripId = activeTrip.id;
          break; // Use the first active trip context found
        }
      }

      this.locationService.reportDriverLocation(
        currentDriverId,
        activeVehicleId,
        activeTripId,
      );
    } catch (error) {
      console.error('Error fetching data for location tracking in Home', error);
    }
  }
}
