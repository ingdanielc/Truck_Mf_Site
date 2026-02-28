import {
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Subscription } from 'rxjs';
import { ModelTrip } from 'src/app/models/trip-model';
import { TripService } from 'src/app/services/trip.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { DriverService } from 'src/app/services/driver.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelDriver } from 'src/app/models/driver-model';
import { DocumentNumberPipe } from 'src/app/pipes/document-number.pipe';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'g-trip-form',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, DocumentNumberPipe],
  templateUrl: './g-trip-form.component.html',
  styleUrls: ['./g-trip-form.component.scss'],
})
export class GTripFormComponent implements OnInit, OnDestroy {
  @Input() trip: ModelTrip | null = null;
  @Input() userRole: string = 'ROL';
  @Input() loggedInOwnerId: number | null = null;
  @Output() saved = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  tripForm: FormGroup;
  owners: ModelOwner[] = [];
  vehicles: ModelVehicle[] = [];
  drivers: ModelDriver[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];
  brands: any[] = [];
  loadingVehicles: boolean = false;
  loadingDrivers: boolean = false;

  private _pendingVehicleId: number | null = null;
  private _pendingDriverId: number | null = null;
  private userSub?: Subscription;
  private ownerChangeSub?: Subscription;
  private vehicleChangeSub?: Subscription;

  loadTypes: string[] = [
    'General',
    'Refrigerada',
    'Granel',
    'Peligrosa',
    'Contenedores',
  ];
  companies: string[] = [
    'CashTruck Logistics',
    'Transportes Unidos',
    'Carga Segura S.A.',
    'Ruta Rápida',
    'Logística Avanzada',
  ];
  tripStatuses: string[] = [
    'Planeado',
    'En Curso',
    'Completado',
    'Cancelado',
    'Pendiente',
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
  ) {
    this.tripForm = this.fb.group({
      numberTrip: ['', [Validators.required]],
      manifestNumber: ['', [Validators.required]],
      originId: ['', [Validators.required]],
      destinationId: ['', [Validators.required]],
      freight: [
        0,
        [Validators.required, Validators.min(0), Validators.max(999999999)],
      ],
      advancePayment: [
        0,
        [Validators.required, Validators.min(0), Validators.max(999999999)],
      ],
      balance: [0],
      startDate: [
        new Date().toISOString().split('T')[0],
        [Validators.required],
      ],
      ownerId: [null, [Validators.required]],
      vehicleId: [null, [Validators.required]],
      driverId: [null, [Validators.required]],
      loadType: ['', [Validators.required]],
      company: ['', [Validators.required]],
      status: ['En Curso'],
    });

    this.setupFormSubscriptions();
  }

  ngOnInit(): void {
    this.loadCities();
    this.loadBrands();
    this.loadOwners();

    if (this.trip) {
      this.patchForm(this.trip);
    } else {
      this.resetForm();
    }
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.ownerChangeSub?.unsubscribe();
    this.vehicleChangeSub?.unsubscribe();
  }

  private setupFormSubscriptions(): void {
    this.ownerChangeSub = this.tripForm
      .get('ownerId')!
      .valueChanges.subscribe((ownerId) => {
        this.tripForm.get('vehicleId')?.setValue(null);
        this.tripForm.get('driverId')?.setValue(null);
        this.vehicles = [];
        this.drivers = [];
        if (ownerId) {
          this.loadVehiclesByOwner(Number(ownerId));
          this.loadDriversByOwner(Number(ownerId));
        }
      });

    this.vehicleChangeSub = this.tripForm
      .get('vehicleId')!
      .valueChanges.subscribe((vehicleId) => {
        if (vehicleId) {
          const selectedVehicle = this.vehicles.find(
            (v) => String(v.id) === String(vehicleId),
          );
          if (selectedVehicle) {
            this.tripForm
              .get('driverId')
              ?.setValue(selectedVehicle.currentDriverId);

            // AUTO-CALCULAR NÚMERO DE VIAJE (Solo para nuevos)
            if (!this.trip) {
              this.fetchNextTripNumber(Number(vehicleId));
            }
          } else {
            this.tripForm.get('driverId')?.setValue(null);
            this.tripForm.get('numberTrip')?.setValue('');
          }
        } else {
          this.tripForm.get('driverId')?.setValue(null);
          this.tripForm.get('numberTrip')?.setValue('');
        }
      });

    this.tripForm.valueChanges.subscribe((values) => {
      const freight = Number(values.freight) || 0;
      const advancePayment = Number(values.advancePayment) || 0;
      this.tripForm
        .get('balance')
        ?.setValue(freight - advancePayment, { emitEvent: false });
    });
  }

