import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin } from 'rxjs';
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
import { DriverService } from 'src/app/services/driver.service';
import { GTripFormComponent } from '../../components/g-trip-form/g-trip-form.component';
import { GTripInfoCardComponent } from '../../components/g-trip-info-card/g-trip-info-card.component';

export interface TripOwnerGroup {
  owner: ModelOwner;
  trips: ModelTrip[];
}

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [
    FormsModule,
    GTripCardComponent,
    GVehicleOwnerCardComponent,
    GTripFormComponent,
    GTripInfoCardComponent,
  ],
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.scss'],
})
export class TripsComponent implements OnInit, OnDestroy {
  allTrips: ModelTrip[] = [];
  totalTrips: number = 0;
  inProgressTrips: number = 0;
  completedTrips: number = 0;
  pendingTrips: number = 0;
  selectedStatus: string | null = null;

  // Global cache for Admin role
  globalStats = {
    total: 0,
    inProgress: 0,
    completed: 0,
    pending: 0,
  };

  searchTerm: string = '';
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  // Grouped display
  groupedTrips: TripOwnerGroup[] = [];

  // Offcanvas state
  isOffcanvasOpen: boolean = false;
  editingTrip: ModelTrip | null = null;
  showingActiveTripWarning: boolean = false;

  // Maps info card state
  isTripInfoOpen: boolean = false;
  latestTripOrigin: string = '';
  latestTripDestination: string = '';
  latestTripAxles: number = 2;

  // Selection Lists for parent context
  owners: ModelOwner[] = [];
  cities: any[] = [];
  vehicles: any[] = [];

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  loggedInDriverId: number | null = null;
  loggedInOwner: ModelOwner | null = null;
  private userSub?: Subscription;
  expandedOwnerId: number | null = null;
  ownerTrips: ModelTrip[] = [];
  totalOwners: number = 0;

  // filters
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;
  isLoadingExpandedTrips: boolean = false;
  expandedOwnerVehiclesCount: number = 0;

  /** driverId filter when navigated from driver profile (query param) */
  driverIdFilter: number | null = null;
  filteredDriver: any | null = null;

