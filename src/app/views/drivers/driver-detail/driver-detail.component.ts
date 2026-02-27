import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DriverService } from 'src/app/services/driver.service';
import { TripService } from 'src/app/services/trip.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { ModelDriver } from 'src/app/models/driver-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { GVehicleMiniCardComponent } from 'src/app/components/g-vehicle-mini-card/g-vehicle-mini-card.component';
import {
    Filter,
    ModelFilterTable,
    Pagination,
    Sort,
} from 'src/app/models/model-filter-table';

@Component({
    selector: 'app-driver-detail',
    standalone: true,
    imports: [CommonModule, GVehicleMiniCardComponent],
    templateUrl: './driver-detail.component.html',
    styleUrls: ['./driver-detail.component.scss'],
})
export class DriverDetailComponent implements OnInit, OnDestroy {
    driverId: number | null = null;
    driver: ModelDriver | null = null;
    vehicles: ModelVehicle[] = [];
    cities: any[] = [];
    brands: any[] = [];
    loading: boolean = true;
    loadingVehicles: boolean = true;
    loadingCities: boolean = true;
    loadingBrands: boolean = true;
    tripCount: number = 0;
    now: Date = new Date();

    private routeSub?: Subscription;

    constructor(
        private readonly route: ActivatedRoute,
        private readonly router: Router,
        private readonly driverService: DriverService,
        private readonly tripService: TripService,
        private readonly vehicleService: VehicleService,
        private readonly commonService: CommonService,
        private readonly toastService: ToastService,
    ) { }

    ngOnInit(): void {
        this.routeSub = this.route.paramMap.subscribe((params) => {
            const id = params.get('id');
            if (id) {
                this.driverId = Number(id);
                this.loadCities();
                this.loadBrands();
                this.loadDriver(this.driverId);
                this.loadVehicles(this.driverId);
                this.loadTripCount(this.driverId);
            }
        });
    }

    ngOnDestroy(): void {
        this.routeSub?.unsubscribe();
    }

    loadDriver(id: number): void {
        this.loading = true;
        const filter = new ModelFilterTable(
            [new Filter('id', '=', id.toString())],
            new Pagination(1, 0),
            new Sort('id', true),
        );
        this.driverService.getDriverFilter(filter).subscribe({
            next: (response: any) => {
                if (response?.data?.content?.length > 0) {
                    this.driver = response.data.content[0];
                    this.resolveCityName();
                } else {
                    this.toastService.showError('Error', 'No se encontró el conductor');
                    this.goBack();
                }
                this.loading = false;
            },
            error: (err) => {
                console.error('Error loading driver:', err);
                this.toastService.showError('Error', 'Error al cargar el conductor');
                this.loading = false;
                this.goBack();
            },
        });
    }

    loadVehicles(driverId: number): void {
        this.loadingVehicles = true;
        const filter = new ModelFilterTable(
            [new Filter('currentDriverId', '=', driverId.toString())],
            new Pagination(50, 0),
            new Sort('id', true),
        );
        this.vehicleService.getVehicleFilter(filter).subscribe({
            next: (response: any) => {
                this.vehicles = response?.data?.content ?? [];
                this.mapBrandNames();
                this.loadingVehicles = false;
            },
            error: (err) => {
                console.error('Error loading vehicles:', err);
                this.loadingVehicles = false;
            },
        });
    }

    loadTripCount(driverId: number): void {
        const filter = new ModelFilterTable(
            [new Filter('driver.id', '=', driverId.toString())],
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
        if (this.driver?.cityId && this.cities.length > 0) {
            const city = this.cities.find((c) => c.id === this.driver?.cityId);
            if (city) {
                this.driver.cityName = city.state
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

    get stats() {
        return {
            trips: this.tripCount,
            vehicles: this.vehicles.length,
        };
    }

    goBack(): void {
        this.router.navigate(['/site/drivers']);
    }

    formatDocNumber(value: any): string {
        const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
        return isNaN(n) || value === ''
            ? String(value ?? '')
            : new Intl.NumberFormat('es-CO').format(n);
    }
}
