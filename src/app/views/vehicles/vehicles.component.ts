import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  ValidationErrors,
  ValidatorFn,
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
import { GVehicleOwnerCardComponent } from '../../components/g-vehicle-owner-card/g-vehicle-owner-card.component';
import { VehicleService } from 'src/app/services/vehicle.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { DriverService } from 'src/app/services/driver.service';
import { ModelDriver } from 'src/app/models/driver-model';

export interface VehicleOwnerGroup {
  owner: ModelOwner;
  vehicles: ModelVehicle[];
}

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GVehicleCardComponent,
    GVehicleOwnerCardComponent,
  ],
  templateUrl: './vehicles.component.html',
  styleUrls: ['./vehicles.component.scss'],
})
export class VehiclesComponent implements OnInit, OnDestroy {
  allVehicles: ModelVehicle[] = [];
  totalVehicles: number = 0;
  availableVehicles: number = 0;
  occupiedVehicles: number = 0;
  searchTerm: string = '';
  page: number = 0;
  rows: number = 100;

  // Grouped display
  groupedVehicles: VehicleOwnerGroup[] = [];

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingVehicle: ModelVehicle | null = null;
  vehicleForm: FormGroup;

  // Selection Lists
  brands: any[] = [];
  years: number[] = [];
  axleOptions: number[] = [1, 2, 3, 4, 5, 6];
  owners: ModelOwner[] = [];
  drivers: ModelDriver[] = [];
  loadingDrivers: boolean = false;
  private readonly ownerChangeSub?: Subscription;

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  loggedInOwner: ModelOwner | null = null;
  private userSub?: Subscription;