  constructor(
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    const rawDriverId = this.route.snapshot.queryParamMap.get('driverId');
    if (rawDriverId != null) {
      this.driverIdFilter = Number(rawDriverId);
      this.loadFilteredDriver(this.driverIdFilter);
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
      [new Filter('id', '=', ownerId.toString())],
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

  loadFilteredDriver(driverId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', driverId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredDriver = response.data.content[0];
          this.loadTrips();
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
          } else if (this.userRole === 'CONDUCTOR') {
            this.loadDriverIdByUser(user.id);
          }
        }
      },
    });
  }

  loadDriverIdByUser(userId: number | null | undefined): void {
    if (userId == null) return;
    const filter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          const driver = response.data.content[0];
          this.loggedInDriverId = driver.id;
          this.loggedInOwnerId = driver.ownerId; // Crucial for form context
          if (this.loggedInOwnerId) {
            this.loadOwnerById(this.loggedInOwnerId);
          }
          this.loadTrips();
        }
      },
    });
  }

  loadOwnerById(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.loggedInOwner = response.data.content[0];
          this.applyFilter();
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
      new Pagination(this.rows, this.page),
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
            this.totalOwners = response.data.totalElements ?? 0;
            this.applyFilter();
          }
        }
      },
    });
  }

  private getBaseFilters(): Filter[] {
    let filtros: Filter[] = [];

    if (this.driverIdFilter) {
      filtros.push(
        new Filter('driver.id', '=', this.driverIdFilter.toString()),
      );
    } else if (this.userRole === 'CONDUCTOR' && this.loggedInDriverId != null) {
      filtros.push(
        new Filter('driver.id', '=', this.loggedInDriverId.toString()),
      );
    } else if (
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
        // If we are scoped to an owner but they have no vehicles,
        // add a dummy filter to avoid returning ALL trips globally.
        filtros.push(new Filter('vehicle.id', '=', '-1'));
      }
    }
    return filtros;
  }

  private updateStatusCounts(): void {
    const baseFilters = this.getBaseFilters();

    forkJoin({
      total: this.tripService.getTripFilter(
        new ModelFilterTable(
          baseFilters,
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      inProgress: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...baseFilters, new Filter('status', '=', 'En Curso')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      pending: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...baseFilters, new Filter('status', '=', 'Pendiente')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      completed: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...baseFilters, new Filter('status', '=', 'Completado')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
    }).subscribe({
      next: (resps: any) => {
        this.totalTrips = resps.total?.data?.totalElements ?? 0;
        this.inProgressTrips = resps.inProgress?.data?.totalElements ?? 0;
        this.pendingTrips = resps.pending?.data?.totalElements ?? 0;
        this.completedTrips = resps.completed?.data?.totalElements ?? 0;

        if (this.userRole === 'ADMINISTRADOR') {
          this.globalStats = {
            total: this.totalTrips,
            inProgress: this.inProgressTrips,
            completed: this.completedTrips,
            pending: this.pendingTrips,
          };
        }
      },
    });
  }

  loadTrips(): void {
    const filtros = this.getBaseFilters();

    // Only update global counters if NO owner is expanded (Admin)
    if (!this.expandedOwnerId) {
      this.updateStatusCounts();
    }

    if (this.selectedStatus) {
      filtros.push(new Filter('status', '=', this.selectedStatus));
    }

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('startDate', false),
    );

    this.loading = true;
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.allTrips = response?.data?.content ?? [];

        // Identify missing owners needed for grouping
        const getOwnerId = (t: ModelTrip): number | undefined => {
          if (t.driver?.ownerId) return t.driver.ownerId;
          if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
            return t.vehicle.owners[0].ownerId;
          }
          return undefined;
        };

        const currentOwnerIds = this.owners.map((o) => o.id);
        const missingOwnerIds = [
          ...new Set(
            this.allTrips
              .map((t) => getOwnerId(t))
              .filter(
                (id): id is number =>
                  id != null &&
                  !currentOwnerIds.includes(id) &&
                  id !== this.ownerIdFilter,
              ),
          ),
        ];

        if (missingOwnerIds.length > 0) {
          this.fetchMissingOwners(missingOwnerIds);
        } else {
          this.applyFilter();
        }
      },
      error: (error: any) => {
        console.error('Error loading trips:', error);
        this.toastService.showError('Error', 'Error al cargar viajes');
        this.loading = false;
      },
    });
  }

  fetchMissingOwners(ids: number[]): void {
    const filter = new ModelFilterTable(
      [new Filter('id', 'in', ids.join(','))],
      new Pagination(ids.length, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = [...this.owners, ...response.data.content];
          this.applyFilter();
        }
      },
      error: (err) => {
        console.error('Error fetching missing owners:', err);
        this.applyFilter();
      },
    });
  }

  calculateStats(trips?: ModelTrip[]): void {
    const source = trips ?? this.allTrips;

    const inProgress = source.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'IN_PROGRESS' || status === 'EN CURSO';
    }).length;

    const completed = source.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'COMPLETED' || status === 'COMPLETADO';
    }).length;

    const pending = source.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'PENDING' || status === 'PENDIENTE';
    }).length;

    if (trips) {
      // Temporary/Filtered stats
      this.totalTrips = source.length;
      this.inProgressTrips = inProgress;
      this.completedTrips = completed;
      this.pendingTrips = pending;
    } else {
      // Master stats
      this.inProgressTrips = inProgress;
      this.completedTrips = completed;
      this.pendingTrips = pending;
    }
  }

  applyFilter(): void {
    let filtered = this.allTrips;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = this.allTrips.filter((t) => {
        const originName = this.cities
          .find((c) => String(c.id) === String(t.originId))
          ?.name?.toLowerCase();
        const destName = this.cities
          .find((c) => String(c.id) === String(t.destinationId))
          ?.name?.toLowerCase();

        return (
          (t.numberTrip?.toLowerCase() || '').includes(term) ||
          (t.manifestNumber?.toLowerCase() || '').includes(term) ||
          (originName || '').includes(term) ||
          (destName || '').includes(term) ||
          (t.originId?.toLowerCase() || '').includes(term) ||
          (t.destinationId?.toLowerCase() || '').includes(term) ||
          (t.vehicle?.plate?.toLowerCase() || '').includes(term) ||
          (t.driver?.name?.toLowerCase() || '').includes(term)
        );
      });
    }
    this.buildGroups(filtered);
    this.loading = false;
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

    if (this.userRole === 'PROPIETARIO' || this.userRole === 'CONDUCTOR') {
      const ownerId = this.loggedInOwnerId;
      const owner =
        this.loggedInOwner ??
        this.owners.find((o) => o.id === ownerId) ??
        new ModelOwner(
          ownerId ?? undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'Mi Propietario',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'Activo',
        );
      const ownerTrips = trips.filter((t) => getOwnerId(t) === ownerId);
      groups.push({ owner, trips: ownerTrips });
      this.groupedTrips = groups;
      return;
    }

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

    groups.sort((a, b) =>
      (a.owner.name || '').localeCompare(b.owner.name || '', 'es'),
    );

    this.groupedTrips = groups;
  }

  toggleOwnerExpansion(owner: ModelOwner): void {
    if (this.userRole !== 'ADMINISTRADOR') return;

    if (this.expandedOwnerId === owner.id) {
      this.expandedOwnerId = null;
      this.ownerTrips = [];
      this.expandedOwnerVehiclesCount = 0;
      // Restore global stats
      this.totalTrips = this.globalStats.total;
      this.inProgressTrips = this.globalStats.inProgress;
      this.completedTrips = this.globalStats.completed;
      this.pendingTrips = this.globalStats.pending;
    } else {
      this.expandedOwnerId = owner.id ?? null;
      if (this.expandedOwnerId) {
        this.isLoadingExpandedTrips = true;
        this.ownerTrips = []; // Clear previous to avoid flicker
        this.expandedOwnerVehiclesCount = 0;
        this.loadTripsForAdmin(this.expandedOwnerId);
      }
    }
  }

  private loadTripsForAdmin(ownerId: number): void {
    const vehicleFilter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('id', true),
    );

    this.vehicleService.getVehicleOwnerFilter(vehicleFilter).subscribe({
      next: (respVehicles: any) => {
        const vehicles = respVehicles?.data?.content ?? [];
        this.expandedOwnerVehiclesCount = vehicles.length;
        const vehicleIds = vehicles
          .map((v: any) => v.id)
          .filter((id: any) => id != null)
          .join(',');

        if (!vehicleIds) {
          this.ownerTrips = [];
          this.calculateStats(this.ownerTrips);
          this.isLoadingExpandedTrips = false;
          return;
        }

        const tripFiltros = [new Filter('vehicle.id', 'in', vehicleIds)];
        if (this.searchTerm) {
          tripFiltros.push(
            new Filter('manifestNumber', 'like', this.searchTerm),
          );
        }

        const tripFilter = new ModelFilterTable(
          tripFiltros,
          new Pagination(20000, 0),
          new Sort('startDate', false),
        );

        this.tripService.getTripFilter(tripFilter).subscribe({
          next: (respTrips: any) => {
            this.ownerTrips = respTrips?.data?.content ?? [];
            this.calculateStats(this.ownerTrips);
            this.isLoadingExpandedTrips = false;
          },
          error: () => {
            this.ownerTrips = [];
            this.calculateStats(this.ownerTrips);
            this.isLoadingExpandedTrips = false;
            this.expandedOwnerVehiclesCount = 0;
          },
        });
      },
      error: () => {
        this.ownerTrips = [];
        this.calculateStats(this.ownerTrips);
        this.isLoadingExpandedTrips = false;
        this.expandedOwnerVehiclesCount = 0;
      },
    });
  }

  get dataTotal(): number {
    return this.userRole === 'ADMINISTRADOR'
      ? this.totalOwners
      : this.totalTrips;
  }

  get itemsShownCount(): number {
    return this.userRole === 'ADMINISTRADOR'
      ? this.owners.length
      : this.allTrips.length;
  }

  get filteredOwnerTrips(): ModelTrip[] {
    if (!this.selectedStatus) return this.ownerTrips;
    return this.ownerTrips.filter((t) => {
      const s = (t.status || '').toUpperCase();
      const target = this.selectedStatus!.toUpperCase();
      if (target === 'EN CURSO') return s === 'EN CURSO' || s === 'IN_PROGRESS';
      if (target === 'PENDIENTE') return s === 'PENDIENTE' || s === 'PENDING';
      if (target === 'COMPLETADO')
        return s === 'COMPLETADO' || s === 'COMPLETED';
      return s === target;
    });
  }

  get showActiveTripAlert(): boolean {
    if (this.userRole === 'ADMINISTRADOR') {
      // For Admin, only show when an owner is expanded and has active trips equal or more than his vehicles count
      if (!this.expandedOwnerId) return false;
      const activeOwnerTripsCount = this.ownerTrips.filter((t) => {
        const s = (t.status || '').toUpperCase();
        return s === 'EN CURSO' || s === 'IN_PROGRESS';
      }).length;
      return activeOwnerTripsCount >= this.expandedOwnerVehiclesCount;
    }

    if (this.userRole === 'PROPIETARIO') {
      // If owner has 3 vehicles, they can have up to 3 trips in progress
      return this.inProgressTrips >= this.vehicles.length;
    }

    // For CONDUCTOR, check global inProgress count (they have 1 vehicle)
    return this.inProgressTrips > 0;
  }

  get totalPages(): number {
    return Math.ceil(this.dataTotal / this.rows);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.expandedOwnerId = null;
      this.ownerTrips = [];
      if (this.userRole === 'ADMINISTRADOR') {
        this.loadOwners();
      } else {
        this.loadTrips();
      }
    }
  }

  toggleOffcanvas(trip?: ModelTrip): void {
    // If opening for a NEW trip, check if there's already an active one
    if (!this.isOffcanvasOpen && !trip && this.showActiveTripAlert) {
      this.showingActiveTripWarning = true;
      return;
    }
    this.showingActiveTripWarning = false;
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      this.editingTrip = trip ?? null;
    }
  }

  dismissActiveTripWarning(): void {
    this.showingActiveTripWarning = false;
  }

  filterByStatus(status: string | null): void {
    this.selectedStatus = status;
    this.page = 0;
    this.loadTrips();

    if (this.userRole === 'ADMINISTRADOR' && this.expandedOwnerId) {
      this.loadTripsForAdmin(this.expandedOwnerId);
    }
  }

  onTripSaved(savedTrip?: ModelTrip): void {
    this.toggleOffcanvas();
    this.loadTrips();

    if (
      savedTrip &&
      (this.userRole === 'PROPIETARIO' || this.userRole === 'ADMINISTRADOR')
    ) {
      const originName =
        this.cities.find((c) => String(c.id) === String(savedTrip.originId))
          ?.name || 'N/A';
      const destName =
        this.cities.find(
          (c) => String(c.id) === String(savedTrip.destinationId),
        )?.name || 'N/A';

      this.latestTripOrigin = originName;
      this.latestTripDestination = destName;

      // Find the full vehicle object to get the correct number of axles
      const fullVehicle = this.vehicles.find(
        (v) => String(v.id) === String(savedTrip.vehicleId),
      );
      this.latestTripAxles = fullVehicle?.numberOfAxles || 2;

      this.isTripInfoOpen = true;
    }
  }

  closeTripInfo(): void {
    this.isTripInfoOpen = false;
  }
}