  private patchForm(trip: ModelTrip): void {
    const tripOwnerId: number | null =
      this.userRole === 'PROPIETARIO'
        ? this.loggedInOwnerId
        : (trip.driver?.ownerId ?? trip.vehicle?.owners?.[0]?.ownerId ?? null);

    if (tripOwnerId) {
      this._pendingVehicleId = trip.vehicleId ?? null;
      this._pendingDriverId = trip.driverId ?? null;
      this.loadVehiclesByOwner(Number(tripOwnerId));
      this.loadDriversByOwner(Number(tripOwnerId));
    }

    this.tripForm.patchValue({
      numberTrip: trip.numberTrip,
      manifestNumber: trip.manifestNumber,
      originId: trip.originId,
      destinationId: trip.destinationId,
      freight: trip.freight,
      advancePayment: trip.advancePayment,
      startDate: trip.startDate,
      vehicleId: trip.vehicleId,
      driverId: trip.driverId,
      loadType: trip.loadType,
      company: trip.company,
      status: trip.status,
      ownerId: tripOwnerId,
    });

    if (this.userRole === 'PROPIETARIO') {
      this.tripForm.get('ownerId')?.disable();
    } else {
      this.tripForm.get('ownerId')?.enable();
    }
  }

  private resetForm(): void {
    this.tripForm.reset({
      freight: 0,
      advancePayment: 0,
      startDate: new Date().toISOString().split('T')[0],
      status: 'En Curso',
      driverId: null,
      loadType: '',
      company: '',
    });

    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId) {
      this.tripForm.get('ownerId')?.setValue(this.loggedInOwnerId);
      this.tripForm.get('ownerId')?.disable();
    }
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data.sort((a: any, b: any) => {
            const stateCmp = (a.state || '').localeCompare(b.state || '', 'es');
            return stateCmp !== 0
              ? stateCmp
              : a.name.localeCompare(b.name, 'es');
          });
          this.groupedCities = this.buildGroupedCities();
        }
      },
    });
  }

  private buildGroupedCities(): { state: string; cities: any[] }[] {
    const map = new Map<string, any[]>();
    for (const city of this.cities) {
      const state = city.state || 'Sin departamento';
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(city);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([state, cities]) => ({ state, cities }));
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('user.id', '=', this.loggedInOwnerId.toString()));
    }
    const filter = new ModelFilterTable(
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

  loadVehiclesByOwner(ownerId: number): void {
    this.loadingVehicles = true;
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('owner.id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        this.mapBrandNames();
        this.loadingVehicles = false;
        if (this._pendingVehicleId != null) {
          this.tripForm
            .get('vehicleId')
            ?.setValue(this._pendingVehicleId, { emitEvent: true });
          this._pendingVehicleId = null;
        }
      },
      error: () => (this.loadingVehicles = false),
    });
  }

  fetchNextTripNumber(vehicleId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('vehicle.id', '=', vehicleId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        const total = response?.data?.totalElements ?? 0;
        this.tripForm.get('numberTrip')?.setValue(total + 1);
      },
      error: () => {
        // Fallback or error handling
        this.tripForm.get('numberTrip')?.setValue('');
      },
    });
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
        if (this._pendingDriverId != null) {
          this.tripForm.get('driverId')?.setValue(this._pendingDriverId);
          this._pendingDriverId = null;
        }
      },
      error: () => (this.loadingDrivers = false),
    });
  }

  loadBrands(): void {
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.brands = response.data;
          this.mapBrandNames();
        }
      },
    });
  }

  mapBrandNames(): void {
    if (this.brands.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        const brand = this.brands.find(
          (b) => b.id.toString() === v.vehicleBrandId.toString(),
        );
        if (brand) v.vehicleBrandName = brand.name;
      });
    }
  }

  onSubmit(): void {
    if (this.tripForm.valid) {
      const { ownerId, balance, ...formData } = this.tripForm.getRawValue();
      const tripData: ModelTrip = {
        ...formData,
        numberOfDays: 0,
        paidBalance: this.trip?.paidBalance ?? false,
        id: this.trip ? this.trip.id : null,
      };

      if (['Completado', 'Cancelado', 'Pendiente'].includes(tripData.status)) {
        tripData.endDate = new Date().toISOString().split('T')[0];
        if (tripData.startDate && tripData.endDate) {
          const start = new Date(tripData.startDate);
          const end = new Date(tripData.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          tripData.numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }

      this.tripService.createTrip(tripData).subscribe({
        next: () => {
          this.toastService.showSuccess(
            'Éxito',
            `Viaje ${this.trip ? 'actualizado' : 'creado'} correctamente`,
          );
          this.saved.emit();
        },
        error: (error) => {
          console.error('Error saving trip:', error);
          this.toastService.showError('Error', 'Error al guardar el viaje');
        },
      });
    }
  }

  formatCurrencyInput(controlName: string, event: any): void {
    const MAX = 999_999_999;
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const stringValue = String(value).replaceAll(/\D/g, '');
    const numericValue = stringValue ? Number.parseInt(stringValue, 10) : 0;

    if (numericValue > MAX) {
      const current = this.tripForm.get(controlName)?.value ?? 0;
      input.value = new Intl.NumberFormat('de-DE').format(current);
      return;
    }
    this.tripForm.get(controlName)?.setValue(numericValue, { emitEvent: true });
  }

  getFormattedValue(controlName: string): string {
    const value = this.tripForm.get(controlName)?.value;
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('de-DE').format(value);
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
