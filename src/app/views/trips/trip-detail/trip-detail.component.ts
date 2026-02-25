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
  loading: boolean = true;

  // UI State
  isOffcanvasOpen: boolean = false;

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;

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
    if (!this.trip?.origin) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.origin),
    );
    if (!city) return String(this.trip.origin);
    return city.state ? `${city.name} (${city.state})` : city.name;
  }

  get destinationName(): string {
    if (!this.trip?.destination) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.destination),
    );
    if (!city) return String(this.trip.destination);
    return city.state ? `${city.name} (${city.state})` : city.name;
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
    return (this.trip.freight || 0) - (this.trip.advancePayment || 0);
  }

  get profitMargin(): number {
    if (!this.trip || !this.trip.freight) return 0;
    return (this.netProfit / this.trip.freight) * 100;
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
