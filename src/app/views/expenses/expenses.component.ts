import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Observable, Subscription, map, of, switchMap, take } from 'rxjs';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import { CommonService } from 'src/app/services/common.service';
import { DriverService } from 'src/app/services/driver.service';
import { TokenService } from 'src/app/services/token.service';
import { GVehicleGoodCardComponent } from 'src/app/components/g-vehicle-good-card/g-vehicle-good-card.component';
import { GExpensesTripComponent } from 'src/app/components/g-expenses-trip/g-expenses-trip.component';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelExpense } from 'src/app/models/expense-model';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { GAddExpenseComponent } from 'src/app/components/g-add-expense/g-add-expense.component';
import { TripService } from 'src/app/services/trip.service';
import { ModelTrip } from 'src/app/models/trip-model';
import { GTripMiniCardComponent } from 'src/app/components/g-trip-mini-card/g-trip-mini-card.component';
import { GVehicleTripCardComponent } from 'src/app/components/g-vehicle-trip-card/g-vehicle-trip-card.component';
import { NotificationsService } from 'src/app/services/notifications.service';
import { LocationService } from 'src/app/services/location.service';
import { PaginationUtils } from 'src/app/utils/pagination-utils';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    CommonModule,
    GVehicleGoodCardComponent,
    GExpensesTripComponent,
    GAddExpenseComponent,
    GTripMiniCardComponent,
    GVehicleTripCardComponent,
  ],
  templateUrl: './expenses.component.html',
  styleUrls: ['./expenses.component.scss'],
})
export class ExpensesComponent implements OnInit, OnDestroy {
  @ViewChild(GExpensesTripComponent)
  expensesTripComponent?: GExpensesTripComponent;
  vehicles: ModelVehicle[] = [];
  selectedVehicle: ModelVehicle | null = null;
  selectedTrip: ModelTrip | null = null;
  showAddExpense = false;
  editingExpense: ModelExpense | null = null;
  preselectedExpenseTypeId: number | null = null;
  loadingVehicles = true;
  hideSelectionSections = false;
  isMaintenance = false;
  userRole = '';
  owners: any[] = [];
  selectedOwnerId: number | null = null;
  hasBackContext = false;
  tripIdParam: string | null = null;
  vehicleIdParam: string | null = null;
  originParam: string | null = null;

  brands: any[] = [];
  loadingBrands = false;

  carouselIndex = 0;
  visibleCount = 1;

  recentTrips: ModelTrip[] = [];
  cities: any[] = [];
  loadingTrips = false;
  isSavingExpense: boolean = false;
  maxVisibleDots = 10;

  private userSub?: Subscription;

  constructor(
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly driverService: DriverService,
    private readonly tokenService: TokenService,
    private readonly expenseService: ExpenseService,
    private readonly tripService: TripService,
    private readonly toastService: ToastService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly notificationsService: NotificationsService,
    private readonly locationService: LocationService,
  ) {}

