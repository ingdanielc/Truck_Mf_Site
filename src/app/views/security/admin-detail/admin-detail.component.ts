import { Component, OnInit, OnDestroy } from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { TripService } from 'src/app/services/trip.service';
import { ToastService } from 'src/app/services/toast.service';
import { ModelUser } from 'src/app/models/user-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-admin-detail',
  standalone: true,
  imports: [],
  templateUrl: './admin-detail.component.html',
  styleUrls: ['./admin-detail.component.scss'],
})
export class AdminDetailComponent implements OnInit, OnDestroy {
  userId: number | null = null;
  user: ModelUser | null = null;
  loading: boolean = true;

  stats = {
    owners: 0,
    vehicles: 0,
    trips: 0,
  };

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly tripService: TripService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.userId = Number(id);
        this.loadUser(this.userId);
        this.loadStats();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadUser(id: number): void {
    this.loading = true;
    const filter = new ModelFilterTable(
      [new Filter('id', '=', id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.securityService.getUserFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.user = response.data.content[0];
        } else {
          this.toastService.showError(
            'Error',
            'No se encontró el administrador',
          );
          this.goBack();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading admin:', err);
        this.toastService.showError(
          'Error',
          'Error al cargar el administrador',
        );
        this.loading = false;
        this.goBack();
      },
    });
  }

  loadStats(): void {
    const defaultPagination = new Pagination(1, 0);
    const defaultSort = new Sort('id', true);

    // Owners count
    this.ownerService
      .getOwnerFilter(new ModelFilterTable([], defaultPagination, defaultSort))
      .subscribe({
        next: (resp: any) =>
          (this.stats.owners = resp?.data?.totalElements ?? 0),
      });

    // Vehicles count
    this.vehicleService
      .getVehicleFilter(
        new ModelFilterTable([], defaultPagination, defaultSort),
      )
      .subscribe({
        next: (resp: any) =>
          (this.stats.vehicles = resp?.data?.totalElements ?? 0),
      });

    // Trips count
    this.tripService
      .getTripFilter(new ModelFilterTable([], defaultPagination, defaultSort))
      .subscribe({
        next: (resp: any) =>
          (this.stats.trips = resp?.data?.totalElements ?? 0),
      });
  }

  goBack(): void {
    this.router.navigate(['/site/home']);
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
