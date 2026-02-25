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
import { DriverService } from 'src/app/services/driver.service';
import { ModelDriver } from 'src/app/models/driver-model';

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
  drivers: ModelDriver[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];
  brands: any[] = [];
  loadingVehicles: boolean = false;
  loadingDrivers: boolean = false;
  private _pendingVehicleId: number | null = null;
  private _pendingDriverId: number | null = null;
  private readonly ownerChangeSub?: Subscription;
  private readonly vehicleChangeSub?: Subscription;

  // Mock lists
  loadTypes: string[] = [
    'General',
    'Refrigerada',
    'Granel',
    'Peligrosa',
    'Contenedores',
  ];
  companies: string[] = [
    'CashTruck Logistics',
    'Transportes Unidos',
    'Carga Segura S.A.',
    'Ruta Rápida',
    'Logística Avanzada',
  ];
  tripStatuses: string[] = [
    'Planeado',
    'En Curso',
    'Completado',
    'Cancelado',
    'Pendiente',
  ];

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
    private readonly driverService: DriverService,
    private readonly route: ActivatedRoute,
  ) {
    this.tripForm = this.fb.group({
      numberTrip: ['', [Validators.required]],
      manifestNumber: ['', [Validators.required]],
      origin: ['', [Validators.required]],
      destination: ['', [Validators.required]],
      freight: [0, [Validators.required, Validators.min(0), Validators.max(999999999)]],
      advancePayment: [0, [Validators.required, Validators.min(0), Validators.max(999999999)]],
      balance: [0],
      startDate: [
        new Date().toISOString().split('T')[0],
        [Validators.required],
      ],
      ownerId: [null, [Validators.required]],
      vehicleId: [null, [Validators.required]],
      driverId: [null, [Validators.required]],
      loadType: ['', [Validators.required]],
      company: ['', [Validators.required]],
      status: ['En Curso'],
    });

    this.ownerChangeSub = this.tripForm
      .get('ownerId')!
      .valueChanges.subscribe((ownerId) => {
        this.tripForm.get('vehicleId')?.setValue(null);
        this.tripForm.get('driverId')?.setValue(null);
        this.vehicles = [];
        this.drivers = [];
        if (ownerId) {
          this.loadVehiclesByOwner(Number(ownerId));
          this.loadDriversByOwner(Number(ownerId));
        }
      });

    this.vehicleChangeSub = this.tripForm
      .get('vehicleId')!
      .valueChanges.subscribe((vehicleId) => {
        if (vehicleId) {
          const selectedVehicle = this.vehicles.find(
            (v) => String(v.id) === String(vehicleId),
          );
          if (selectedVehicle) {
            this.tripForm
              .get('driverId')
              ?.setValue(selectedVehicle.currentDriverId);

            // Calculate next trip number for this vehicle
            if (!this.editingTrip) {
              const vehicleTripsCount = this.allTrips.filter(
                (t) => String(t.vehicleId) === String(vehicleId),
              ).length;
              this.tripForm.get('numberTrip')?.setValue(vehicleTripsCount + 1);
            }
          } else {
            this.tripForm.get('driverId')?.setValue(null);
            if (!this.editingTrip)
              this.tripForm.get('numberTrip')?.setValue('');
          }
        } else {
          this.tripForm.get('driverId')?.setValue(null);
          if (!this.editingTrip) this.tripForm.get('numberTrip')?.setValue('');
        }
      });

    // Auto-calculate balance
    this.tripForm.valueChanges.subscribe((values) => {
      const freight = Number(values.freight) || 0;
      const advancePayment = Number(values.advancePayment) || 0;
      this.tripForm.get('balance')?.setValue(freight - advancePayment, {
        emitEvent: false,
      });
    });
  }

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    this.subscribeToUserContext();
    this.loadCities();
    this.loadBrands();
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data.sort((a: any, b: any) => {
            const stateCmp = (a.state || '').localeCompare(b.state || '', 'es');
            return stateCmp !== 0
              ? stateCmp
              : a.name.localeCompare(b.name, 'es');
          });
          this.groupedCities = this.buildGroupedCities();
        }
      },
      error: (err: any) => console.error('Error loading cities:', err),
    });
  }

  private buildGroupedCities(): { state: string; cities: any[] }[] {
    const map = new Map<string, any[]>();
    for (const city of this.cities) {
      const state = city.state || 'Sin departamento';
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(city);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([state, cities]) => ({ state, cities }));
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
    this.vehicleChangeSub?.unsubscribe();
  }

  loadVehiclesByOwner(ownerId: number, isInitialLoad: boolean = false): void {
    if (!isInitialLoad) this.loadingVehicles = true;
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('owner.id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        this.mapBrandNames();
        this.loadingVehicles = false;
        if (this._pendingVehicleId != null) {
          // Edit mode: restore the trip's vehicle
          this.tripForm
            .get('vehicleId')
            ?.setValue(this._pendingVehicleId, { emitEvent: false });
          this._pendingVehicleId = null;
        } else if (!this.editingTrip && this.vehicles.length === 1) {
          // Create mode: auto-select the only vehicle
          this.tripForm.get('vehicleId')?.setValue(this.vehicles[0].id);
        }
        if (isInitialLoad) {
          this.loadTrips();
        }
      },
      error: () => {
        this.vehicles = [];
        this.loadingVehicles = false;
        if (isInitialLoad) {
          this.loadTrips();
        }
      },
    });
  }

  loadDriversByOwner(ownerId: number): void {
    this.loadingDrivers = true;
    const filter = new ModelFilterTable(
      [new Filter('ownerId', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('name', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        this.drivers = response?.data?.content ?? [];
        this.loadingDrivers = false;
        if (this._pendingDriverId != null) {
          // Edit mode: restore the trip's driver
          this.tripForm.get('driverId')?.setValue(this._pendingDriverId);
          this._pendingDriverId = null;
        } else if (!this.editingTrip && this.drivers.length === 1) {
          // Create mode: auto-select the only driver
          this.tripForm.get('driverId')?.setValue(this.drivers[0].id);
        }
      },
      error: () => {
        this.drivers = [];
        this.loadingDrivers = false;
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
          const owners = response.data.content;
          this.owners = owners;
          if (this.userRole === 'PROPIETARIO' && owners.length > 0) {
            this.loggedInOwner = owners[0];
            this.loggedInOwnerId =
              this.loggedInOwner?.id ?? this.loggedInOwnerId;
            if (this.loggedInOwnerId) {
              this.loadVehiclesByOwner(this.loggedInOwnerId, true);
              this.loadDriversByOwner(this.loggedInOwnerId);
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

    // Filter by vehicle.id list if we have a context-specific owner (Role or QueryParam)
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
        // If no vehicles found for the owner, we probably shouldn't see any trips
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

    // Helper to get ownerId from trip
    const getOwnerId = (t: ModelTrip): number | undefined => {
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

        // Determine ownerId to load vehicles/drivers for this trip
        const tripOwnerId: number | null =
          this.userRole === 'PROPIETARIO'
            ? this.loggedInOwnerId
            : (trip.driver?.ownerId ??
              trip.vehicle?.owners?.[0]?.ownerId ??
              null);

        if (tripOwnerId) {
          this._pendingVehicleId = trip.vehicleId ?? null;
          this._pendingDriverId = trip.driverId ?? null;
          this.loadVehiclesByOwner(Number(tripOwnerId));
          this.loadDriversByOwner(Number(tripOwnerId));
        }

        this.tripForm.patchValue({
          numberTrip: trip.numberTrip,
          manifestNumber: trip.manifestNumber,
          origin: trip.origin,
          destination: trip.destination,
          freight: trip.freight,
          advancePayment: trip.advancePayment,
          startDate: trip.startDate,
          vehicleId: trip.vehicleId,
          driverId: trip.driverId,
          loadType: trip.loadType,
          company: trip.company,
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
          freight: 0,
          advancePayment: 0,
          startDate: new Date().toISOString().split('T')[0],
          status: 'En Curso',
          driverId: null,
          loadType: '',
          company: '',
        });

        // For PROPIETARIO: pre-set ownerId so vehicle/driver selects populate
        if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId) {
          this.tripForm.get('ownerId')?.setValue(this.loggedInOwnerId);
          this.tripForm.get('ownerId')?.disable();
        }
      }
    }
  }

  onSubmit(): void {
    if (this.tripForm.valid) {
      const { ownerId, balance, ...formData } = this.tripForm.getRawValue();
      const tripData: ModelTrip = {
        ...formData,
        numberOfDays: 0,
        paidBalance: false,
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

  loadBrands(): void {
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.brands = response.data;
          this.mapBrandNames();
        }
      },
      error: (error: any) => {
        console.error('Error loading brands:', error);
      },
    });
  }

  formatCurrencyInput(controlName: string, event: any): void {
    const MAX = 999_999_999;
    const input = event.target as HTMLInputElement;
    const value = input.value;
    if (value === null || value === undefined) return;

    // Remove non-numeric characters
    const stringValue = String(value).replaceAll(/\D/g, '');
    const numericValue = stringValue ? Number.parseInt(stringValue, 10) : 0;

    // Block if exceeds max: restore the previous displayed value
    if (numericValue > MAX) {
      const current = this.tripForm.get(controlName)?.value ?? 0;
      input.value = new Intl.NumberFormat('de-DE').format(current);
      return;
    }

    // Update form control with numeric value
    this.tripForm.get(controlName)?.setValue(numericValue, { emitEvent: true });
  }

  getFormattedValue(controlName: string): string {
    const value = this.tripForm.get(controlName)?.value;
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('de-DE').format(value);
  }

  mapBrandNames(): void {
    if (this.brands.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        const brand = this.brands.find(
          (b) => b.id.toString() === v.vehicleBrandId.toString(),
        );
        if (brand) {
          v.vehicleBrandName = brand.name;
        }
      });
    }
  }
}