  ngOnInit(): void {
    this.updateVisibleCount();
    this.loadBrands();
    this.loadCities();

    this.isMaintenance = this.route.snapshot.data['isMaintenance'] === true;

    this.route.queryParamMap.subscribe((params) => {
      const tripId = params.get('tripId');
      const vehicleIdInput = params.get('vehicleId');
      this.tripIdParam = tripId;
      this.vehicleIdParam = vehicleIdInput;
      this.originParam = params.get('origin');
      this.hasBackContext = !!tripId || !!vehicleIdInput;
      const vehicleId = vehicleIdInput ? Number(vehicleIdInput) : null;

      // Reset state for new params
      this.selectedVehicle = null;
      this.selectedTrip = null;
      this.hideSelectionSections = !!tripId; // Only hide if we have a focused trip

      this.userSub = this.securityService.userData$.subscribe((user) => {
        if (!user) {
          const payload = this.tokenService.getPayload();
          const userId = payload?.nameid ?? payload?.id ?? payload?.sub;
          if (userId) {
            this.securityService.fetchUserData(userId);
          }
          return;
        }

        const roles = (user.userRoles || []).map((ur: any) =>
          (ur.role?.name || '').toUpperCase(),
        );

        // Prioritize roles for UI context: ADMIN > PROPIETARIO > CONDUCTOR
        if (roles.includes('ADMINISTRADOR')) {
          this.userRole = 'ADMINISTRADOR';
        } else if (roles.includes('PROPIETARIO')) {
          this.userRole = 'PROPIETARIO';
        } else if (roles.includes('CONDUCTOR')) {
          this.userRole = 'CONDUCTOR';
        } else {
          this.userRole = roles[0] || '';
        }

        if (this.userRole === 'ADMINISTRADOR') {
          this.loadOwners();
        }

        // 1. Always load the list of vehicles for the user
        this.loadVehiclesForUser(user, vehicleId);

        if (vehicleId) {
          // Load the full vehicle data so g-vehicle-trip-card has plate, brand, year, etc.
          const vFilter = new ModelFilterTable(
            [new Filter('id', '=', vehicleId.toString())],
            new Pagination(1, 0),
            new Sort('id', true),
          );
          this.vehicleService.getVehicleFilter(vFilter).subscribe({
            next: (resp: any) => {
              if (resp?.data?.content?.length > 0) {
                this.selectedVehicle = resp.data.content[0];
                this.mapBrandNames();

                // Also load driver name if vehicle has a driver assigned
                if (resp.data.content[0].driver?.name) {
                  this.selectedVehicle!.currentDriverName =
                    resp.data.content[0].driver?.name;
                }
              }
            },
          });
        }

        // 2. If it's a focused trip view, perform additional validation and loading
        if (tripId && vehicleIdInput) {
          this.validateAccess(tripId, vehicleIdInput, user).subscribe({
            next: (hasAccess: boolean) => {
              if (!hasAccess) {
                this.toastService.showError(
                  'Acceso denegado',
                  'No tienes permiso para ver los gastos de este vehículo.',
                );
                this.router.navigate(['/site/expenses']);
                return;
              }

              this.selectedTrip = { id: Number(tripId) } as ModelTrip;

              // Load the full trip data
              const tripFilter = new ModelFilterTable(
                [new Filter('id', '=', tripId)],
                new Pagination(1, 0),
                new Sort('id', true),
              );
              this.tripService.getTripFilter(tripFilter).subscribe({
                next: (resp: any) => {
                  if (resp?.data?.content?.length > 0)
                    this.selectedTrip = resp.data.content[0];
                },
              });
            },
            error: () => {
              this.toastService.showError(
                'Error',
                'No se pudo verificar el acceso al vehículo.',
              );
              this.router.navigate(['/expenses']);
            },
          });
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateVisibleCount();
    // Clamp index so it doesn't go out of bounds after resize
    this.carouselIndex = Math.min(
      this.carouselIndex,
      Math.max(0, this.vehicles.length - this.visibleCount),
    );
  }

  private updateVisibleCount(): void {
    this.visibleCount = window.innerWidth >= 768 ? 3 : 1;
  }

  // ── Authorization ─────────────────────────────────────────────────

  /**
   * Returns true if the current user is allowed to view the given vehicle and trip.
   * - Admin: always allowed.
   * - Propietario: vehicle must belong to owner, and trip must belong to vehicle.
   * - Conductor: vehicle must have this driver assigned, and trip must belong to vehicle.
   */
  private validateAccess(
    tripId: string,
    vehicleId: string,
    user: any,
  ): Observable<boolean> {
    const roles = new Set(
      (user.userRoles || []).map((ur: any) =>
        (ur.role?.name || '').toUpperCase(),
      ),
    );
    const isOwner = roles.has('PROPIETARIO');
    const isDriver = roles.has('CONDUCTOR');

    // Administrador – unrestricted
    if (!isOwner && !isDriver) {
      return of(true);
    }

    if (isOwner) {
      // 1. Validate Owner -> Vehicle
      const ownerFilter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      return this.ownerService.getOwnerFilter(ownerFilter).pipe(
        switchMap((ownerResp: any) => {
          const owner = ownerResp?.data?.content?.[0];
          if (!owner?.id) return of(false);

          const vehicleFilter = new ModelFilterTable(
            [
              new Filter('owner.id', '=', owner.id.toString()),
              new Filter('vehicleId', '=', vehicleId),
            ],
            new Pagination(1, 0),
            new Sort('id', true),
          );
          return this.vehicleService.getVehicleOwnerFilter(vehicleFilter).pipe(
            switchMap((vResp: any) => {
              if (vResp?.data?.content?.length === 0) return of(false);

              if (this.isMaintenance) return of(true);

              // 2. Validate Vehicle -> Trip
              const tripFilter = new ModelFilterTable(
                [
                  new Filter('id', '=', tripId),
                  new Filter('vehicleId', '=', vehicleId),
                ],
                new Pagination(1, 0),
                new Sort('id', true),
              );
              return this.tripService
                .getTripFilter(tripFilter)
                .pipe(
                  map((tResp: any) => (tResp?.data?.content?.length ?? 0) > 0),
                );
            }),
          );
        }),
      );
    }

    // CONDUCTOR – currentDriverId must match, and trip must belong to vehicle
    // Note: If user is both owner and driver, we already checked owner access above.
    // If they got here, isOwner was false or they didn't have owner access to this specific vehicle.
    const driverFilter = new ModelFilterTable(
      [new Filter('user.id', '=', user.id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    return this.driverService.getDriverFilter(driverFilter).pipe(
      switchMap((driverResp: any) => {
        const driver = driverResp?.data?.content?.[0];
        if (!driver?.id) return of(false);

        const vehicleFilter = new ModelFilterTable(
          [
            new Filter('currentDriverId', '=', driver.id.toString()),
            new Filter('id', '=', vehicleId),
          ],
          new Pagination(1, 0),
          new Sort('id', true),
        );
        return this.vehicleService.getVehicleFilter(vehicleFilter).pipe(
          switchMap((vResp: any) => {
            if (vResp?.data?.content?.length === 0) return of(false);

            if (this.isMaintenance) return of(true);

            // 2. Validate Vehicle -> Trip
            const tripFilter = new ModelFilterTable(
              [
                new Filter('id', '=', tripId),
                new Filter('vehicleId', '=', vehicleId),
              ],
              new Pagination(1, 0),
              new Sort('id', true),
            );
            return this.tripService
              .getTripFilter(tripFilter)
              .pipe(
                map((tResp: any) => (tResp?.data?.content?.length ?? 0) > 0),
              );
          }),
        );
      }),
    );
  }

  // ── Data loading ─────────────────────────────────────────────────

  private loadVehiclesForUser(
    user: any,
    preselectedId: number | null = null,
  ): void {
    const roles = new Set(
      (user.userRoles || []).map((ur: any) =>
        (ur.role?.name || '').toUpperCase(),
      ),
    );

    if (roles.has('PROPIETARIO')) {
      const filter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id.toString())],
        new Pagination(9999, 0),
        new Sort('id', true),
      );
      this.ownerService.getOwnerFilter(filter).subscribe({
        next: (resp: any) => {
          const owner = resp?.data?.content?.[0];
          if (owner?.id) {
            this.loadVehiclesByOwner(owner.id, preselectedId);
          } else {
            this.loadingVehicles = false;
          }
        },
        error: () => (this.loadingVehicles = false),
      });
    } else if (roles.has('CONDUCTOR')) {
      this.loadVehiclesByDriver(user.id, preselectedId);
    } else {
      let filtros: Filter[] = [];
      if (this.selectedOwnerId) {
        filtros.push(
          new Filter('owner.id', '=', this.selectedOwnerId.toString()),
        );
      }
      const filter = new ModelFilterTable(
        filtros,
        new Pagination(9999, 0),
        new Sort('id', true),
      );
      this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
        next: (resp: any) => {
          this.vehicles = (resp?.data?.content ?? [])
            .filter((v: any) => v.status !== 'Vendido')
            .sort((a: any, b: any) =>
              a.plate.localeCompare(b.plate, 'es', { sensitivity: 'base' }),
            );
          if (this.vehicles.length > 0) {
            this.vehicles.forEach((v: any) => {
              if (v.driver?.name) {
                v.currentDriverName = v.driver.name;
              }
            });

            const index = preselectedId
              ? this.vehicles.findIndex((v) => v.id === preselectedId)
              : -1;
            const pre = index === -1 ? null : this.vehicles[index];
            this.selectVehicle(pre || this.vehicles[0]);

            if (index !== -1) {
              this.ensureVehicleIsVisible(index);
            }
          }
          this.loadingVehicles = false;
          this.mapBrandNames();
        },
        error: () => (this.loadingVehicles = false),
      });
    }
  }

  private loadVehiclesByOwner(
    ownerId: number,
    preselectedId: number | null = null,
  ): void {
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(9999, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (resp: any) => {
        this.vehicles = (resp?.data?.content ?? [])
          .filter((v: any) => v.status !== 'Vendido')
          .sort((a: any, b: any) =>
            a.plate.localeCompare(b.plate, 'es', { sensitivity: 'base' }),
          );
        if (this.vehicles.length > 0) {
          this.vehicles.forEach((v: any) => {
            if (v.driver?.name) {
              v.currentDriverName = v.driver.name;
            }
          });

          const index = preselectedId
            ? this.vehicles.findIndex((v) => v.id === preselectedId)
            : -1;
          const pre = index === -1 ? null : this.vehicles[index];
          this.selectVehicle(pre || this.vehicles[0]);

          if (index !== -1) {
            this.ensureVehicleIsVisible(index);
          }
        }
        this.carouselIndex = 0;
        this.loadingVehicles = false;
        this.mapBrandNames();
      },
      error: () => (this.loadingVehicles = false),
    });
  }

  private loadVehiclesByDriver(
    userId: number,
    preselectedId: number | null = null,
  ): void {
    const driverFilter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(driverFilter).subscribe({
      next: (driverResp: any) => {
        const driver = driverResp?.data?.content?.[0];
        if (driver?.id) {
          const vehicleFilter = new ModelFilterTable(
            [new Filter('currentDriverId', '=', driver.id.toString())],
            new Pagination(9999, 0),
            new Sort('id', true),
          );
          this.vehicleService.getVehicleFilter(vehicleFilter).subscribe({
            next: (resp: any) => {
              this.vehicles = (resp?.data?.content ?? [])
                .filter((v: any) => v.status !== 'Vendido')
                .sort((a: any, b: any) =>
                  a.plate.localeCompare(b.plate, 'es', { sensitivity: 'base' }),
                );
              if (this.vehicles.length > 0) {
                this.vehicles.forEach((v: any) => {
                  if (v.driver?.name) {
                    v.currentDriverName = v.driver.name;
                  }
                });

                const index = preselectedId
                  ? this.vehicles.findIndex((v) => v.id === preselectedId)
                  : -1;
                const pre = index === -1 ? null : this.vehicles[index];
                this.selectVehicle(pre || this.vehicles[0]);

                if (index !== -1) {
                  this.ensureVehicleIsVisible(index);
                }
              }
              this.carouselIndex = 0;
              this.loadingVehicles = false;
              this.mapBrandNames();
            },
            error: () => (this.loadingVehicles = false),
          });
        } else {
          this.loadingVehicles = false;
        }
      },
      error: () => (this.loadingVehicles = false),
    });
  }

  private ensureVehicleIsVisible(index: number): void {
    if (index >= 0) {
      // Try to center it or at least make it the first one
      this.carouselIndex = Math.max(
        0,
        Math.min(index, this.vehicles.length - this.visibleCount),
      );
    }
  }

  loadOwners(): void {
    const filter = new ModelFilterTable(
      [],
      new Pagination(9999, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (resp: any) => {
        this.owners = resp?.data?.content || [];
      },
      error: (err) => console.error('Error loading owners:', err),
    });
  }

  onOwnerChange(event: any): void {
    const val = event.target.value;
    this.selectedOwnerId = val ? Number(val) : null;
    this.selectedVehicle = null;
    this.selectedTrip = null;
    this.loadingVehicles = true;
    this.vehicles = [];

    // Trigger reload
    this.securityService.userData$.pipe(take(1)).subscribe((user) => {
      if (user) this.loadVehiclesForUser(user);
    });
  }

  loadBrands(): void {
    this.loadingBrands = true;
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        this.brands = response?.data ?? [];
        this.loadingBrands = false;
        this.mapBrandNames();
        // Also enrich selectedVehicle in case it was loaded before brands (queryParams flow)
        if (
          this.selectedVehicle &&
          !this.selectedVehicle.vehicleBrandName &&
          this.selectedVehicle.vehicleBrandId
        ) {
          const brand = this.brands.find(
            (b) =>
              String(b.id) === String(this.selectedVehicle!.vehicleBrandId),
          );
          if (brand)
            this.selectedVehicle = {
              ...this.selectedVehicle,
              vehicleBrandName: brand.name,
            };
        }
      },
      error: (err) => {
        console.error('Error loading brands:', err);
        this.loadingBrands = false;
      },
    });
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

