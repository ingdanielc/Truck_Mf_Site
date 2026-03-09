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
import { ModelDriver } from 'src/app/models/driver-model';
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

  brands: any[] = [];
  loadingBrands = false;

  drivers: ModelDriver[] = [];
  loadingDrivers = false;

  carouselIndex = 0;
  visibleCount = 1;

  recentTrips: ModelTrip[] = [];
  cities: any[] = [];
  loadingTrips = false;

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
                if (this.selectedVehicle?.currentDriverId) {
                  const dFilter = new ModelFilterTable(
                    [
                      new Filter(
                        'id',
                        '=',
                        this.selectedVehicle.currentDriverId.toString(),
                      ),
                    ],
                    new Pagination(1, 0),
                    new Sort('id', true),
                  );
                  this.driverService.getDriverFilter(dFilter).subscribe({
                    next: (dResp: any) => {
                      if (dResp?.data?.content?.length > 0) {
                        const drv = dResp.data.content[0];
                        if (this.selectedVehicle)
                          this.selectedVehicle.currentDriverName = drv.name;
                      }
                    },
                  });
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
    const role = (user.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    // Administrador – unrestricted
    if (!role.includes('PROPIETARIO') && !role.includes('CONDUCTOR')) {
      return of(true);
    }

    if (role.includes('PROPIETARIO')) {
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
    const role = (user.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    if (role.includes('PROPIETARIO')) {
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
    } else if (role.includes('CONDUCTOR')) {
      this.loadVehiclesByDriver(user.id, preselectedId);
    } else {
      const filter = new ModelFilterTable(
        [],
        new Pagination(9999, 0),
        new Sort('id', true),
      );
      this.vehicleService.getVehicleFilter(filter).subscribe({
        next: (resp: any) => {
          this.vehicles = resp?.data?.content ?? [];
          if (this.vehicles.length > 0) {
            const index = preselectedId
              ? this.vehicles.findIndex((v) => v.id === preselectedId)
              : -1;
            const pre = index !== -1 ? this.vehicles[index] : null;
            this.selectVehicle(pre || this.vehicles[0]);

            if (index !== -1) {
              this.ensureVehicleIsVisible(index);
            }
          }
          this.loadingVehicles = false;
          this.mapBrandNames();
          this.loadDrivers(); // Admin: load all drivers
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
        this.vehicles = resp?.data?.content ?? [];
        if (this.vehicles.length > 0) {
          const index = preselectedId
            ? this.vehicles.findIndex((v) => v.id === preselectedId)
            : -1;
          const pre = index !== -1 ? this.vehicles[index] : null;
          this.selectVehicle(pre || this.vehicles[0]);

          if (index !== -1) {
            this.ensureVehicleIsVisible(index);
          }
        }
        this.carouselIndex = 0;
        this.loadingVehicles = false;
        this.mapBrandNames();
        this.loadDrivers(ownerId); // Owner: load only their drivers
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
              this.vehicles = resp?.data?.content ?? [];
              if (this.vehicles.length > 0) {
                const index = preselectedId
                  ? this.vehicles.findIndex((v) => v.id === preselectedId)
                  : -1;
                const pre = index !== -1 ? this.vehicles[index] : null;
                this.selectVehicle(pre || this.vehicles[0]);

                if (index !== -1) {
                  this.ensureVehicleIsVisible(index);
                }
              }
              this.carouselIndex = 0;
              this.loadingVehicles = false;
              this.mapBrandNames();
              // For conductor, they only see themselves as the driver
              this.drivers = [driver];
              this.mapDriverNames();
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

  loadDrivers(ownerId?: number): void {
    this.loadingDrivers = true;
    const filters = ownerId
      ? [new Filter('ownerId', '=', ownerId.toString())]
      : [];
    const filterPayload = new ModelFilterTable(
      filters,
      new Pagination(9999, 0),
      new Sort('id', true),
    );

    this.driverService.getDriverFilter(filterPayload).subscribe({
      next: (resp: any) => {
        this.drivers = resp?.data?.content ?? [];
        this.loadingDrivers = false;
        this.mapDriverNames();
      },
      error: (err) => {
        console.error('Error loading drivers:', err);
        this.loadingDrivers = false;
      },
    });
  }

  mapDriverNames(): void {
    const mapFn = (v: ModelVehicle) => {
      const driver = this.drivers.find(
        (d) => String(d.id) === String(v.currentDriverId),
      );
      if (driver) v.currentDriverName = `${driver.name}`;
    };

    if (this.drivers.length > 0) {
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
    console.log('Selected vehicle:', vehicle);
    this.selectedVehicle = vehicle;
    this.selectedTrip = null; // Clear selected trip when changing vehicle

    if (this.isMaintenance) {
      // For maintenance, we don't need a real trip, but g-expenses-trip needs a tripId
      // and we use a dummy trip with id 0 which the service handles as "vehicle only"
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
            this.selectedTrip = this.recentTrips[0];
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
    return Array.from({ length: this.totalDots }, (_, i) => i);
  }

  // ── Add Expense Offcanvas ──────────────────────────────────────────

  openAddExpense(typeId?: number): void {
    const tripRequired = !this.isMaintenance;
    const canOpen =
      this.selectedVehicle && (!tripRequired || this.selectedTrip);

    if (canOpen) {
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
    this.editingExpense = expense;
    this.showAddExpense = true;
  }

  onExpenseAdded(event: any): void {
    if (event) {
      this.expenseService.createExpense(event).subscribe({
        next: () => {
          this.toastService.showSuccess(
            'Éxito',
            this.editingExpense
              ? 'Gasto actualizado exitosamente!'
              : 'Gasto registrado exitosamente!',
          );
          this.showAddExpense = false;
          // Refresh list
          this.expensesTripComponent?.loadExpenses();
          this.notificationsService.refreshNotifications();
          this.reportLocationIfDriver();
        },
        error: (err) => {
          console.error('Error saving expense:', err);
          this.toastService.showError('Error', 'No se pudo registrar el gasto');
        },
      });
    } else {
      this.showAddExpense = false;
    }
    this.editingExpense = null;
    this.preselectedExpenseTypeId = null;
  }

  private reportLocationIfDriver(): void {
    this.securityService.userData$.pipe(take(1)).subscribe((user) => {
      if (user) {
        const role = (user.userRoles?.[0]?.role?.name ?? '').toUpperCase();
        if (role.includes('CONDUCTOR')) {
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
}
