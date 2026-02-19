import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { GVehicleCardComponent } from '../../components/g-vehicle-card/g-vehicle-card.component';
import { VehicleService } from 'src/app/services/vehicle.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelOwner } from 'src/app/models/owner-model';

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GVehicleCardComponent,
  ],
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.scss'],
})
export class VehiclesComponent implements OnInit, OnDestroy {
  vehicles: ModelVehicle[] = [];
  allVehicles: ModelVehicle[] = [];
  totalVehicles: number = 0;
  availableVehicles: number = 0;
  occupiedVehicles: number = 0;
  searchTerm: string = '';
  page: number = 0;
  rows: number = 10;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingVehicle: ModelVehicle | null = null;
  vehicleForm: FormGroup;

  // Selection Lists
  brands: any[] = [];
  years: number[] = [];
  axleOptions: number[] = [1, 2, 3, 4, 5, 6];
  owners: ModelOwner[] = [];

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  private userSub?: Subscription;

  constructor(
    private readonly fb: FormBuilder,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
  ) {
    this.generateYears();
    this.vehicleForm = this.fb.group({
      brand: ['', [Validators.required]],
      model: ['', [Validators.required]],
      year: [
        new Date().getFullYear(),
        [Validators.required, Validators.min(1980)],
      ],
      color: ['', [Validators.required]],
      plate: [
        '',
        [Validators.required, Validators.pattern(/^[A-Z]{3}-\d{3}$/i)],
      ],
      motorNumber: ['', [Validators.required]],
      chassisNumber: ['', [Validators.required]],
      axleCount: [
        2,
        [Validators.required, Validators.min(1), Validators.max(6)],
      ],
      photo: [''],
      ownerId: [null, []],
    });
  }

  ngOnInit(): void {
    this.loadVehicles();
    this.loadBrands();
    this.subscribeToUserContext();
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();

          if (this.userRole === 'ADMINISTRADOR') {
            this.loadAllOwners();
            this.vehicleForm
              .get('ownerId')
              ?.setValidators([Validators.required]);
          } else if (this.userRole === 'PROPIETARIO') {
            if (user.id != null) {
              this.loggedInOwnerId = user.id;
              this.loadOwnerByUserId(user.id);
            }
          }
          this.vehicleForm.get('ownerId')?.updateValueAndValidity();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  loadAllOwners(): void {
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(100, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
        }
      },
    });
  }

  loadOwnerByUserId(userId: number): void {
    // Logic to find owner associated with this user if needed
    // For now assuming user.id relates to owner or we just need the ID for save
    this.loggedInOwnerId = userId;
  }

  generateYears(): void {
    const currentYear = new Date().getFullYear();
    for (let year = currentYear; year >= 1980; year--) {
      this.years.push(year);
    }
  }

  loadBrands(): void {
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.brands = response.data;
          this.mapBrandNames();
        }
      },
      error: (error: any) => {
        console.error('Error loading brands:', error);
      },
    });
  }

  toggleOffcanvas(vehicle?: ModelVehicle): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      if (vehicle) {
        this.editingVehicle = vehicle;
        this.vehicleForm.patchValue({
          brand: vehicle.vehicleBrandId,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plate: vehicle.plate,
          motorNumber: vehicle.engineNumber,
          chassisNumber: vehicle.chassisNumber,
          axleCount: vehicle.numberOfAxles,
        });
      } else {
        this.editingVehicle = null;
        this.vehicleForm.reset({
          year: new Date().getFullYear(),
          axleCount: 2,
          ownerId:
            this.userRole === 'ADMINISTRADOR' ? null : this.loggedInOwnerId,
        });
      }
    } else {
      this.editingVehicle = null;
      this.vehicleForm.reset();
    }
  }

  onSubmit(): void {
    if (this.vehicleForm.valid) {
      try {
        const formValue = this.vehicleForm.getRawValue();

        const vehicleToSave: ModelVehicle = {
          id: this.editingVehicle?.id || undefined,
          photo: formValue.photo || '',
          plate: formValue.plate,
          vehicleBrandId: formValue.brand,
          model: formValue.model,
          year: formValue.year,
          color: formValue.color,
          engineNumber: formValue.motorNumber,
          chassisNumber: formValue.chassisNumber,
          numberOfAxles: formValue.axleCount,
          status: this.editingVehicle?.status || 'Activo',
          ownerId:
            this.userRole === 'ADMINISTRADOR'
              ? formValue.ownerId
              : this.loggedInOwnerId || undefined,
        };

        this.vehicleService.createVehicle(vehicleToSave).subscribe({
          next: () => {
            this.toastService.showSuccess(
              'Gestión de Vehículos',
              this.editingVehicle
                ? 'Vehículo actualizado exitosamente!'
                : 'Vehículo creado exitosamente!',
            );
            this.loadVehicles();
            this.toggleOffcanvas();
          },
          error: (err) => {
            console.error('Error saving vehicle:', err);
            this.toastService.showError(
              'Error',
              'No se pudo procesar la solicitud. Por favor, intente de nuevo.',
            );
          },
        });
      } catch (error) {
        console.error('Error in onSubmit:', error);
      }
    } else {
      this.vehicleForm.markAllAsTouched();
    }
  }

  loadVehicles(): void {
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalVehicles = response.data.totalElements || 0;
          this.allVehicles = response.data.content;
          this.mapBrandNames();
          this.calculateStats();
          this.applyFilter();
        } else {
          this.allVehicles = [];
          this.vehicles = [];
          this.calculateStats();
        }
      },
      error: (err) => {
        console.error('Error loading vehicles:', err);
      },
    });
  }

  calculateStats(): void {
    this.totalVehicles = this.allVehicles.length;
    this.availableVehicles = this.allVehicles.filter(
      (v) => v.status?.toLowerCase() === 'activo',
    ).length;
    this.occupiedVehicles = this.totalVehicles - this.availableVehicles;
  }

  applyFilter(): void {
    let filtered = this.allVehicles;

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.vehicleBrandName?.toLowerCase().includes(term) ||
          v.model?.toLowerCase().includes(term) ||
          v.plate?.toLowerCase().includes(term),
      );
    }

    this.vehicles = filtered;
  }

  mapBrandNames(): void {
    if (this.brands.length > 0 && this.allVehicles.length > 0) {
      this.allVehicles.forEach((v) => {
        const brand = this.brands.find(
          (b) => b.id.toString() === v.vehicleBrandId.toString(),
        );
        if (brand) {
          v.vehicleBrandName = brand.name;
        }
      });
    }
  }
}