  mapBrandNames(): void {
    const mapFn = (v: ModelVehicle) => {
      if (!v.vehicleBrandName) {
        const brand = this.brands.find(
          (b) => String(b.id) === String(v.vehicleBrandId),
        );
        if (brand) v.vehicleBrandName = brand.name;
      }
    };

    if (this.brands.length > 0) {
      this.vehicles.forEach(mapFn);
      if (this.selectedVehicle) mapFn(this.selectedVehicle);
    }
  }

  // ── Carousel navigation ──────────────────────────────────────────

  get visibleVehicles(): ModelVehicle[] {
    return this.vehicles.slice(
      this.carouselIndex,
      this.carouselIndex + this.visibleCount,
    );
  }

  selectVehicle(vehicle: ModelVehicle): void {
    this.selectedVehicle = vehicle;
    if (
      this.tripIdParam &&
      this.vehicleIdParam === vehicle.id?.toString() &&
      (!this.selectedTrip ||
        this.selectedTrip.id?.toString() === this.tripIdParam)
    ) {
      // Do not clear selected trip when initially loading parameterized vehicle
    } else {
      this.selectedTrip = null; // Clear selected trip when changing vehicle
    }

    if (this.isMaintenance) {
      this.selectedTrip = { id: 0 } as ModelTrip;
      return;
    }

    if (vehicle.id) {
      this.loadRecentTrips(vehicle.id);
    }
  }

