import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-owner-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './owner-detail.component.html',
  styleUrls: ['./owner-detail.component.scss'],
})
export class OwnerDetailComponent implements OnInit, OnDestroy {
  ownerId: number | null = null;
  owner: ModelOwner | null = null;
  vehicles: ModelVehicle[] = [];
  loading: boolean = true;
  loadingVehicles: boolean = true;

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.ownerId = Number(id);
        this.loadOwner(this.ownerId);
        this.loadVehicles(this.ownerId);
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
        this.loadingVehicles = false;
      },
      error: (err) => {
        console.error('Error loading vehicles:', err);
        this.loadingVehicles = false;
      },
    });
  }

  get stats() {
    return {
      total: this.vehicles.length,
      operational: this.vehicles.filter(
        (v) => v.status === 'Active' || v.status === 'In Route',
      ).length,
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
}
