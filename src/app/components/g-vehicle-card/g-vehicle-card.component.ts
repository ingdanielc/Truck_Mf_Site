import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { LocationService } from 'src/app/services/location.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ModelDriverLocation } from 'src/app/models/location-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-g-vehicle-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-card.component.html',
  styleUrls: ['./g-vehicle-card.component.scss'],
})
export class GVehicleCardComponent implements OnInit {
  @Input() vehicle!: ModelVehicle;
  @Input() canEdit: boolean = true;
  @Output() edit = new EventEmitter<ModelVehicle>();
  @Output() viewDetails = new EventEmitter<ModelVehicle>();
  @Output() maintenance = new EventEmitter<ModelVehicle>();

  lastLocation: ModelDriverLocation | null = null;
  loadingLocation: boolean = true;
  userRole: string = '';

  constructor(
    private readonly router: Router,
    private readonly locationService: LocationService,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
        }
      },
    });

    if (this.vehicle.id && this.vehicle.currentDriverId) {
      this.loadLastLocation();
    } else {
      this.loadingLocation = false;
    }
  }

  private loadLastLocation(): void {
    const filter = new ModelFilterTable(
      [
        new Filter('vehicleId', '=', this.vehicle.id!.toString()),
        new Filter('driverId', '=', this.vehicle.currentDriverId!.toString()),
      ],
      new Pagination(1, 0),
      new Sort('id', false),
    );

    this.locationService.getLocationService(filter).subscribe({
      next: (resp: any) => {
        this.lastLocation = resp?.data?.content?.[0] || null;
        this.loadingLocation = false;
      },
      error: (err) => {
        console.error('Error loading last location:', err);
        this.loadingLocation = false;
      },
    });
  }

  onLocationClick(event: Event): void {
    event.stopPropagation();
    if (this.vehicle.id) {
      this.router.navigate(['/site/map'], {
        queryParams: { vehicleId: this.vehicle.id, from: 'vehicles' },
      });
    }
  }

  onEditClick(): void {
    this.edit.emit(this.vehicle);
  }

  onViewDetails(): void {
    this.viewDetails.emit(this.vehicle);
  }
  onMaintenanceClick(): void {
    this.maintenance.emit(this.vehicle);
  }

  onTripsClick(): void {
    const queryParams: any = {};
    if (this.userRole === 'PROPIETARIO' || this.userRole === 'CONDUCTOR') {
      queryParams.vehicleId = this.vehicle.id;
    }
    this.router.navigate(['/site/trips'], { queryParams });
  }

  onStatusClick(): void {
    if (
      this.vehicle.lastTripStatus?.toUpperCase() === 'EN CURSO' &&
      this.vehicle.lastTripId
    ) {
      this.router.navigate(['/site/trips', this.vehicle.lastTripId], {
        queryParams: { from: 'vehicles' },
      });
    }
  }

  get statusClass(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    switch (status) {
      case 'COMPLETADO':
      case 'PENDIENTE':
        return 'badge-completed';
      case 'EN CURSO':
        return 'badge-in-progress';
      case 'CANCELADO':
        return 'badge-cancelled';
      default:
        return 'badge-default';
    }
  }

  get displayTripStatus(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    if (status === 'COMPLETADO' || status === 'PENDIENTE') return 'Disponible';
    return this.vehicle.lastTripStatus || 'Sin Viajes';
  }

  get statusDotClass(): string {
    switch (this.vehicle.status?.toLowerCase()) {
      case 'activo':
        return 'dot-available';
      case 'inactivo':
        return 'dot-busy';
      default:
        return 'dot-default';
    }
  }
}
