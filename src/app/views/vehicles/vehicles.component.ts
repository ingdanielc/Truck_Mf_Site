import { Component, OnDestroy, OnInit } from '@angular/core';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';

import { ActivatedRoute, Router } from '@angular/router';
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
import { Subscription, firstValueFrom, forkJoin } from 'rxjs';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelTrip } from 'src/app/models/trip-model';
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
import { DocumentNumberPipe } from 'src/app/pipes/document-number.pipe';
import { TripService } from 'src/app/services/trip.service';
import { CustomValidators } from 'src/app/utils/custom-validators';

export interface VehicleOwnerGroup {
  owner: ModelOwner;
  vehicles: ModelVehicle[];
}

@Component({
  selector: 'app-vehicles',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    GVehicleCardComponent,
    GVehicleOwnerCardComponent,
    DocumentNumberPipe,
    GCameraComponent,
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
  activeFilter: string = 'Todos';
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  // Global cache for Admin role
  globalStats = {
    total: 0,
    available: 0,
    occupied: 0,
  };

  expandedOwnerId: number | null = null;
  ownerVehicles: ModelVehicle[] = [];
  totalOwners: number = 0;
  isLoadingExpandedVehicles: boolean = false;

  // Grouped display
  groupedVehicles: VehicleOwnerGroup[] = [];

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingVehicle: ModelVehicle | null = null;
  vehicleForm: FormGroup;
  isSearchActive: boolean = false;

  get isSearchingVehicles(): boolean {
    return (
      this.userRole === 'ADMINISTRADOR' &&
      !!this.searchTerm &&
      !this.expandedOwnerId &&
      !this.ownerIdFilter
    );
  }
  isPatching: boolean = false;
  showingVehicleLimitWarning: boolean = false;
  showCamera = false;
  photoFile: File | Blob | null = null;
  photoPreview: string = '';
  private initialFormValue: string = '';
  isSaving: boolean = false;

  // Sell confirmation
  showSellConfirm: boolean = false;
  isSelling: boolean = false;
  vehicleToSell: ModelVehicle | null = null;

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
  loggedInDriverId: number | null = null;
  private userSub?: Subscription;

  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;

  /** driverId filter when navigated from driver profile (query param) */
  driverIdFilter: number | null = null;
  filteredDriver: ModelDriver | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly tripService: TripService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
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
      motorNumber: [''],
      chassisNumber: [''],
      axleCount: [2, [Validators.min(1), Validators.max(6)]],
      photo: [''],
      ownerId: [null, [Validators.required]],
      driverId: [null, [Validators.required]],
    });

    // React to owner selection change → reload drivers
    this.ownerChangeSub = this.vehicleForm
      .get('ownerId')!
      .valueChanges.subscribe((ownerId) => {
        if (!this.isPatching) {
          this.vehicleForm
            .get('driverId')
            ?.setValue(null, { emitEvent: false });
        }
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
      this.isSearchActive = false;
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    const rawDriverId = this.route.snapshot.queryParamMap.get('driverId');
    if (rawDriverId != null) {
      this.driverIdFilter = Number(rawDriverId);
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
            this.rows = 9;
          } else {
            this.rows = 100;
          }

          if (this.userRole === 'ADMINISTRADOR') {
            this.vehicleForm
              .get('ownerId')
              ?.setValidators([Validators.required]);
            this.loadOwners();
          } else if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners(); // This will trigger loadVehicles upon success
          } else if (this.userRole === 'CONDUCTOR') {
            this.loadDriverIdByUser(user.id);
          }
          this.vehicleForm.get('ownerId')?.updateValueAndValidity();
        }
      },
    });
  }

  loadDriverIdByUser(userId: number | null | undefined): void {
    if (userId == null) return;
    const filter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          const driver = response.data.content[0];
          this.loggedInDriverId = driver.id;
          if (driver.ownerId) {
            this.loggedInOwnerId = driver.ownerId;
            this.loadOwnerById(driver.ownerId);
          }
          this.loadVehicles();
        }
      },
    });
  }

  loadOwnerById(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.loggedInOwner = response.data.content[0];
          this.applyFilter();
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

    const driverFilter = new ModelFilterTable(
      [new Filter('ownerId', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('name', true),
    );

    const vehicleFilter = new ModelFilterTable(
      [new Filter('ownerId', '=', ownerId.toString())],
      new Pagination(1000, 0),
      new Sort('id', true),
    );

    forkJoin({
      drivers: this.driverService.getDriverFilter(driverFilter),
      vehicles: this.vehicleService.getVehicleOwnerFilter(vehicleFilter),
    }).subscribe({
      next: (resp: any) => {
        const allDrivers: ModelDriver[] = resp.drivers?.data?.content ?? [];
        const allVehicles: ModelVehicle[] = resp.vehicles?.data?.content ?? [];

        // Collect IDs of drivers already assigned to a vehicle
        const assignedDriverIds: any[] = allVehicles
          .map((v) => v.currentDriverId)
          .filter((id) => id != null);

        // Filter: Keep unassigned drivers OR the driver of the vehicle currently being edited
        this.drivers = allDrivers.filter((d: any) => {
          if (!d.id) return false;
          const isAssigned = assignedDriverIds.includes(d.id);
          const isCurrentOfEditing =
            this.editingVehicle &&
            d.id === (this.editingVehicle.currentDriverId as any);
          return !isAssigned || isCurrentOfEditing;
        });

        this.loadingDrivers = false;

        const originalOwnerRel = this.editingVehicle?.owners?.[0];
        const originalOwnerId = originalOwnerRel?.ownerId ?? null;

        if (
          this.editingVehicle?.currentDriverId &&
          originalOwnerId === ownerId
        ) {
          const hasDriver = this.drivers.some(
            (d) => d.id === this.editingVehicle!.currentDriverId,
          );
          if (hasDriver) {
            this.vehicleForm
              .get('driverId')
              ?.setValue(this.editingVehicle.currentDriverId, {
                emitEvent: false,
              });
          }
        }
        if (this.editingVehicle) {
          setTimeout(() => this.captureInitialState(), 0);
        }
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

    if (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter) {
      filtros.push(new Filter('name', 'like', this.searchTerm)); // Though irrelevant if we bypass name searching
    }

    if (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter) {
      filtros.push(new Filter('id', '=', this.ownerIdFilter.toString()));
    }

    const paginationRows = this.userRole === 'ADMINISTRADOR' ? this.rows : 100;
    const paginationPage = this.userRole === 'ADMINISTRADOR' ? this.page : 0;

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(paginationRows, paginationPage),
      new Sort('name', true),
    );

    if (this.userRole === 'ADMINISTRADOR') this.loading = true;

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
          } else if (this.userRole === 'ADMINISTRADOR') {
            this.totalOwners = response.data.totalElements ?? 0;

            // Handle auto-expansion if ownerIdFilter is present
            if (this.ownerIdFilter && this.owners.length > 0) {
              const matchedOwner = this.owners.find(
                (o) => o.id === this.ownerIdFilter,
              );
              if (matchedOwner) {
                this.expandedOwnerId = matchedOwner.id ?? null;
                this.isLoadingExpandedVehicles = true;
                this.loadVehiclesForAdmin(matchedOwner.id!);
              }
            }

            // Initial global stats calculation for admin
            if (!this.expandedOwnerId && this.page === 0 && !this.searchTerm) {
              this.updateStatusCounts();
            }
            this.loading = false;
          }
          if (
            this.allVehicles.length > 0 &&
            this.userRole !== 'ADMINISTRADOR'
          ) {
            this.applyFilter();
          }
        } else if (this.userRole === 'ADMINISTRADOR') {
          this.owners = [];
          this.totalOwners = 0;
          this.loading = false;
        }
      },
      error: () => {
        if (this.userRole === 'ADMINISTRADOR') {
          this.owners = [];
          this.totalOwners = 0;
          this.loading = false;
        }
      },
    });
  }

  private updateStatusCounts(): void {
    let filtros: Filter[] = [];
    if (this.ownerIdFilter) {
      filtros.push(new Filter('ownerId', '=', this.ownerIdFilter.toString()));
    }

    this.vehicleService
      .getVehicleOwnerFilter(
        new ModelFilterTable(
          filtros,
          new Pagination(20000, 0),
          new Sort('id', true),
        ),
      )
      .subscribe({
        next: (response: any) => {
          const allVehicles = (response?.data?.content ?? []).filter(
            (v: any) => v.status !== 'Vendido',
          );
          const total = allVehicles.length;
          const vehicleIds = new Set(allVehicles.map((v: any) => v.id));

          // Get all 'En curso' trips to determine occupied vehicles
          const tripFilter = new ModelFilterTable(
            [new Filter('status', '=', 'En Curso')],
            new Pagination(20000, 0),
            new Sort('id', true),
          );

          this.tripService.getTripFilter(tripFilter).subscribe({
            next: (tripResp: any) => {
              const activeTrips = tripResp?.data?.content ?? [];
              // A vehicle is occupied if it has an 'En Curso' trip
              const occupiedIds = new Set(
                activeTrips
                  .map((t: any) => t.vehicleId)
                  .filter((id: any) => vehicleIds.has(id)),
              );

              const occupied = occupiedIds.size;
              const available = total - occupied;

              this.totalVehicles = total;
              this.availableVehicles = available;
              this.occupiedVehicles = occupied;

              if (this.userRole === 'ADMINISTRADOR') {
                this.globalStats = {
                  total: this.totalVehicles,
                  available: this.availableVehicles,
                  occupied: this.occupiedVehicles,
                };
              }
            },
          });
        },
      });
  }

  toggleOwnerExpansion(owner: ModelOwner): void {
    if (this.userRole !== 'ADMINISTRADOR') return;

    if (this.expandedOwnerId === owner.id) {
      this.expandedOwnerId = null;
      this.ownerVehicles = [];
      // Restore global stats
      this.totalVehicles = this.globalStats.total;
      this.availableVehicles = this.globalStats.available;
      this.occupiedVehicles = this.globalStats.occupied;
    } else {
      this.expandedOwnerId = owner.id ?? null;
      if (this.expandedOwnerId) {
        this.isLoadingExpandedVehicles = true;
        this.ownerVehicles = [];
        this.loadVehiclesForAdmin(this.expandedOwnerId);
      }
    }
  }

  private loadVehiclesForAdmin(ownerId: number): void {
    const filtros = [new Filter('ownerId', '=', ownerId.toString())];

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(20000, 0),
      new Sort('id', true),
    );

    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (respVehicles: any) => {
        this.ownerVehicles = (respVehicles?.data?.content ?? []).filter(
          (v: any) => v.status !== 'Vendido',
        );

        // Ensure properties needed for display mapped correctly if applicable, or just map brand names
        if (this.ownerVehicles.length > 0) {
          this.ownerVehicles.forEach((v: any) => {
            if (v.driver?.name) {
              v.currentDriverName = v.driver.name;
            }
          });
          this.allVehicles = this.ownerVehicles;
          this.mapBrandNames();
          this.mapLastTripStatuses();
        }

        this.totalVehicles = this.ownerVehicles.length;

        const vehicleIds = new Set(this.ownerVehicles.map((v: any) => v.id));
        const tripFilter = new ModelFilterTable(
          [new Filter('status', '=', 'En Curso')],
          new Pagination(20000, 0),
          new Sort('id', true),
        );

        this.tripService.getTripFilter(tripFilter).subscribe({
          next: (tripResp: any) => {
            const activeTrips = tripResp?.data?.content ?? [];
            const occupiedIds = new Set(
              activeTrips
                .map((t: any) => t.vehicleId)
                .filter((id: any) => vehicleIds.has(id)),
            );

            this.occupiedVehicles = occupiedIds.size;
            this.availableVehicles = this.totalVehicles - this.occupiedVehicles;
            this.isLoadingExpandedVehicles = false;
          },
          error: () => {
            this.occupiedVehicles = 0;
            this.availableVehicles = this.totalVehicles;
            this.isLoadingExpandedVehicles = false;
          },
        });
      },
      error: () => {
        this.ownerVehicles = [];
        this.totalVehicles = 0;
        this.availableVehicles = 0;
        this.occupiedVehicles = 0;
        this.isLoadingExpandedVehicles = false;
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
    if (this.userRole === 'CONDUCTOR') return;

    // For NEW vehicles, validate the owner's vehicle limit
    if (!vehicle && !this.isOffcanvasOpen) {
      const owner =
        this.userRole === 'PROPIETARIO'
          ? this.loggedInOwner
          : (this.filteredOwner ?? null);
      if (this.checkVehicleLimit(owner)) return;
    }
    this.showingVehicleLimitWarning = false;
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    this.editingVehicle = vehicle || null;
    this.photoFile = null;
    this.photoPreview = vehicle?.photo || '';
    if (this.isOffcanvasOpen) {
      if (vehicle) {
        this.editingVehicle = vehicle;
        const ownerRel = vehicle.owners?.[0];
        const ownerId = ownerRel?.ownerId ?? null;

        // Patch fields
        this.isPatching = true;
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
        this.isPatching = false;

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
      setTimeout(() => this.captureInitialState(), 0);
    } else {
      this.editingVehicle = null;
      this.vehicleForm.reset();
      this.vehicleForm.markAsUntouched();
      this.vehicleForm.get('ownerId')?.enable();
    }
  }

  /** Returns true and shows warning if the owner is at their vehicle limit */
  private checkVehicleLimit(owner: ModelOwner | null): boolean {
    if (!owner) return false;
    const max = owner.maxVehicles;
    // We strictly use the current local total (which is already filtered for Non-Sold)
    // or we should calculate it again to be absolutely sure
    const current = this.totalVehicles;
    if (max != null && current >= max) {
      this.showingVehicleLimitWarning = true;
      return true;
    }
    return false;
  }

  dismissVehicleLimitWarning(): void {
    this.showingVehicleLimitWarning = false;
  }

  /** Abre el offcanvas de creación precargando el propietario del grupo */
  openAddVehicleForOwner(owner: ModelOwner): void {
    // Validate vehicle limit for this owner
    if (this.checkVehicleLimit(owner)) return;
    this.showingVehicleLimitWarning = false;
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
    setTimeout(() => this.captureInitialState(), 0);
  }

  async onSubmit(): Promise<void> {
    if (this.vehicleForm.valid) {
      try {
        const formValue = this.vehicleForm.getRawValue();

        if (this.editingVehicle) {
          let photoUrl = this.editingVehicle.photo || '';

          if (this.photoFile) {
            try {
              const uploadRes = await firstValueFrom(
                this.commonService.uploadPhoto(
                  'vehicle',
                  this.editingVehicle.id!,
                  this.photoFile,
                ),
              );
              photoUrl = uploadRes?.data || photoUrl;
            } catch (uploadErr) {
              console.error('Error uploading photo:', uploadErr);
            }
          }

          const vehicleToSave: ModelVehicle = {
            id: this.editingVehicle.id,
            photo: photoUrl,
            plate: formValue.plate,
            vehicleBrandId: Number(formValue.brand),
            model: formValue.model,
            year: Number(formValue.year),
            color: formValue.color,
            engineNumber: formValue.motorNumber,
            chassisNumber: formValue.chassisNumber,
            numberOfAxles: formValue.axleCount,
            status: this.editingVehicle.status || 'Activo',
            ownerId:
              this.userRole === 'ADMINISTRADOR'
                ? Number(formValue.ownerId)
                : this.loggedInOwnerId || undefined,
            currentDriverId: formValue.driverId
              ? Number(formValue.driverId)
              : null,
          };

          this.isSaving = true;
          this.vehicleService.createVehicle(vehicleToSave).subscribe({
            next: () => {
              this.toastService.showSuccess(
                'Gestión de Vehículos',
                'Vehículo actualizado exitosamente!',
              );
              this.loadVehicles();
              this.toggleOffcanvas();
              this.isSaving = false;
            },
            error: (err) => {
              console.error('Error saving vehicle:', err);
              this.toastService.showError(
                'Error',
                'No se pudo procesar la solicitud. Por favor, intente de nuevo.',
              );
              this.isSaving = false;
            },
          });
        } else {
          // CREATE MODE
          const vehicleToSave: ModelVehicle = {
            id: undefined,
            photo: '',
            plate: formValue.plate,
            vehicleBrandId: Number(formValue.brand),
            model: formValue.model,
            year: Number(formValue.year),
            color: formValue.color,
            engineNumber: formValue.motorNumber,
            chassisNumber: formValue.chassisNumber,
            numberOfAxles: formValue.axleCount,
            status: 'Activo',
            ownerId:
              this.userRole === 'ADMINISTRADOR'
                ? Number(formValue.ownerId)
                : this.loggedInOwnerId || undefined,
            currentDriverId: formValue.driverId
              ? Number(formValue.driverId)
              : null,
          };

          this.isSaving = true;
          this.vehicleService.createVehicle(vehicleToSave).subscribe({
            next: async (response: any) => {
              const savedVehicle = response?.data;
              const newId: number | null = savedVehicle?.id ?? null;

              if (this.photoFile && newId) {
                try {
                  const uploadRes = await firstValueFrom(
                    this.commonService.uploadPhoto(
                      'vehicle',
                      newId,
                      this.photoFile,
                    ),
                  );
                  const photoUrl = uploadRes?.data || '';

                  if (photoUrl) {
                    const vehicleWithPhoto: ModelVehicle = {
                      ...savedVehicle,
                      photo: photoUrl,
                    };
                    this.vehicleService
                      .createVehicle(vehicleWithPhoto)
                      .subscribe({
                        error: (err) =>
                          console.error('Error updating photo URL:', err),
                      });
                  }
                } catch (uploadErr) {
                  console.error(
                    'Error uploading photo after create:',
                    uploadErr,
                  );
                }
              }

              this.toastService.showSuccess(
                'Gestión de Vehículos',
                'Vehículo creado exitosamente!',
              );
              this.loadVehicles();
              this.toggleOffcanvas();
              this.isSaving = false;
            },
            error: (err) => {
              console.error('Error saving vehicle:', err);
              this.toastService.showError(
                'Error',
                'No se pudo procesar la solicitud. Por favor, intente de nuevo.',
              );
              this.isSaving = false;
            },
          });
        }
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
      this.loading = true;
      this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            const content = response.data.content as any[];
            this.totalVehicles = content.filter(
              (v: any) => v.status !== 'Vendido',
            ).length;
            content.forEach((v: any) => {
              if (v.driver?.name) {
                v.currentDriverName = v.driver.name;
              }
            });
            this.allVehicles = content;
            this.mapBrandNames();
            this.mapLastTripStatuses();
            this.calculateStats();
            this.applyFilter(true);
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading vehicles via owner filter:', err);
          this.allVehicles = [];
          this.calculateStats();
          this.applyFilter(true);
          this.loading = false;
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
      this.loading = true;
      this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            const content = response.data.content as any[];
            this.totalVehicles = content.filter(
              (v: any) => v.status !== 'Vendido',
            ).length;
            content.forEach((v: any) => {
              if (v.driver?.name) {
                v.currentDriverName = v.driver.name;
              }
            });
            this.allVehicles = content;
            this.mapBrandNames();
            this.mapLastTripStatuses();
            this.calculateStats();
            this.applyFilter(true);
          } else {
            this.allVehicles = [];
            this.totalVehicles = 0;
            this.calculateStats();
            this.applyFilter(true);
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading vehicles for owner:', err);
          this.allVehicles = [];
          this.calculateStats();
          this.applyFilter(true);
          this.loading = false;
        },
      });

      // Case 2.1: Filter by driverIdFilter
    } else if (this.driverIdFilter != null) {
      const filtros = [
        new Filter('currentDriverId', '=', this.driverIdFilter.toString()),
      ];
      const filter = new ModelFilterTable(
        filtros,
        new Pagination(this.rows, this.page),
        new Sort('id', true),
      );
      this.loading = true;
      this.vehicleService.getVehicleFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            const content = response.data.content as any[];
            this.totalVehicles = content.filter(
              (v: any) => v.status !== 'Vendido',
            ).length;
            content.forEach((v: any) => {
              if (v.driver?.name) {
                v.currentDriverName = v.driver.name;
              }
            });
            this.allVehicles = content;
            this.mapBrandNames();
            this.mapLastTripStatuses();
            this.calculateStats();
            this.applyFilter(true);
          } else {
            this.allVehicles = [];
            this.totalVehicles = 0;
            this.calculateStats();
            this.applyFilter(true);
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading vehicles for driver:', err);
          this.allVehicles = [];
          this.calculateStats();
          this.applyFilter(true);
          this.loading = false;
        },
      });

      // Case 2.2: CONDUCTOR role → filter by their assigned vehicle
    } else if (this.userRole === 'CONDUCTOR' && this.loggedInDriverId != null) {
      const filtros = [
        new Filter('currentDriverId', '=', this.loggedInDriverId.toString()),
      ];
      const filter = new ModelFilterTable(
        filtros,
        new Pagination(this.rows, this.page),
        new Sort('id', true),
      );
      this.loading = true;
      this.vehicleService.getVehicleFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            const content = response.data.content as any[];
            this.totalVehicles = content.filter(
              (v: any) => v.status !== 'Vendido',
            ).length;
            content.forEach((v: any) => {
              if (v.driver?.name) {
                v.currentDriverName = v.driver.name;
              }
            });
            this.allVehicles = content;
            this.mapBrandNames();
            this.mapLastTripStatuses();
            this.calculateStats();
            this.applyFilter(true);
          } else {
            this.allVehicles = [];
            this.totalVehicles = 0;
            this.calculateStats();
            this.applyFilter(true);
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading vehicles for logged-in driver:', err);
          this.allVehicles = [];
          this.calculateStats();
          this.applyFilter(true);
          this.loading = false;
        },
      });

      // Case 3: ADMINISTRADOR without any owner filter → load all
    } else {
      const fetchRows = this.isSearchActive ? 20000 : this.rows;
      const fetchPage = this.isSearchActive ? 0 : this.page;
      const filter = new ModelFilterTable(
        [],
        new Pagination(fetchRows, fetchPage),
        new Sort('id', true),
      );
      this.loading = true;
      this.vehicleService.getVehicleFilter(filter).subscribe({
        next: (response: any) => {
          if (response?.data?.content) {
            const content = response.data.content as any[];
            this.totalVehicles = content.filter(
              (v: any) => v.status !== 'Vendido',
            ).length;
            content.forEach((v: any) => {
              if (v.driver?.name) {
                v.currentDriverName = v.driver.name;
              }
            });
            this.allVehicles = content;
            this.mapBrandNames();
            this.mapLastTripStatuses();
            this.calculateStats();
            this.applyFilter(true);
          } else {
            this.allVehicles = [];
            this.groupedVehicles = [];
            this.calculateStats();
          }
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading vehicles:', err);
          this.loading = false;
        },
      });
    }
  }

  calculateStats(): void {
    if (this.allVehicles.length === 0) {
      this.availableVehicles = 0;
      this.occupiedVehicles = 0;
      return;
    }

    const vehicleIds = new Set(this.allVehicles.map((v) => v.id));

    const tripFilter = new ModelFilterTable(
      [new Filter('status', '=', 'En Curso')],
      new Pagination(20000, 0),
      new Sort('id', true),
    );

    this.tripService.getTripFilter(tripFilter).subscribe({
      next: (tripResp: any) => {
        const activeTrips = tripResp?.data?.content ?? [];
        const occupiedIds = new Set(
          activeTrips
            .map((t: any) => t.vehicleId)
            .filter((id: any) => vehicleIds.has(id)),
        );

        this.occupiedVehicles = occupiedIds.size;
        const totalActive = this.allVehicles.filter(
          (v) => v.status !== 'Vendido',
        ).length;
        this.availableVehicles = totalActive - this.occupiedVehicles;
      },
    });
  }

  applyFilter(fromLoadVehicles: boolean = false): void {
    if (!fromLoadVehicles) {
      this.isSearchActive = this.isSearchingVehicles;
    }

    if (this.userRole === 'ADMINISTRADOR' && this.expandedOwnerId) {
      this.loadVehiclesForAdmin(this.expandedOwnerId);
      return;
    }

    if (this.userRole === 'ADMINISTRADOR') {
      if (this.isSearchActive && !fromLoadVehicles) {
        this.page = 0;
        this.loadVehicles();
        return;
      } else if (!this.isSearchActive) {
        this.page = 0;
        this.loadOwners();
        return;
      }
    }

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

    if (this.activeFilter !== 'Todos') {
      const filter = this.activeFilter;
      filtered = filtered.filter((v) => {
        const tripStatus = (v.lastTripStatus || '').toUpperCase();
        if (filter === 'Disponible') {
          return (
            tripStatus === 'COMPLETADO' ||
            tripStatus === 'PENDIENTE' ||
            tripStatus === 'CANCELADO' ||
            tripStatus === ''
          );
        } else if (filter === 'En Curso') {
          return tripStatus === 'EN CURSO';
        }
        return true;
      });
    }

    if (this.userRole === 'ADMINISTRADOR' && this.isSearchActive) {
      this.totalVehicles = filtered.length;
    }

    this.buildGroups(filtered);
  }

  get dataTotal(): number {
    return this.userRole === 'ADMINISTRADOR' && !this.isSearchActive
      ? this.totalOwners
      : this.totalVehicles;
  }

  get itemsShownCount(): number {
    return this.userRole === 'ADMINISTRADOR' && !this.isSearchActive
      ? this.owners.length
      : this.groupedVehicles.reduce((acc, g) => acc + g.vehicles.length, 0);
  }

  get totalPages(): number {
    return Math.ceil(this.dataTotal / this.rows);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.expandedOwnerId = null;
      this.ownerVehicles = [];
      if (this.userRole === 'ADMINISTRADOR' && !this.isSearchActive) {
        this.loadOwners();
      } else {
        this.loadVehicles();
      }
    }
  }

  buildGroups(vehicles: ModelVehicle[]): void {
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
    if (this.userRole === 'PROPIETARIO') {
      // Single card for the logged-in owner
      this.groupedVehicles = [{ owner, vehicles }];
    } else if (this.userRole === 'CONDUCTOR') {
      // For CONDUCTOR, also ensure a fixed group for their owner
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

        if (!firstOwnerRel?.owner) {
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
        return aName.localeCompare(bName, 'es');
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

  mapLastTripStatuses(): void {
    if (this.allVehicles.length === 0) return;

    // 1. Collect all valid vehicle IDs
    const vehicleIds = this.allVehicles
      .map((v) => v.id)
      .filter((id) => id != null)
      .map(String);

    if (vehicleIds.length === 0) return;

    // 2. Single request to get potential last trips for all these vehicles
    // Fetch a batch sorted by startDate DESC to identify the most recent one for each
    const tripFilter = new ModelFilterTable(
      [new Filter('vehicle.id', 'in', vehicleIds.join(','))],
      new Pagination(500, 0), // Fetch a sufficient window of recent trips
      new Sort('startDate', false),
    );

    this.tripService.getTripFilter(tripFilter).subscribe({
      next: (resp: any) => {
        const trips: ModelTrip[] = resp?.data?.content ?? [];

        // 3. Map to store the latest trip for each vehicle
        // Since the list is sorted DESC, the first trip found for an ID is the latest
        const latestTripsMap = new Map<number, ModelTrip>();

        trips.forEach((t) => {
          if (t.vehicleId && !latestTripsMap.has(t.vehicleId)) {
            latestTripsMap.set(t.vehicleId, t);
          }
        });

        // 4. Update the state of allVehicles
        this.allVehicles.forEach((v) => {
          if (v.id) {
            const lastTrip = latestTripsMap.get(v.id);
            v.lastTripStatus = lastTrip?.status ?? '';
            v.lastTripId = lastTrip?.id ?? null;
          }
        });
      },
      error: (err) => {
        console.error('Error in batch mapping last trips:', err);
      },
    });
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.applyFilter();
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

  goToMaintenance(vehicle: ModelVehicle): void {
    if (vehicle.id) {
      this.router.navigate(['/site/maintenance'], {
        queryParams: { vehicleId: vehicle.id },
      });
    }
  }

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    CustomValidators.readPhotoFile(event).then(
      (res) => {
        this.photoFile = res.blob;
        this.photoPreview = res.base64;
      },
      (err) => this.toastService.showError('Error', err),
    );
  }

  removePhoto(): void {
    this.photoFile = null;
    this.photoPreview = '';
  }

  onCameraCapture(dataUrl: string): void {
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    this.photoFile = new Blob([ab], { type: mimeType });
    this.photoPreview = dataUrl;
    this.showCamera = false;
  }

  onCameraClose(): void {
    this.showCamera = false;
  }

  get canSave(): boolean {
    return this.vehicleForm.valid && (this.isModified || !!this.photoFile);
  }

  private captureInitialState(): void {
    this.initialFormValue = JSON.stringify(this.getNormalizedFormValue());
  }

  get isModified(): boolean {
    return (
      JSON.stringify(this.getNormalizedFormValue()) !== this.initialFormValue
    );
  }

  private getNormalizedFormValue(): any {
    const raw = this.vehicleForm.getRawValue();
    const normalized: any = {};
    Object.keys(raw).forEach((key) => {
      let val = raw[key];
      if (val === undefined || val === null) val = null;
      if (typeof val === 'number') val = String(val);
      normalized[key] = val;
    });
    return normalized;
  }

  goBackToOwners(): void {
    this.router.navigate(['/site/owners']);
  }

  openSellConfirm(vehicle: ModelVehicle): void {
    this.vehicleToSell = vehicle;
    this.showSellConfirm = true;
  }

  cancelSell(): void {
    this.showSellConfirm = false;
    this.vehicleToSell = null;
  }

  confirmSell(): void {
    if (!this.vehicleToSell?.id) return;

    this.isSelling = true;
    this.vehicleService.sellVehicle(this.vehicleToSell.id).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Venta de Vehículo',
          'Vehículo vendido exitosamente!',
        );
        if (this.vehicleToSell) {
          this.vehicleToSell.status = 'Vendido';
        }
        this.showSellConfirm = false;
        this.isSelling = false;
        this.vehicleToSell = null;
        this.updateStatusCounts();
      },
      error: (err) => {
        console.error('Error selling vehicle:', err);
        const errorMsg =
          err?.error?.message || 'No se pudo procesar la venta del vehículo';
        this.toastService.showError('Error', errorMsg);
        this.isSelling = false;
      },
    });
  }
}
