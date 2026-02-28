import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TripService } from 'src/app/services/trip.service';
import { CommonService } from 'src/app/services/common.service';
import { ModelTrip } from 'src/app/models/trip-model';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { GTripFormComponent } from '../../../components/g-trip-form/g-trip-form.component';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [CommonModule, GTripFormComponent],
  templateUrl: './trip-detail.component.html',
  styleUrls: ['./trip-detail.component.scss'],
})
export class TripDetailComponent implements OnInit, OnDestroy {
  tripId: number | null = null;
  trip: ModelTrip | null = null;
  cities: any[] = [];
  vehicleBrands: any[] = [];
  loading: boolean = true;

  // State tracking for logistics
  originalStatus: string = '';
  originalPaidBalance: boolean = false;

  // UI State
  isOffcanvasOpen: boolean = false;

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;

  // Expenses
  totalExpenses: number = 0;

  private routeSub?: Subscription;
  private userSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.tripId = Number(id);
        this.loadCities();
        this.loadVehicleBrands();
        this.loadTrip(this.tripId);
      }
    });

    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
          }
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.userSub?.unsubscribe();
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

  loadVehicleBrands(): void {
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.vehicleBrands = response.data;
        }
      },
      error: (err: any) => console.error('Error loading vehicle brands:', err),
    });
  }

  loadTrip(id: number): void {
    this.loading = true;
    const filter = new ModelFilterTable(
      [new Filter('id', '=', id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content && response.data.content.length > 0) {
          this.trip = response.data.content[0];
          if (this.trip) {
            this.originalStatus = this.trip.status;
            this.originalPaidBalance = this.trip.paidBalance ?? false;
          }
        } else {
          this.toastService.showError('Error', 'No se encontró el viaje');
          this.goBack();
        }
        this.loading = false;
      },
      error: (error: any) => {
        console.error('Error loading trip:', error);
        this.toastService.showError(
          'Error',
          'Error al cargar el detalle del viaje',
        );
        this.loading = false;
        this.goBack();
      },
    });
  }

  get originName(): string {
    if (!this.trip?.originId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.originId),
    );
    if (!city) return String(this.trip.originId);
    return city.state ? `${city.name} (${city.state})` : city.name;
  }

  get destinationName(): string {
    if (!this.trip?.destinationId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.destinationId),
    );
    if (!city) return String(this.trip.destinationId);
    return city.state ? `${city.name} (${city.state})` : city.name;
  }

  get vehicleBrandName(): string {
    const brandId = this.trip?.vehicle?.vehicleBrandId;
    if (!brandId) return '';

    const brand = this.vehicleBrands.find(
      (b) => Number(b.id) === Number(brandId),
    );
    return brand ? brand.name : '';
  }

  get hasLogisticsChanges(): boolean {
    if (!this.trip) return false;
    return (
      this.trip.status !== this.originalStatus ||
      this.trip.paidBalance !== this.originalPaidBalance
    );
  }

  get totalIncome(): number {
    if (!this.trip) return 0;
    if (this.trip.paidBalance) {
      return this.trip.freight || 0;
    }
    return (this.trip.freight || 0) - (this.trip.balance || 0);
  }

  updateLogistics(): void {
    if (!this.trip) return;

    if (['Completado', 'Cancelado', 'Pendiente'].includes(this.trip.status)) {
      this.trip.endDate = new Date().toISOString().split('T')[0];
      if (this.trip.startDate && this.trip.endDate) {
        const start = new Date(this.trip.startDate);
        const end = new Date(this.trip.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        this.trip.numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    }

    this.loading = true;
    this.tripService.createTrip(this.trip).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Éxito',
          'Viaje actualizado correctamente',
        );
        if (this.tripId) {
          this.loadTrip(this.tripId);
        }
      },
      error: (err: any) => {
        console.error('Error updating trip:', err);
        this.toastService.showError('Error', 'No se pudo actualizar el viaje');
        this.loading = false;
      },
    });
  }

  get progressPercentage(): number {
    if (!this.trip) return 0;
    const total = this.trip.freight || 0;
    const paid = this.trip.advancePayment || 0;
    if (total === 0) return 0;
    return Math.round((paid / total) * 100);
  }

  get netProfit(): number {
    if (!this.trip) return 0;
    return this.totalIncome - this.totalExpenses;
  }

  get profitMargin(): number {
    if (!this.trip || !this.totalIncome) return 0;
    return (this.netProfit / this.totalIncome) * 100;
  }

  goBack(): void {
    this.router.navigate(['/site/trips']);
  }

  toggleOffcanvas(): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
  }

  editTrip(): void {
    this.toggleOffcanvas();
  }

  onTripSaved(): void {
    this.toggleOffcanvas();
    if (this.tripId) {
      this.loadTrip(this.tripId);
    }
  }
}