  selectTrip(trip: ModelTrip): void {
    if (this.selectedTrip?.id === trip.id) {
      this.selectedTrip = null; // Toggle off if already selected
    } else {
      this.selectedTrip = trip;
    }
  }

  loadRecentTrips(vehicleId: number): void {
    if (this.isMaintenance) return;
    this.loadingTrips = true;
    this.recentTrips = [];

    const filter = new ModelFilterTable(
      [new Filter('vehicle.id', '=', vehicleId.toString())],
      new Pagination(10, 0),
      new Sort('id', false), // Newest first
    );

    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          let trips: ModelTrip[] = response.data.content;

          // Logic to prioritize "En curso" or "En Curso" (case insensitive/variants)
          const isActive = (status: string) =>
            status?.toLowerCase().includes('curso') ||
            status?.toLowerCase().includes('ruta');

          const activeTrips = trips.filter((t) => isActive(t.status));
          const otherTrips = trips.filter((t) => !isActive(t.status));

          // Combine and take top 3
          this.recentTrips = [...activeTrips, ...otherTrips].slice(0, 3);

          // Auto-select the first trip (prioritized active then newest)
          if (this.recentTrips.length > 0) {
            if (
              this.tripIdParam &&
              vehicleId.toString() === this.vehicleIdParam
            ) {
              if (
                !this.selectedTrip ||
                this.selectedTrip.id?.toString() !== this.tripIdParam
              ) {
                const matchedTrip = this.recentTrips.find(
                  (t) => t.id?.toString() === this.tripIdParam,
                );
                if (matchedTrip) {
                  this.selectedTrip = matchedTrip;
                }
              }
            } else {
              this.selectedTrip = this.recentTrips[0];
            }
          }
        }
        this.loadingTrips = false;
      },
      error: (err) => {
        console.error('Error loading recent trips:', err);
        this.loadingTrips = false;
      },
    });
  }

  getCityName(cityId: any): string {
    if (!cityId) return 'N/A';
    const city = this.cities.find((c) => String(c.id) === String(cityId));
    if (!city) return String(cityId);
    return city.name;
  }

  prev(): void {
    if (this.canPrev) this.carouselIndex--;
  }

  next(): void {
    if (this.canNext) this.carouselIndex++;
  }

  get canPrev(): boolean {
    return this.carouselIndex > 0;
  }

  get canNext(): boolean {
    return this.carouselIndex + this.visibleCount < this.vehicles.length;
  }

  get totalDots(): number {
    return Math.max(0, this.vehicles.length - this.visibleCount + 1);
  }

  dotRange(): number[] {
    return PaginationUtils.getVisiblePages(
      this.carouselIndex,
      this.totalDots,
      this.maxVisibleDots,
    );
  }

  get isTripLockedForDriver(): boolean {
    if (
      this.userRole !== 'CONDUCTOR' ||
      this.isMaintenance ||
      !this.selectedTrip
    )
      return false;

    if (['Completado', 'Pendiente'].includes(this.selectedTrip.status || '')) {
      if (this.selectedTrip.endDate) {
        const end = new Date(this.selectedTrip.endDate);
        const now = new Date();
        const diffHours = (now.getTime() - end.getTime()) / (1000 * 60 * 60);
        return diffHours > 48;
      }
    }
    return false;
  }

  // ── Add Expense Offcanvas ──────────────────────────────────────────

  openAddExpense(typeId?: number): void {
    const tripRequired = !this.isMaintenance;
    const canOpen =
      this.selectedVehicle && (!tripRequired || this.selectedTrip);

    if (canOpen) {
      if (this.isTripLockedForDriver) {
        this.toastService.showError(
          'Acción denegada',
          'El periodo de 48 horas para registrar gastos en este viaje ha expirado.',
        );
        return;
      }
      this.editingExpense = null;
      this.preselectedExpenseTypeId = typeId || null;
      this.showAddExpense = true;
    } else {
      this.toastService.showError(
        'Atención',
        this.isMaintenance
          ? 'Selecciona un vehículo primero'
          : 'Selecciona un vehículo y un viaje primero',
      );
    }
  }

  onEditExpense(expense: ModelExpense): void {
    if (this.isTripLockedForDriver) {
      this.toastService.showError(
        'Acción denegada',
        'El periodo de 48 horas para modificar gastos en este viaje ha expirado.',
      );
      return;
    }
    this.editingExpense = expense;
    this.showAddExpense = true;
  }

  onExpenseAdded(event: any): void {
    if (event) {
      this.isSavingExpense = true;
      const isUpdating = !!this.editingExpense;
      let mensaje = '';
      if (this.isMaintenance) {
        mensaje = isUpdating
          ? 'Mantenimiento actualizado exitosamente!'
          : 'Mantenimiento registrado exitosamente!';
      } else {
        mensaje = isUpdating
          ? 'Gasto actualizado exitosamente!'
          : 'Gasto registrado exitosamente!';
      }
      this.expenseService.createExpense(event).subscribe({
        next: () => {
          this.toastService.showSuccess(
            this.isMaintenance ? 'Mantenimiento' : 'Gastos',
            mensaje,
          );
          this.showAddExpense = false;
          // Refresh list
          this.expensesTripComponent?.loadExpenses();
          this.notificationsService.refreshNotifications();
          this.reportLocationIfDriver();
          // Reset states AFTER potential usage
          this.editingExpense = null;
          this.preselectedExpenseTypeId = null;
          this.isSavingExpense = false;
        },
        error: (err) => {
          console.error('Error saving expense:', err);
          this.toastService.showError('Error', 'No se pudo registrar el gasto');
          this.isSavingExpense = false;
        },
      });
    } else {
      this.showAddExpense = false;
      this.editingExpense = null;
      this.preselectedExpenseTypeId = null;
    }
  }

  private reportLocationIfDriver(): void {
    this.securityService.userData$.pipe(take(1)).subscribe((user) => {
      if (user) {
        const roles = (user.userRoles || []).map((ur: any) =>
          (ur.role?.name || '').toUpperCase(),
        );
        if (roles.includes('CONDUCTOR')) {
          const vehicleId = this.selectedVehicle?.id;
          const tripId = this.selectedTrip?.id || null;
          const driverId = this.selectedVehicle?.currentDriverId;

          if (driverId && vehicleId) {
            this.locationService.reportDriverLocation(
              driverId,
              vehicleId,
              tripId,
              true,
            );
          }
        }
      }
    });
  }

  goBack(): void {
    if (this.originParam === 'detail' && this.tripIdParam) {
      this.router.navigate(['/site/trips', this.tripIdParam], {
        queryParams: { from: 'vehicles' },
      });
    } else if (this.originParam === 'list') {
      this.router.navigate(['/site/trips']);
    } else if (this.vehicleIdParam) {
      this.router.navigate(['/site/vehicles']);
    }
  }
}
