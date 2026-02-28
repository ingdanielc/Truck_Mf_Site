import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';

import { Subscription } from 'rxjs';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import { CommonService } from 'src/app/services/common.service';
import { DriverService } from 'src/app/services/driver.service';
import { TokenService } from 'src/app/services/token.service';
import { GVehicleGoodComponent } from 'src/app/components/g-vehicle-good/g-vehicle-good.component';
import { GExpensesTripComponent } from 'src/app/components/g-expenses-trip/g-expenses-trip.component';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import { ModelDriver } from 'src/app/models/driver-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { GAddExpenseComponent } from 'src/app/components/g-add-expense/g-add-expense.component';

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    GVehicleGoodComponent,
    GExpensesTripComponent,
    GAddExpenseComponent,
  ],
  templateUrl: './expenses.component.html',
  styleUrls: ['./expenses.component.scss'],
})
export class ExpensesComponent implements OnInit, OnDestroy {
  vehicles: ModelVehicle[] = [];
  selectedVehicle: ModelVehicle | null = null;
  loadingVehicles = true;

  brands: any[] = [];
  loadingBrands = false;

  drivers: ModelDriver[] = [];
  loadingDrivers = false;

  carouselIndex = 0;
  visibleCount = 1;

  showAddExpense = false;

  private userSub?: Subscription;

  constructor(
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly driverService: DriverService,
    private readonly tokenService: TokenService,
    private readonly expenseService: ExpenseService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.updateVisibleCount();
    this.loadBrands();
    this.userSub = this.securityService.userData$.subscribe((user) => {
      if (user) {
        this.loadVehiclesForUser(user);
      } else {
        const payload = this.tokenService.getPayload();
        const userId = payload?.nameid ?? payload?.id ?? payload?.sub;
        if (userId) {
          this.securityService.fetchUserData(userId);
        }
      }
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

  // ── Data loading ─────────────────────────────────────────────────

  private loadVehiclesForUser(user: any): void {
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
            this.loadVehiclesByOwner(owner.id);
          } else {
            this.loadingVehicles = false;
          }
        },
        error: () => (this.loadingVehicles = false),
      });
    } else {
      const filter = new ModelFilterTable(
        [],
        new Pagination(9999, 0),
        new Sort('id', true),
      );
      this.vehicleService.getVehicleFilter(filter).subscribe({
        next: (resp: any) => {
          this.vehicles = resp?.data?.content ?? [];
          this.selectedVehicle = this.vehicles[0] ?? null;
          this.loadingVehicles = false;
          this.mapBrandNames();
          this.loadDrivers(); // Admin: load all drivers
        },
        error: () => (this.loadingVehicles = false),
      });
    }
  }

  private loadVehiclesByOwner(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(9999, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleFilter(filter).subscribe({
      next: (resp: any) => {
        this.vehicles = resp?.data?.content ?? [];
        this.selectedVehicle = this.vehicles[0] ?? null;
        this.carouselIndex = 0;
        this.loadingVehicles = false;
        this.mapBrandNames();
        this.loadDrivers(ownerId); // Owner: load only their drivers
      },
      error: () => (this.loadingVehicles = false),
    });
  }

  loadBrands(): void {
    this.loadingBrands = true;
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        this.brands = response?.data ?? [];
        this.loadingBrands = false;
        this.mapBrandNames();
      },
      error: (err) => {
        console.error('Error loading brands:', err);
        this.loadingBrands = false;
      },
    });
  }

  mapBrandNames(): void {
    if (this.brands.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        if (!v.vehicleBrandName) {
          const brand = this.brands.find(
            (b) => String(b.id) === String(v.vehicleBrandId),
          );
          if (brand) v.vehicleBrandName = brand.name;
        }
      });
    }
  }

  loadDrivers(ownerId?: number): void {
    this.loadingDrivers = true;
    const filters = ownerId
      ? [new Filter('owner.id', '=', ownerId.toString())]
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
    if (this.drivers.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        const driver = this.drivers.find(
          (d) => String(d.id) === String(v.currentDriverId),
        );
        if (driver) v.currentDriverName = `${driver.name}`;
      });
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

  openAddExpense(): void {
    this.showAddExpense = true;
  }

  onExpenseAdded(event: any): void {
    if (event) {
      this.expenseService.createExpense(event).subscribe({
        next: () => {
          this.toastService.showSuccess(
            'Éxito',
            'Gasto registrado correctamente',
          );
          this.showAddExpense = false;
          // Refresh list if needed (e.g., if GExpensesTripComponent handles it, might need a trigger)
        },
        error: (err) => {
          console.error('Error saving expense:', err);
          this.toastService.showError('Error', 'No se pudo registrar el gasto');
        },
      });
    } else {
      this.showAddExpense = false;
    }
  }
}
