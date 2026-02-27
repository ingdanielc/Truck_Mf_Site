import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import { CommonService } from 'src/app/services/common.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelDriver } from 'src/app/models/driver-model';
import { DriverService } from 'src/app/services/driver.service';
import { TripService } from 'src/app/services/trip.service';
import { GVehicleMiniCardComponent } from 'src/app/components/g-vehicle-mini-card/g-vehicle-mini-card.component';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-owner-detail',
  standalone: true,
  imports: [CommonModule, GVehicleMiniCardComponent],
  templateUrl: './owner-detail.component.html',
  styleUrls: ['./owner-detail.component.scss'],
})
export class OwnerDetailComponent implements OnInit, OnDestroy {
  ownerId: number | null = null;
  owner: ModelOwner | null = null;
  vehicles: ModelVehicle[] = [];
  drivers: ModelDriver[] = [];
  cities: any[] = [];
  brands: any[] = [];
  loading: boolean = true;
  loadingVehicles: boolean = true;
  loadingDrivers: boolean = true;
  loadingCities: boolean = true;
  loadingBrands: boolean = true;
  tripCount: number = 0;

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly tripService: TripService,
    private readonly toastService: ToastService,
    private readonly commonService: CommonService,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.ownerId = Number(id);
        this.loadCities();
        this.loadBrands();
        this.loadOwner(this.ownerId);
        this.loadVehicles(this.ownerId);
        this.loadDrivers(this.ownerId);
        this.loadTripCount(this.ownerId);
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadOwner(id: number): void {
    this.loading = true;
    const filter = new ModelFilterTable(
      [new Filter('id', '=', id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.owner = response.data.content[0];
          this.resolveCityName();
        } else {
          this.toastService.showError('Error', 'No se encontró el propietario');
          this.goBack();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading owner:', err);
        this.toastService.showError('Error', 'Error al cargar el propietario');
        this.loading = false;
        this.goBack();
      },
    });
  }

  loadVehicles(ownerId: number): void {
    this.loadingVehicles = true;
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(50, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        this.mapBrandNames();
        this.mapDriverNames();
        this.loadingVehicles = false;
      },
      error: (err) => {
        console.error('Error loading vehicles:', err);
        this.loadingVehicles = false;
      },
    });
  }

  loadDrivers(ownerId: number): void {
    this.loadingDrivers = true;
    const filter = new ModelFilterTable(
      [new Filter('ownerId', '=', ownerId.toString())],
      new Pagination(50, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        this.drivers = response?.data?.content ?? [];
        this.mapDriverNames();
        this.loadingDrivers = false;
      },
      error: (err) => {
        console.error('Error loading drivers:', err);
        this.loadingDrivers = false;
      },
    });
  }

  loadTripCount(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('vehicle.owners.owner.id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.tripCount = response?.data?.totalElements ?? 0;
      },
      error: (err) => {
        console.error('Error loading trip count:', err);
      },
    });
  }

  loadCities(): void {
    this.loadingCities = true;
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        this.cities = response?.data ?? [];
        this.loadingCities = false;
        this.resolveCityName();
      },
      error: (err) => {
        console.error('Error loading cities:', err);
        this.loadingCities = false;
      },
    });
  }

  resolveCityName(): void {
    if (this.owner?.cityId && this.cities.length > 0) {
      const city = this.cities.find((c) => c.id === this.owner?.cityId);
      if (city) {
        this.owner.cityName = city.state
          ? `${city.name}, ${city.state}`
          : city.name;
      }
    }
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

  mapDriverNames(): void {
    if (this.drivers.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        const driver = this.drivers.find(
          (d) => String(d.id) === String(v.currentDriverId),
        );
        if (driver) v.currentDriverName = driver.name;
      });
    }
  }

  get stats() {
    return {
      total: this.vehicles.length,
      trips: this.tripCount,
      maintenance: this.vehicles.filter((v) => v.status === 'Maintenance')
        .length,
    };
  }

  goBack(): void {
    this.router.navigate(['/site/owners']);
  }

  manageFleet(): void {
    this.router.navigate(['/site/vehicles'], {
      queryParams: { ownerId: this.ownerId },
    });
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
