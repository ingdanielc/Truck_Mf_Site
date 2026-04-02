import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
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
import { PaginationUtils } from 'src/app/utils/pagination-utils';

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
  originFilter: string | null = null;
  destinationFilter: string | null = null;
  showFilters: boolean = false;
  isSearchActive: boolean = false;
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  get isSearchingTrips(): boolean {
    return (
      this.userRole === 'ADMINISTRADOR' &&
      (!!this.searchTerm || !!this.originFilter || !!this.destinationFilter) &&
      !this.expandedOwnerId &&
      !this.ownerIdFilter
    );
  }

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
  groupedCities: { state: string; cities: any[] }[] = [];
  vehicles: any[] = [];

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  loggedInDriverId: number | null = null;
  loggedInOwner: ModelOwner | null = null;
  private userSub?: Subscription;
  expandedOwnerId: number | null = null;
  expandedOwnerPage: number = 0;
  expandedOwnerRows: number = 9;
  ownerTrips: ModelTrip[] = [];
  totalExpandedTrips: number = 0;
  totalOwners: number = 0;

  // filters
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;
  isLoadingExpandedTrips: boolean = false;
  expandedOwnerVehiclesCount: number = 0;

  /** driverId filter when navigated from driver profile (query param) */
  driverIdFilter: number | null = null;
  filteredDriver: any;

  /** vehicleId filter when navigated from vehicle card (query param) */
  vehicleIdFilter: number | null = null;
  filteredVehicle: any;

  constructor(
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.isSearchActive = false;
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    const rawDriverId = this.route.snapshot.queryParamMap.get('driverId');
    if (rawDriverId != null) {
      this.driverIdFilter = Number(rawDriverId);
      this.loadFilteredDriver(this.driverIdFilter);
    }

    const rawVehicleId = this.route.snapshot.queryParamMap.get('vehicleId');
    if (rawVehicleId != null) {
      this.vehicleIdFilter = Number(rawVehicleId);
      this.loadFilteredVehicle(this.vehicleIdFilter);
    }

    this.subscribeToUserContext();
    this.loadCities();
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data.sort((a: any, b: any) => {
            const stateA = a.state || 'Sin departamento';
            const stateB = b.state || 'Sin departamento';
            if (stateA === stateB) {
              return (a.name || '').localeCompare(b.name || '');
            }
            return stateA.localeCompare(stateB);
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
      if (!map.has(state)) {
        map.set(state, []);
      }
      map.get(state)!.push(city);
    }
    return Array.from(map.entries())
      .map(([state, cities]) => ({ state, cities }))
      .sort((a, b) => a.state.localeCompare(b.state));
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

  loadFilteredVehicle(vehicleId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', vehicleId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredVehicle = response.data.content[0];
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

  goBackToVehicles(): void {
    this.router.navigate(['/site/vehicles']);
  }

  loadVehiclesByOwner(ownerId: number, isInitialLoad: boolean = false): void {
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('owner.id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        const content = response?.data?.content ?? [];
        this.vehicles = content.filter((v: any) => v.status !== 'Vendido');
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
            this.loading = false;
          }
        } else if (this.userRole === 'ADMINISTRADOR') this.loading = false;
      },
      error: () => {
        if (this.userRole === 'ADMINISTRADOR') this.loading = false;
      },
    });
  }

  private getBaseFilters(): Filter[] {
    let filtros: Filter[] = [];

    if (this.driverIdFilter) {
      filtros.push(
        new Filter('driver.id', '=', this.driverIdFilter.toString()),
      );
    } else if (
      this.vehicleIdFilter &&
      (this.userRole === 'PROPIETARIO' || this.userRole === 'CONDUCTOR')
    ) {
      filtros.push(
        new Filter('vehicle.id', '=', this.vehicleIdFilter.toString()),
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

  private updateStatusCounts(vehicleIds?: string): void {
    const filtros = vehicleIds
      ? [new Filter('vehicle.id', 'in', vehicleIds)]
      : this.getBaseFilters();

    // For non-ADMINISTRADOR roles (like PROPIETARIO), make counts search-aware
    // Also make them search-aware for expanded owner in Admin view (vehicleIds provided)
    if (
      this.userRole !== 'ADMINISTRADOR' ||
      this.isSearchingTrips ||
      vehicleIds
    ) {
      if (this.searchTerm) {
        filtros.push(new Filter('manifestNumber', 'like', this.searchTerm));
      }
      if (this.originFilter) {
        filtros.push(new Filter('originId', '=', this.originFilter.toString()));
      }
      if (this.destinationFilter) {
        filtros.push(
          new Filter('destinationId', '=', this.destinationFilter.toString()),
        );
      }
    }

    forkJoin({
      total: this.tripService.getTripFilter(
        new ModelFilterTable(
          filtros,
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      inProgress: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, new Filter('status', '=', 'En Curso')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      pending: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, new Filter('status', '=', 'Pendiente')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      completed: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, new Filter('status', '=', 'Completado')],
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

        if (this.userRole === 'ADMINISTRADOR' && !vehicleIds) {
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

    if (this.searchTerm && !this.isSearchActive) {
      filtros.push(new Filter('manifestNumber', 'like', this.searchTerm));
    }

    if (this.originFilter) {
      filtros.push(new Filter('originId', '=', this.originFilter.toString()));
    }
    if (this.destinationFilter) {
      filtros.push(
        new Filter('destinationId', '=', this.destinationFilter.toString()),
      );
    }

    const fetchRows = this.isSearchActive ? 20000 : this.rows;
    const fetchPage = this.isSearchActive ? 0 : this.page;

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(fetchRows, fetchPage),
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

        const currentOwnerIds = new Set(this.owners.map((o) => o.id));
        const missingOwnerIds = [
          ...new Set(
            this.allTrips
              .map((t) => getOwnerId(t))
              .filter(
                (id): id is number =>
                  id != null &&
                  !currentOwnerIds.has(id) &&
                  id !== this.ownerIdFilter,
              ),
          ),
        ];

        if (missingOwnerIds.length > 0) {
          this.fetchMissingOwners(missingOwnerIds);
        } else {
          this.applyFilter(true);
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
          this.applyFilter(true);
        }
      },
      error: (err) => {
        console.error('Error fetching missing owners:', err);
        this.applyFilter(true);
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

  applyFilter(fromLoadTrips: boolean = false): void {
    if (!fromLoadTrips) {
      this.isSearchActive = this.isSearchingTrips;
    }

    if (this.userRole === 'ADMINISTRADOR') {
      const filtersActive =
        !!this.searchTerm || !!this.originFilter || !!this.destinationFilter;

      // Case 1: Manual clearing of all filters (e.g. backspacing search input)
      if (!filtersActive && !fromLoadTrips) {
        if (this.isSearchActive || this.expandedOwnerId) {
          this.expandedOwnerId = null;
          this.isSearchActive = false;
          this.updateStatusCounts();
          this.page = 0;
          this.loadOwners();
          this.loading = false;
          return;
        }
      }

      // Case 2: Global Search (when NO owner is open)
      if (this.isSearchActive && !fromLoadTrips) {
        this.page = 0;
        this.expandedOwnerId = null; // Reset expansion when starting new global search
        this.loadTrips();
        return;
      }

      // Case 3: Filtering WITHIN an open card
      if (this.expandedOwnerId && filtersActive && !fromLoadTrips) {
        this.loadTripsForAdmin(this.expandedOwnerId);
        return;
      }

      // Case 4: Default return to main list
      if (!this.isSearchActive && !this.expandedOwnerId) {
        if (!fromLoadTrips) {
          this.page = 0;
          this.loadOwners();

          this.totalTrips = this.globalStats.total;
          this.inProgressTrips = this.globalStats.inProgress;
          this.completedTrips = this.globalStats.completed;
          this.pendingTrips = this.globalStats.pending;
        }
        this.loading = false;
        return;
      }
    } else if (this.userRole !== 'ADMINISTRADOR' && !fromLoadTrips) {
      this.page = 0;
      this.loadTrips();
      return;
    }

    let filtered = this.allTrips;

    if (this.originFilter) {
      filtered = filtered.filter(
        (t) => String(t.originId) === String(this.originFilter),
      );
    }

    if (this.destinationFilter) {
      filtered = filtered.filter(
        (t) => String(t.destinationId) === String(this.destinationFilter),
      );
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter((t) => {
        return (
          (t.numberTrip?.toLowerCase() || '').includes(term) ||
          (t.manifestNumber?.toLowerCase() || '').includes(term) ||
          (t.vehicle?.plate?.toLowerCase() || '').includes(term) ||
          (t.driver?.name?.toLowerCase() || '').includes(term)
        );
      });
    }

    if (this.userRole === 'ADMINISTRADOR' && this.isSearchActive) {
      this.calculateStats(filtered);

      // Extract unique owner IDs from the matching trips
      const getOwnerId = (t: ModelTrip): number | undefined => {
        if (t.driver?.ownerId) return t.driver.ownerId;
        if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
          return t.vehicle.owners[0].ownerId;
        }
        return undefined;
      };

      const matchingOwnerIds = [
        ...new Set(
          filtered.map((t) => getOwnerId(t)).filter((id) => id != null),
        ),
      ] as number[];

      // Show ONLY owners who have matching trips
      this.owners = this.owners.filter(
        (o) => o.id != null && matchingOwnerIds.includes(o.id),
      );
      this.totalOwners = this.owners.length;

      // Auto-expand the first owner if it's a new search
      if (fromLoadTrips && this.owners.length > 0 && !this.expandedOwnerId) {
        this.toggleOwnerExpansion(this.owners[0]);
      }
    }

    this.buildGroups(filtered);
    this.loading = false;
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  clearFilters(): void {
    this.originFilter = null;
    this.destinationFilter = null;
    this.searchTerm = '';
    this.expandedOwnerId = null;
    this.updateStatusCounts();
    this.applyFilter();
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
      this.expandedOwnerPage = 0;
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

  private loadTripsForAdmin(ownerId: number, page: number = 0): void {
    const vehicleFilter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('id', true),
    );

    this.vehicleService.getVehicleOwnerFilter(vehicleFilter).subscribe({
      next: (respVehicles: any) => {
        const vehicles = (respVehicles?.data?.content ?? []).filter(
          (v: any) => v.status !== 'Vendido',
        );
        this.expandedOwnerVehiclesCount = vehicles.length;
        const vehicleIds = vehicles
          .map((v: any) => v.id)
          .filter((id: any) => id != null)
          .join(',');

        if (!vehicleIds) {
          this.ownerTrips = [];
          this.totalExpandedTrips = 0;
          this.calculateStats(this.ownerTrips);
          this.isLoadingExpandedTrips = false;
          return;
        }

        const tripFiltros = [new Filter('vehicle.id', 'in', vehicleIds)];
        if (this.selectedStatus) {
          tripFiltros.push(new Filter('status', '=', this.selectedStatus));
        }
        if (this.searchTerm) {
          tripFiltros.push(
            new Filter('manifestNumber', 'like', this.searchTerm),
          );
        }
        if (this.originFilter) {
          tripFiltros.push(
            new Filter('originId', '=', this.originFilter.toString()),
          );
        }
        if (this.destinationFilter) {
          tripFiltros.push(
            new Filter('destinationId', '=', this.destinationFilter.toString()),
          );
        }

        // Update top-level status cards with owner-specific totals
        this.updateStatusCounts(vehicleIds);

        const tripFilter = new ModelFilterTable(
          tripFiltros,
          new Pagination(this.expandedOwnerRows, page),
          new Sort('startDate', false),
        );

        this.tripService.getTripFilter(tripFilter).subscribe({
          next: (respTrips: any) => {
            this.ownerTrips = respTrips?.data?.content ?? [];
            this.totalExpandedTrips = respTrips?.data?.totalElements ?? 0;
            this.isLoadingExpandedTrips = false;
          },
          error: () => {
            this.ownerTrips = [];
            this.totalExpandedTrips = 0;
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
    if (this.userRole === 'ADMINISTRADOR') {
      return this.totalOwners;
    }
    if (this.selectedStatus === 'En Curso') return this.inProgressTrips;
    if (this.selectedStatus === 'Pendiente') return this.pendingTrips;
    if (this.selectedStatus === 'Completado') return this.completedTrips;
    return this.totalTrips;
  }

  get itemsShownCount(): number {
    return this.userRole === 'ADMINISTRADOR'
      ? this.owners.length
      : this.groupedTrips.reduce((acc, g) => acc + g.trips.length, 0);
  }

  get filteredOwnerTrips(): ModelTrip[] {
    return this.ownerTrips;
  }

  get paginatedFilteredOwnerTrips(): ModelTrip[] {
    return this.ownerTrips;
  }

  get expandedTotalPages(): number {
    return Math.ceil(this.totalExpandedTrips / this.expandedOwnerRows);
  }

  get expandedDesktopPages(): number[] {
    return PaginationUtils.getVisiblePages(
      this.expandedOwnerPage,
      this.expandedTotalPages,
      12,
    );
  }

  get expandedMobilePages(): number[] {
    return PaginationUtils.getVisiblePages(
      this.expandedOwnerPage,
      this.expandedTotalPages,
      4,
    );
  }

  changeExpandedPage(newPage: number): void {
    if (
      newPage >= 0 &&
      newPage < this.expandedTotalPages &&
      newPage !== this.expandedOwnerPage
    ) {
      this.expandedOwnerPage = newPage;
      if (this.expandedOwnerId) {
        this.isLoadingExpandedTrips = true;
        this.loadTripsForAdmin(this.expandedOwnerId, newPage);
      }
    }
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

  get desktopPages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 12);
  }

  get mobilePages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 4);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.expandedOwnerId = null;
      this.ownerTrips = [];
      if (this.userRole === 'ADMINISTRADOR' && !this.isSearchActive) {
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
    // Keep a reference to the trip being edited before the offcanvas closes
    const tripBeforeSave = this.editingTrip;

    this.toggleOffcanvas();
    this.loadTrips();

    if (
      savedTrip &&
      (this.userRole === 'PROPIETARIO' ||
        this.userRole === 'ADMINISTRADOR' ||
        this.userRole === 'CONDUCTOR')
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
      // Try the vehicles list first, then fallback to the nested object in the trip being edited
      const vehicleId = savedTrip.vehicleId || tripBeforeSave?.vehicleId;
      const fullVehicle =
        this.vehicles.find((v) => String(v.id) === String(vehicleId)) ||
        (tripBeforeSave?.vehicleId === vehicleId
          ? tripBeforeSave?.vehicle
          : null);

      this.latestTripAxles = fullVehicle?.numberOfAxles || 2;

      this.isTripInfoOpen = true;
    }
  }

  closeTripInfo(): void {
    this.isTripInfoOpen = false;
  }
}