  /** ownerId filter when navigated from owner card (query param) */
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly route: ActivatedRoute,
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
        [
          Validators.required,
          Validators.pattern(/^[A-Z]{3}-\d{3}$/i),
          this.duplicatePlateValidator(),
        ],
      ],
      motorNumber: ['', [Validators.required]],
      chassisNumber: ['', [Validators.required]],
      axleCount: [
        2,
        [Validators.required, Validators.min(1), Validators.max(6)],
      ],
      photo: [''],
      ownerId: [null, [Validators.required]],
      driverId: [null, [Validators.required]],
    });

    // React to owner selection change → reload drivers
    this.ownerChangeSub = this.vehicleForm
      .get('ownerId')!
      .valueChanges.subscribe((ownerId) => {
        this.vehicleForm.get('driverId')?.setValue(null, { emitEvent: false });
        this.drivers = [];
        if (ownerId != null) {
          this.loadDriversByOwner(ownerId);
        }
      });
  }

  ngOnInit(): void {
    // loadVehicles is now triggered after user context is resolved
    this.loadBrands();

    // Read ownerId synchronously from snapshot to ensure it's available before loadVehicles runs
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    this.subscribeToUserContext();
  }

  loadFilteredOwner(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredOwner = response.data.content[0];
          this.applyFilter();
        }
      },
    });
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();

          if (this.userRole === 'ADMINISTRADOR') {
            this.vehicleForm
              .get('ownerId')
              ?.setValidators([Validators.required]);
            this.loadOwners();
            this.loadVehicles();
          } else if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners(); // This will trigger loadVehicles upon success
          }
          this.vehicleForm.get('ownerId')?.updateValueAndValidity();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.ownerChangeSub?.unsubscribe();
  }

  loadDriversByOwner(ownerId: number): void {
    this.loadingDrivers = true;
    const filter = new ModelFilterTable(
      [new Filter('ownerId', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('name', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        this.drivers = response?.data?.content ?? [];
        this.loadingDrivers = false;
      },
      error: () => {
        this.drivers = [];
        this.loadingDrivers = false;
      },
    });
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('user.Id', '=', this.loggedInOwnerId.toString()));
    }

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(100, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          const owners = response.data.content;
          this.owners = owners;
          if (this.userRole === 'PROPIETARIO' && owners.length > 0) {
            this.loggedInOwner = owners[0];
            this.loggedInOwnerId =
              this.loggedInOwner?.id ?? this.loggedInOwnerId;
            // Now that we have the TRUE owner.id, load the vehicles
            this.loadVehicles();
          }
          this.applyFilter();
        }
      },
    });
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
        const ownerRel = vehicle.owners?.[0];
        const ownerId = ownerRel?.ownerId ?? null;

        // Patch fields
        this.vehicleForm.patchValue({
          brand: vehicle.vehicleBrandId,
          model: vehicle.model,
          year: vehicle.year,
          color: vehicle.color,
          plate: vehicle.plate,
          motorNumber: vehicle.engineNumber,
          chassisNumber: vehicle.chassisNumber,
          axleCount: vehicle.numberOfAxles,
          ownerId: ownerId,
          driverId: vehicle.currentDriverId,
        });

        // Disable owner field if PROPIETARIO
        if (this.userRole === 'PROPIETARIO') {
          this.vehicleForm.get('ownerId')?.disable();
        } else {
          this.vehicleForm.get('ownerId')?.enable();
        }
      } else {
        this.editingVehicle = null;
        // CREATE mode
        this.vehicleForm.reset({
          year: new Date().getFullYear(),
          axleCount: 2,
          ownerId:
            this.userRole === 'ADMINISTRADOR' ? null : this.loggedInOwnerId,
        });

        // Handle disable state for create too
        if (this.userRole === 'PROPIETARIO') {
          this.vehicleForm.get('ownerId')?.disable();
        } else {
          this.vehicleForm.get('ownerId')?.enable();
        }
      }
    } else {
      this.editingVehicle = null;
      this.vehicleForm.reset();
      this.vehicleForm.markAsUntouched();
      this.vehicleForm.get('ownerId')?.enable();
    }
  }

  /** Abre el offcanvas de creación precargando el propietario del grupo */
  openAddVehicleForOwner(owner: ModelOwner): void {
    this.editingVehicle = null;
    this.isOffcanvasOpen = true;
    // Primero reseteamos sin emitir eventos para evitar doble disparo
    this.vehicleForm.reset(
      { year: new Date().getFullYear(), axleCount: 2 },
      { emitEvent: false },
    );

    // Manejar estado disabled según rol
    if (this.userRole === 'PROPIETARIO') {
      this.vehicleForm.get('ownerId')?.disable();
    } else {
      this.vehicleForm.get('ownerId')?.enable();
    }

    // Seteamos el ownerId — esto dispara ownerChangeSub que carga los conductores
    this.vehicleForm.get('ownerId')?.setValue(owner.id ?? null);
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
          currentDriverId: formValue.driverId ?? null,
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
    // Case 1: PROPIETARIO → filter by their own owner id using owner filter endpoint
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      const filtros = [
        new Filter('owner.id', '=', this.loggedInOwnerId.toString()),
      ];
      const filter = new ModelFilterTable(
        filtros,
        new Pagination(this.rows, this.page),
        new Sort('id', true),
      );
      this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            this.totalVehicles = response.data.totalElements || 0;
            this.allVehicles = response.data.content;
            this.mapBrandNames();
            this.mapDriverNames();
            this.calculateStats();
            this.applyFilter();
            this.calculateStats();
            this.applyFilter();
          }
        },
        error: (err) => {
          console.error('Error loading vehicles via owner filter:', err);
          this.allVehicles = [];
          this.calculateStats();
          this.applyFilter();
        },
      });

      // Case 2: ADMINISTRADOR navigated from owner card → filter by ownerIdFilter
    } else if (
      this.userRole === 'ADMINISTRADOR' &&
      this.ownerIdFilter != null
    ) {
      const filtros = [
        new Filter('owner.id', '=', this.ownerIdFilter.toString()),
      ];
      const filter = new ModelFilterTable(
        filtros,
        new Pagination(this.rows, this.page),
        new Sort('id', true),
      );
      this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            this.totalVehicles = response.data.totalElements || 0;
            this.allVehicles = response.data.content;
            this.mapBrandNames();
            this.mapDriverNames();
            this.calculateStats();
            this.applyFilter();
          } else {
            this.allVehicles = [];
            this.totalVehicles = 0;
            this.calculateStats();
            this.applyFilter();
          }
        },
        error: (err) => {
          console.error('Error loading vehicles for owner:', err);
          this.allVehicles = [];
          this.calculateStats();
          this.applyFilter();
        },
      });

      // Case 3: ADMINISTRADOR without any owner filter → load all
    } else {
      const filter = new ModelFilterTable(
        [],
        new Pagination(this.rows, this.page),
        new Sort('id', true),
      );
      this.vehicleService.getVehicleFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            this.totalVehicles = response.data.totalElements || 0;
            this.allVehicles = response.data.content;
            this.mapBrandNames();
            this.mapDriverNames();
            this.calculateStats();
            this.applyFilter();
          } else {
            this.allVehicles = [];
            this.groupedVehicles = [];
            this.calculateStats();
          }
        },
        error: (err) => {
          console.error('Error loading vehicles:', err);
        },
      });
    }
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

    // For PROPIETARIO: only show vehicles where they appear in the owners array
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtered = filtered.filter((v) =>
        v.owners?.some((rel) => rel.ownerId === this.loggedInOwnerId),
      );
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (v) =>
          v.vehicleBrandName?.toLowerCase().includes(term) ||
          v.model?.toLowerCase().includes(term) ||
          v.plate?.toLowerCase().includes(term),
      );
    }

    this.buildGroups(filtered);
  }

  buildGroups(vehicles: ModelVehicle[]): void {
    if (this.userRole === 'PROPIETARIO') {
      // Single card for the logged-in owner
      const owner: ModelOwner =
        this.loggedInOwner ??
        new ModelOwner(
          this.loggedInOwnerId ?? undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'Mi Propietario',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'Activo',
        );
      this.groupedVehicles = [{ owner, vehicles }];
    } else {
      // Group vehicles using the nested owners array from the API response
      const groups = new Map<string, VehicleOwnerGroup>();
      const noOwnerKey = '__sin_propietario__';

      // Always include the filtered owner if present and no search term is active
      if (this.filteredOwner && !this.searchTerm) {
        const key = String(this.filteredOwner.id);
        groups.set(key, { owner: this.filteredOwner, vehicles: [] });
      }

      vehicles.forEach((v) => {
        const firstOwnerRel = v.owners?.[0];

        if (!firstOwnerRel || !firstOwnerRel.owner) {
          // Vehicle without owner → "Sin propietario" group
          if (!groups.has(noOwnerKey)) {
            groups.set(noOwnerKey, {
              owner: new ModelOwner(
                undefined,
                undefined,
                undefined,
                undefined,
                undefined,
                'Sin propietario',
              ),
              vehicles: [],
            });
          }
          groups.get(noOwnerKey)!.vehicles.push(v);
        } else {
          const ownerData = firstOwnerRel.owner;
          const key = String(ownerData.id ?? firstOwnerRel.ownerId);
          if (!groups.has(key)) {
            groups.set(key, { owner: ownerData, vehicles: [] });
          }
          groups.get(key)!.vehicles.push(v);
        }
      });

      // Convert map to array and sort: named owners alphabetically, "Sin propietario" last
      const result = Array.from(groups.values()).sort((a, b) => {
        const aName = a.owner.name ?? '';
        const bName = b.owner.name ?? '';
        if (aName === 'Sin propietario') return 1;
        if (bName === 'Sin propietario') return -1;
        return aName.localeCompare(bName);
      });

      this.groupedVehicles = result;
    }
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

  mapDriverNames(): void {
    if (this.allVehicles.length === 0) return;

    // 1. Try to match with drivers already loaded (usually for the current owner)
    if (this.drivers.length > 0) {
      this.allVehicles.forEach((v) => {
        if (v.currentDriverId != null && !v.currentDriverName) {
          const match = this.drivers.find((d) => d.id === v.currentDriverId);
          if (match) v.currentDriverName = match.name;
        }
      });
    }

    // 2. Identify missing driver IDs
    const missingIds = [
      ...new Set(
        this.allVehicles
          .filter((v) => v.currentDriverId != null && !v.currentDriverName)
          .map((v) => v.currentDriverId as number),
      ),
    ];

    // 3. Fetch each missing driver's detail individually
    missingIds.forEach((id) => this.fetchDriverDetail(id));
  }

  fetchDriverDetail(driverId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', driverId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        const driver = response?.data?.content?.[0];
        if (driver) {
          this.allVehicles.forEach((v) => {
            if (v.currentDriverId === driverId) {
              v.currentDriverName = driver.name;
            }
          });
        }
      },
      error: (err: any) =>
        console.error(`Error fetching driver ${driverId} details:`, err),
    });
  }

  onViewProfile(owner: ModelOwner): void {
    // Placeholder: navigate to owner profile or open detail panel
    console.log('View profile for owner:', owner);
  }

  // Custom Validators
  private duplicatePlateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value || !this.allVehicles) return null;
      const isDuplicate = this.allVehicles.some(
        (v) =>
          v.plate?.toLowerCase() === control.value.toLowerCase() &&
          v.id !== this.editingVehicle?.id,
      );
      return isDuplicate ? { duplicate: true } : null;
    };
  }
}
