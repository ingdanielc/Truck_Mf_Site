import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ModelTrip } from 'src/app/models/trip-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { GTripCardComponent } from '../../components/g-trip-card/g-trip-card.component';
import { GVehicleOwnerCardComponent } from '../../components/g-vehicle-owner-card/g-vehicle-owner-card.component';
import { TripService } from 'src/app/services/trip.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { VehicleService } from 'src/app/services/vehicle.service';
import { GTripFormComponent } from '../../components/g-trip-form/g-trip-form.component';

export interface TripOwnerGroup {
  owner: ModelOwner;
  trips: ModelTrip[];
}

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GTripCardComponent,
    GVehicleOwnerCardComponent,
    GTripFormComponent,
  ],
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.scss'],
})
export class TripsComponent implements OnInit, OnDestroy {
  allTrips: ModelTrip[] = [];
  totalTrips: number = 0;
  inProgressTrips: number = 0;
  completedTrips: number = 0;
  searchTerm: string = '';
  page: number = 0;
  rows: number = 100;

  // Grouped display
  groupedTrips: TripOwnerGroup[] = [];

  // Offcanvas state
  isOffcanvasOpen: boolean = false;
  editingTrip: ModelTrip | null = null;

  // Selection Lists for parent context
  owners: ModelOwner[] = [];
  cities: any[] = [];
  vehicles: any[] = [];

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  private userSub?: Subscription;

  // filters
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;

  constructor(
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    this.subscribeToUserContext();
    this.loadCities();
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data;
        }
      },
      error: (err: any) => console.error('Error loading cities:', err),
    });
  }

  loadFilteredOwner(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredOwner = response.data.content[0];
          this.loadVehiclesByOwner(ownerId, true);
        }
      },
    });
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();

          if (this.userRole === 'ADMINISTRADOR') {
            this.loadOwners();
            this.loadTrips();
          } else if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners();
          }
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  loadVehiclesByOwner(ownerId: number, isInitialLoad: boolean = false): void {
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('owner.id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        if (isInitialLoad) {
          this.loadTrips();
        }
      },
      error: () => {
        this.vehicles = [];
        if (isInitialLoad) this.loadTrips();
      },
    });
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('user.id', '=', this.loggedInOwnerId.toString()));
    }

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(100, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
          if (this.userRole === 'PROPIETARIO' && this.owners.length > 0) {
            this.loggedInOwnerId = this.owners[0].id ?? this.loggedInOwnerId;
            if (this.loggedInOwnerId) {
              this.loadVehiclesByOwner(this.loggedInOwnerId, true);
            } else {
              this.loadTrips();
            }
          } else if (this.userRole === 'ADMINISTRADOR') {
            this.applyFilter();
          }
        }
      },
    });
  }

  loadTrips(): void {
    let filtros: Filter[] = [];

    if (
      this.userRole === 'PROPIETARIO' ||
      (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter)
    ) {
      const vehicleIds = this.vehicles
        .map((v) => v.id)
        .filter((id) => id != null)
        .join(',');

      if (vehicleIds) {
        filtros.push(new Filter('vehicle.id', 'in', vehicleIds));
      } else {
        filtros.push(new Filter('vehicle.id', 'IN', '-1'));
      }
    }

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );

    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.allTrips = response?.data?.content ?? [];
        this.calculateStats();
        this.applyFilter();
      },
      error: (error: any) => {
        console.error('Error loading trips:', error);
        this.toastService.showError('Error', 'Error al cargar viajes');
      },
    });
  }

  calculateStats(): void {
    this.totalTrips = this.allTrips.length;
    this.inProgressTrips = this.allTrips.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'IN_PROGRESS' || status === 'EN CURSO';
    }).length;
    this.completedTrips = this.allTrips.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'COMPLETED' || status === 'COMPLETADO';
    }).length;
  }

  applyFilter(): void {
    let filtered = this.allTrips;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = this.allTrips.filter((t) => {
        const originName = this.cities
          .find((c) => String(c.id) === String(t.origin))
          ?.name?.toLowerCase();
        const destName = this.cities
          .find((c) => String(c.id) === String(t.destination))
          ?.name?.toLowerCase();

        return (
          (t.numberTrip?.toLowerCase() || '').includes(term) ||
          (t.manifestNumber?.toLowerCase() || '').includes(term) ||
          (originName || '').includes(term) ||
          (destName || '').includes(term) ||
          (t.origin?.toLowerCase() || '').includes(term) ||
          (t.destination?.toLowerCase() || '').includes(term) ||
          (t.vehicle?.plate?.toLowerCase() || '').includes(term) ||
          (t.driver?.name?.toLowerCase() || '').includes(term)
        );
      });
    }
    this.buildGroups(filtered);
  }

  buildGroups(trips: ModelTrip[]): void {
    const groups: TripOwnerGroup[] = [];
    const getOwnerId = (t: ModelTrip): number | undefined => {
      if (t.driver?.ownerId) return t.driver.ownerId;
      if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
        return t.vehicle.owners[0].ownerId;
      }
      return undefined;
    };

    if (this.ownerIdFilter != null && this.filteredOwner) {
      const ownerTrips = trips.filter(
        (t) => getOwnerId(t) === this.ownerIdFilter,
      );
      groups.push({
        owner: this.filteredOwner,
        trips: ownerTrips,
      });
    }

    const ownerIds = [
      ...new Set(
        trips.map((t) => getOwnerId(t)).filter((id) => id !== undefined),
      ),
    ] as number[];
    ownerIds.forEach((oid) => {
      if (oid === this.ownerIdFilter) return;
      const owner = this.owners.find((o) => o.id === oid);
      if (owner) {
        const ownerTrips = trips.filter((t) => getOwnerId(t) === oid);
        groups.push({
          owner,
          trips: ownerTrips,
        });
      }
    });

    this.groupedTrips = groups;
  }

  toggleOffcanvas(trip?: ModelTrip): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      this.editingTrip = trip ?? null;
    }
  }

  onTripSaved(): void {
    this.toggleOffcanvas();
    this.loadTrips();
  }
}
