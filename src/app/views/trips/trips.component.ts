import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
import { ModelVehicle } from 'src/app/models/vehicle-model';

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
    ReactiveFormsModule,
    GTripCardComponent,
    GVehicleOwnerCardComponent,
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

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingTrip: ModelTrip | null = null;
  tripForm: FormGroup;

  // Selection Lists
  owners: ModelOwner[] = [];
  vehicles: ModelVehicle[] = [];
  loadingVehicles: boolean = false;
  private readonly ownerChangeSub?: Subscription;

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  loggedInOwner: ModelOwner | null = null;
  private userSub?: Subscription;

  /** ownerId filter when navigated from owner card (query param) */
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly route: ActivatedRoute,
  ) {
    this.tripForm = this.fb.group({
      tripNumber: ['', [Validators.required]],
      manifestNumber: ['', [Validators.required]],
      origin: ['', [Validators.required]],
      destination: ['', [Validators.required]],
      totalFreight: [0, [Validators.required, Validators.min(0)]],
      advance: [0, [Validators.required, Validators.min(0)]],
      date: [new Date().toISOString().split('T')[0], [Validators.required]],
      ownerId: [null, [Validators.required]],
      vehicleId: [null, [Validators.required]],
      status: ['IN_PROGRESS'],
    });

    // React to owner selection change → reload vehicles
    this.ownerChangeSub = this.tripForm
      .get('ownerId')!
      .valueChanges.subscribe((ownerId) => {
        this.tripForm.get('vehicleId')?.setValue(null, { emitEvent: false });
        this.vehicles = [];
        if (ownerId != null) {
          this.loadVehiclesByOwner(ownerId);
        }
      });
  }

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    this.subscribeToUserContext();
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
          this.applyFilter();
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
            this.tripForm.get('ownerId')?.setValidators([Validators.required]);
            this.loadOwners();
            this.loadTrips();
          } else if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners();
          }
          this.tripForm.get('ownerId')?.updateValueAndValidity();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.ownerChangeSub?.unsubscribe();
  }

  loadVehiclesByOwner(ownerId: number): void {
    this.loadingVehicles = true;
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('plate', true),
    );
    this.vehicleService.getVehicleFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        this.loadingVehicles = false;
      },
      error: () => {
        this.vehicles = [];
        this.loadingVehicles = false;
      },
    });
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(
        new Filter('owner.id', '=', this.loggedInOwnerId.toString()),
      );
    }

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(100, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          const owners = response.data.content;
          this.owners = owners;
          if (this.userRole === 'PROPIETARIO' && owners.length > 0) {
            this.loggedInOwner = owners[0];
            this.loggedInOwnerId =
              this.loggedInOwner?.id ?? this.loggedInOwnerId;
            this.loadTrips();
          }
          this.applyFilter();
        }
      },
    });
  }

  loadTrips(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(
        new Filter('owner.id', '=', this.loggedInOwnerId.toString()),
      );
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
      return status === 'IN_PROGRESS' || status === 'EN PROGRESO';
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
      filtered = this.allTrips.filter(
        (t) =>
          (t.tripNumber?.toLowerCase() || '').includes(term) ||
          (t.manifestNumber?.toLowerCase() || '').includes(term) ||
          (t.origin?.toLowerCase() || '').includes(term) ||
          (t.destination?.toLowerCase() || '').includes(term) ||
          (t.vehicle?.plate?.toLowerCase() || '').includes(term) ||
          (t.driver?.name?.toLowerCase() || '').includes(term),
      );
    }
    this.buildGroups(filtered);
  }

  buildGroups(trips: ModelTrip[]): void {
    const groups: TripOwnerGroup[] = [];

    // Helper to get ownerId from trip
    const getOwnerId = (t: ModelTrip): number | undefined => {
      if (t.ownerId) return t.ownerId;
      if (t.driver?.ownerId) return t.driver.ownerId;
      if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
        return t.vehicle.owners[0].ownerId;
      }
      return undefined;
    };

    // If we have an ownerIdFilter, ensure that owner is always shown first
    if (this.ownerIdFilter != null && this.filteredOwner) {
      const ownerTrips = trips.filter(
        (t) => getOwnerId(t) === this.ownerIdFilter,
      );
      groups.push({
        owner: this.filteredOwner,
        trips: ownerTrips,
      });
    }

    // Process all other owners
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
      if (trip) {
        this.editingTrip = trip;
        this.tripForm.patchValue({
          tripNumber: trip.tripNumber,
          manifestNumber: trip.manifestNumber,
          origin: trip.origin,
          destination: trip.destination,
          totalFreight: trip.totalFreight,
          advance: trip.advance,
          date: trip.date,
          ownerId: trip.ownerId,
          vehicleId: trip.vehicleId,
          status: trip.status,
        });

        if (this.userRole === 'PROPIETARIO') {
          this.tripForm.get('ownerId')?.disable();
        } else {
          this.tripForm.get('ownerId')?.enable();
        }
      } else {
        this.editingTrip = null;
        this.tripForm.reset({
          totalFreight: 0,
          advance: 0,
          date: new Date().toISOString().split('T')[0],
          status: 'IN_PROGRESS',
          ownerId:
            this.userRole === 'ADMINISTRADOR' ? null : this.loggedInOwnerId,
        });
      }
    }
  }

  onSubmit(): void {
    if (this.tripForm.valid) {
      const tripData: ModelTrip = {
        ...this.tripForm.getRawValue(),
        id: this.editingTrip ? this.editingTrip.id : null,
      };

      this.tripService.createTrip(tripData).subscribe({
        next: () => {
          this.toastService.showSuccess(
            'Éxito',
            `Viaje ${this.editingTrip ? 'actualizado' : 'creado'} correctamente`,
          );
          this.toggleOffcanvas();
          this.loadTrips();
        },
        error: (error: any) => {
          console.error('Error saving trip:', error);
          this.toastService.showError('Error', 'Error al guardar el viaje');
        },
      });
    }
  }

  getVehiclePlate(vehicleId: number): string {
    const v = this.vehicles.find((veh) => veh.id === vehicleId);
    return v ? v.plate : '';
  }
}
