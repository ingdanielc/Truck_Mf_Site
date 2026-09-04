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
import { Subscription, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { ModelTrip } from 'src/app/models/trip-model';
import { TripService } from 'src/app/services/trip.service';
import { NotificationsService } from 'src/app/services/notifications.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
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
import { NgClass, UpperCasePipe } from '@angular/common';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { computeRoute, routeDistanceKm } from 'src/app/utils/google-routes';
import { PlatePipe } from '../../pipes/plate.pipe';

@Component({
  selector: 'g-trip-form',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DocumentNumberPipe,
    UpperCasePipe,
    NgClass,
    PlatePipe,
  ],
  templateUrl: './g-trip-form.component.html',
  styleUrls: ['./g-trip-form.component.scss'],
})
export class GTripFormComponent implements OnInit, OnDestroy {
  @Input() trip: ModelTrip | null = null;
  @Input() userRole: string = 'ROL';
  @Input() loggedInOwnerId: number | null = null;
  @Input() loggedInDriverId: number | null = null;
  @Input() preselectedOwnerId: number | null = null;
  @Output() saved = new EventEmitter<ModelTrip>();
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
  isSaving: boolean = false;

  private _pendingVehicleId: number | null = null;
  private _pendingDriverId: number | null = null;
  private readonly userSub?: Subscription;
  private ownerChangeSub?: Subscription;
  private vehicleChangeSub?: Subscription;
  private tripTypeChangeSub?: Subscription;
  private initialFormValue: string = '';
  private isPatching: boolean = false;

  /**
   * Disponibilidad ya resuelta, por propietario. Evita repetir las dos
   * consultas cuando el ADMINISTRADOR alterna entre propietarios en el
   * desplegable. Se limpia al guardar: el viaje nuevo cambia que vehiculos
   * quedan ocupados.
   */
  private readonly vehiclesByOwnerCache = new Map<
    number,
    { allVehicles: ModelVehicle[]; activeTrips: any[] }
  >();

  private readonly defaultLoadTypes: string[] = [
    'General',
    'Refrigerada',
    'Granel',
    'Peligrosa',
    'Contenedores',
  ];
  private readonly defaultCompanies: string[] = [
    'CashTruck Logistics',
    'Transportes Unidos',
    'Carga Segura S.A.',
    'Ruta Rápida',
    'Logística Avanzada',
  ];
  loadTypes: string[] = [...this.defaultLoadTypes];
  companies: string[] = [...this.defaultCompanies];
  tripStatuses: string[] = ['En Curso', 'Completado', 'Cancelado', 'Pendiente'];
  tripTypes: { id: string; label: string }[] = [
    { id: 'CARGADO', label: 'Cargado' },
    { id: 'REDONDO', label: 'Redondo' },
    { id: 'VACIO', label: 'Vacío' },
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.tripForm = this.fb.group(
      {
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
        loadType: [''],
        company: [''],
        status: ['En Curso'],
        tripType: ['CARGADO', [Validators.required]],
        returnDestinationId: [null],
        currentLeg: ['IDA'],
      },
      { validators: this.advancePaymentValidator },
    );

    this.setupFormSubscriptions();
  }

  private advancePaymentValidator(group: FormGroup) {
    // El viaje vacío no maneja flete ni anticipo
    if (group.get('tripType')?.value === 'VACIO') return null;

    const freight = Number(group.get('freight')?.value) || 0;
    const advance = Number(group.get('advancePayment')?.value) || 0;
    return advance <= freight ? null : { advanceLimitExceeded: true };
  }

  get isEmptyTrip(): boolean {
    return this.tripForm.get('tripType')?.value === 'VACIO';
  }

  get isRoundTrip(): boolean {
    return this.tripForm.get('tripType')?.value === 'REDONDO';
  }

  /**
   * El viaje vacío no tiene flete ni saldo, así que no puede quedar Pendiente.
   * Se conserva la opción si el viaje ya venía en ese estado, para no mostrar
   * en el combo un estado distinto al real.
   */
  get availableStatuses(): string[] {
    if (!this.isEmptyTrip || this.trip?.status === 'Pendiente') {
      return this.tripStatuses;
    }
    return this.tripStatuses.filter((s) => s !== 'Pendiente');
  }

  /**
   * Un viaje ya finalizado no cambia de ruta ni de asignación: se bloquean
   * tipo de viaje, origen, destinos, vehículo y conductor.
   */
  get isStatusLocked(): boolean {
    const status = this.trip?.status;
    return status === 'Completado' || status === 'Pendiente';
  }

  /**
   * Bloquea los campos de ruta y asignación de un viaje ya finalizado.
   * Va por la API del FormControl y no por `[disabled]`.
   */
  private applyStatusLock(): void {
    if (!this.isStatusLocked) return;

    const lockedControls = [
      'tripType',
      'originId',
      'destinationId',
      'returnDestinationId',
      'vehicleId',
      'driverId',
    ];

    for (const name of lockedControls) {
      this.tripForm.get(name)?.disable({ emitEvent: false });
    }
  }

  /**
   * Ajusta validaciones y valores según el tipo de viaje.
   * Todos los cambios van con `emitEvent: false` para no disparar ciclos
   * de `valueChanges` ni marcar el formulario como modificado al abrirlo.
   */
  private applyTripTypeRules(type: string): void {
    const isEmpty = type === 'VACIO';
    const isRound = type === 'REDONDO';

    // Manifiesto: obligatorio en todos los tipos menos el vacío
    const manifest = this.tripForm.get('manifestNumber');
    if (isEmpty) {
      manifest?.clearValidators();
      manifest?.setValue('', { emitEvent: false });
    } else {
      manifest?.setValidators([Validators.required]);
    }
    manifest?.updateValueAndValidity({ emitEvent: false });

    // Bloque financiero y datos de carga: no aplican al viaje vacío
    if (isEmpty) {
      this.tripForm.get('freight')?.setValue(0, { emitEvent: false });
      this.tripForm.get('advancePayment')?.setValue(0, { emitEvent: false });
      this.tripForm.get('balance')?.setValue(0, { emitEvent: false });
      this.tripForm.get('loadType')?.setValue('', { emitEvent: false });
      this.tripForm.get('company')?.setValue('', { emitEvent: false });
    }

    // Destino de regreso: solo existe en el viaje redondo
    const returnDestination = this.tripForm.get('returnDestinationId');
    if (isRound) {
      returnDestination?.setValidators([Validators.required]);
      // El viaje redondo arranca en el tramo de ida. No se pisa el valor de
      // un viaje que ya venga en regreso.
      const currentLeg = this.tripForm.get('currentLeg');
      if (!currentLeg?.value) {
        currentLeg?.setValue('IDA', { emitEvent: false });
      }
    } else {
      returnDestination?.clearValidators();
      returnDestination?.setValue(null, { emitEvent: false });
      this.tripForm.get('currentLeg')?.setValue(null, { emitEvent: false });
    }
    returnDestination?.updateValueAndValidity({ emitEvent: false });

    this.tripForm.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit(): void {
    this.loadCustomOptions();
    this.loadCities();
    this.loadBrands();
    this.loadOwners();

    if (this.trip) {
      this.patchForm(this.trip);
    } else {
      this.resetForm();
    }
  }

  private loadCustomOptions(): void {
    try {
      const savedTypes = localStorage.getItem('cashtruck_custom_load_types');
      const customTypes: string[] = savedTypes ? JSON.parse(savedTypes) : [];
      this.loadTypes = this.mergeAndSortLists(
        this.defaultLoadTypes,
        customTypes,
      );
    } catch {
      this.loadTypes = [...this.defaultLoadTypes];
    }

    try {
      const savedCompanies = localStorage.getItem('cashtruck_custom_companies');
      const customCompanies: string[] = savedCompanies
        ? JSON.parse(savedCompanies)
        : [];
      this.companies = this.mergeAndSortLists(
        this.defaultCompanies,
        customCompanies,
      );
    } catch {
      this.companies = [...this.defaultCompanies];
    }
  }

  private mergeAndSortLists(defaults: string[], custom: string[]): string[] {
    const map = new Map<string, string>();
    for (const item of [...defaults, ...custom]) {
      if (item?.trim()) {
        const key = item.trim().toLowerCase();
        if (!map.has(key)) {
          map.set(key, item.trim());
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'es'));
  }

  addLoadTypeIfNew(rawType: string): void {
    if (!rawType) return;
    const trimmed = rawType.trim();
    if (!trimmed) return;

    const exists = this.loadTypes.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase(),
    );

    if (!exists) {
      const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      this.loadTypes.push(formatted);
      this.loadTypes.sort((a, b) => a.localeCompare(b, 'es'));
      this.saveCustomLoadTypes();
    }
  }

  addCompanyIfNew(rawCompany: string): void {
    if (!rawCompany) return;
    const trimmed = rawCompany.trim();
    if (!trimmed) return;

    const exists = this.companies.some(
      (c) => c.toLowerCase() === trimmed.toLowerCase(),
    );

    if (!exists) {
      const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      this.companies.push(formatted);
      this.companies.sort((a, b) => a.localeCompare(b, 'es'));
      this.saveCustomCompanies();
    }
  }

  private saveCustomLoadTypes(): void {
    try {
      const customOnly = this.loadTypes.filter(
        (t) =>
          !this.defaultLoadTypes.some(
            (d) => d.toLowerCase() === t.toLowerCase(),
          ),
      );
      localStorage.setItem(
        'cashtruck_custom_load_types',
        JSON.stringify(customOnly),
      );
    } catch (e) {
      console.error('Error saving custom load types:', e);
    }
  }

  private saveCustomCompanies(): void {
    try {
      const customOnly = this.companies.filter(
        (c) =>
          !this.defaultCompanies.some(
            (d) => d.toLowerCase() === c.toLowerCase(),
          ),
      );
      localStorage.setItem(
        'cashtruck_custom_companies',
        JSON.stringify(customOnly),
      );
    } catch (e) {
      console.error('Error saving custom companies:', e);
    }
  }

  selectTripType(typeId: string): void {
    if (this.isStatusLocked) return;

    const control = this.tripForm.get('tripType');
    if (control?.value === typeId) return;

    control?.setValue(typeId);
    control?.markAsDirty();
  }

  onLoadTypeBlur(): void {
    const val = this.tripForm.get('loadType')?.value;
    if (val) this.addLoadTypeIfNew(val);
  }

  onCompanyBlur(): void {
    const val = this.tripForm.get('company')?.value;
    if (val) this.addCompanyIfNew(val);
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.ownerChangeSub?.unsubscribe();
    this.vehicleChangeSub?.unsubscribe();
    this.tripTypeChangeSub?.unsubscribe();
  }

  private setupFormSubscriptions(): void {
    this.ownerChangeSub = this.tripForm
      .get('ownerId')!
      .valueChanges.subscribe((ownerId) => {
        if (this.isPatching) return;
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
        if (this.isPatching) return;
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

    this.tripTypeChangeSub = this.tripForm
      .get('tripType')!
      .valueChanges.subscribe((type) => {
        if (this.isPatching) return;
        this.applyTripTypeRules(type);
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

    // Asegurarse de que el valor inicial sea un string de fecha válido para el input type="date"
    let startDateStr = '';
    if (trip.startDate) {
      const dateObj = new Date(trip.startDate);
      if (!Number.isNaN(dateObj.getTime())) {
        startDateStr = dateObj.toISOString().split('T')[0];
      }
    }

    this.isPatching = true;
    this.tripForm.patchValue({
      ownerId: tripOwnerId,
      numberTrip: trip.numberTrip ?? '',
      manifestNumber: trip.manifestNumber ?? '',
      originId: trip.originId ? Number(trip.originId) : '',
      destinationId: trip.destinationId ? Number(trip.destinationId) : '',
      freight: Number(trip.freight) || 0,
      advancePayment: Number(trip.advancePayment) || 0,
      balance:
        Number(trip.balance) ||
        Number(trip.freight) - Number(trip.advancePayment) ||
        0,
      startDate: startDateStr,
      loadType: trip.loadType ?? '',
      company: trip.company ?? '',
      status: trip.status || 'En Curso',
      vehicleId: trip.vehicleId ?? null,
      driverId: trip.driverId ?? null,
      tripType: trip.tripType ?? 'CARGADO',
      returnDestinationId: trip.returnDestinationId
        ? Number(trip.returnDestinationId)
        : null,
      currentLeg: trip.currentLeg ?? 'IDA',
    });
    this.isPatching = false;

    if (this.userRole === 'PROPIETARIO') {
      this.tripForm
        .get('ownerId')
        ?.setValue(this.loggedInOwnerId, { emitEvent: false });
    }

    // El propietario no se cambia al editar: el vehículo y el conductor del
    // viaje ya están asignados a él. Aplica a todos los roles, incluido el
    // administrador, que es el único que ve el campo.
    this.tripForm.get('ownerId')?.disable({ emitEvent: false });

    // Register trip's loadType and company into autocomplete lists
    if (trip.loadType) this.addLoadTypeIfNew(trip.loadType);
    if (trip.company) this.addCompanyIfNew(trip.company);

    this.applyTripTypeRules(this.tripForm.get('tripType')?.value);
    this.applyStatusLock();

    setTimeout(() => this.captureInitialState(), 0);
  }

  private resetForm(): void {
    this.isPatching = true;
    this.tripForm.reset({
      freight: 0,
      advancePayment: 0,
      startDate: new Date().toISOString().split('T')[0],
      status: 'En Curso',
      driverId: null,
      loadType: '',
      company: '',
      tripType: 'CARGADO',
      returnDestinationId: null,
      currentLeg: 'IDA',
    });
    this.isPatching = false;

    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId) {
      this.tripForm.get('ownerId')?.setValue(this.loggedInOwnerId);
      this.tripForm.get('ownerId')?.disable({ emitEvent: false });
    } else if (this.preselectedOwnerId) {
      this.tripForm.get('ownerId')?.setValue(this.preselectedOwnerId);
    }

    if (this.userRole === 'CONDUCTOR' && this.loggedInDriverId) {
      this.tripForm.get('ownerId')?.setValue(this.loggedInOwnerId);
      this.tripForm.get('ownerId')?.disable({ emitEvent: false });
      this.tripForm.get('driverId')?.setValue(this.loggedInDriverId);
      this.tripForm.get('driverId')?.disable();
    }

    this.applyTripTypeRules(this.tripForm.get('tripType')?.value);

    setTimeout(() => this.captureInitialState(), 0);
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
    const cached = this.vehiclesByOwnerCache.get(ownerId);
    if (cached) {
      this.applyVehiclesResult(cached);
      return;
    }

    this.loadingVehicles = true;
    const vehicleFilter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('owner.id', true),
    );

    this.vehicleService
      .getVehicleOwnerFilter(vehicleFilter)
      .pipe(
        switchMap((respVehicles: any) => {
          const allVehicles: ModelVehicle[] = respVehicles?.data?.content ?? [];
          if (allVehicles.length === 0) {
            return of({ allVehicles, activeTrips: [] });
          }

          const vehicleIds = allVehicles.map((v) => v.id).join(',');
          const activeTripsFilter = new ModelFilterTable(
            [
              new Filter('status', 'in', 'En Curso'),
              new Filter('vehicleId', 'in', vehicleIds),
            ],
            new Pagination(20000, 0),
            new Sort('id', true),
          );

          return this.tripService.getTripFilter(activeTripsFilter).pipe(
            map((respTrips: any) => ({
              allVehicles,
              activeTrips: respTrips?.data?.content ?? [],
            })),
          );
        }),
      )
      .subscribe({
        next: (resps: any) => {
          this.vehiclesByOwnerCache.set(ownerId, resps);
          this.applyVehiclesResult(resps);
        },
        error: () => (this.loadingVehicles = false),
      });
  }

  /**
   * Vuelca en el formulario la disponibilidad resuelta. Se extrajo del
   * `subscribe` para poder reutilizarlo cuando el dato sale de
   * `vehiclesByOwnerCache` en vez de la red.
   */
  private applyVehiclesResult(resps: {
    allVehicles: ModelVehicle[];
    activeTrips: any[];
  }): void {
    const { allVehicles, activeTrips } = resps;

    // Identify vehicle IDs that have active trips
    const busyVehicleIds = new Set(activeTrips.map((t: any) => t.vehicleId));

    // Filter: Keep vehicles that are NOT busy,
    // AND are NOT sold,
    // OR is the vehicle of the trip we are currently editing
    this.vehicles = allVehicles.filter((v: any) => {
      const isBusy = busyVehicleIds.has(v.id);
      const isSold = v.status === 'Vendido';
      const isSameAsEditing = this.trip && v.id === this.trip.vehicleId;
      return (!isBusy && !isSold) || isSameAsEditing;
    });

    this.mapBrandNames();
    this.loadingVehicles = false;

    // NEW: If CONDUCTOR, auto-select their vehicle
    if (!this.trip && this.userRole === 'CONDUCTOR' && this.loggedInDriverId) {
      const driverVehicle = allVehicles.find(
        (v: any) => v.currentDriverId === this.loggedInDriverId,
      );
      if (driverVehicle) {
        this.tripForm.get('vehicleId')?.setValue(driverVehicle.id);
      }
    } else if (!this.trip && this.vehicles.length === 1) {
      // Pre-select if only one vehicle is available (New trip)
      this.tripForm.get('vehicleId')?.setValue(this.vehicles[0].id);
    }

    if (this._pendingVehicleId != null) {
      this.tripForm
        .get('vehicleId')
        ?.setValue(this._pendingVehicleId, { emitEvent: true });
      this._pendingVehicleId = null;
    }
    if (this.trip) {
      setTimeout(() => this.captureInitialState(), 0);
    }
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
        if (this.trip) {
          setTimeout(() => this.captureInitialState(), 0);
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

  /** Timeout de la ruta: guardar no puede quedar colgado de Google. */
  private readonly ROUTE_TIMEOUT_MS = 8000;

  /** Nombre de la ciudad tal como lo espera Google Routes. */
  private cityName(cityId: any): string {
    if (cityId === null || cityId === undefined || cityId === '') return '';
    const city = this.cities.find((c) => String(c.id) === String(cityId));
    return city?.name || '';
  }

  /**
   * Kilometros de la ruta del viaje, con la misma forma que usa el panel de
   * informacion: en un viaje redondo el destino de ida entra como parada
   * intermedia, asi que la distancia cubre ida y regreso.
   *
   * Devuelve `undefined` si no se pudo calcular —sin ciudades, sin SDK de
   * Maps o si Google no responde a tiempo—. Guardar nunca se bloquea por
   * esto: el viaje se registra igual y el kilometraje queda sin sumar.
   */
  private async resolveDistanceKm(formValue: any): Promise<number | undefined> {
    const originName = this.cityName(formValue.originId);
    const destinationName = this.cityName(formValue.destinationId);
    if (!originName || !destinationName) return undefined;

    const returnName =
      formValue.tripType === 'REDONDO'
        ? this.cityName(formValue.returnDestinationId)
        : '';
    const isRoundTrip = !!returnName;

    const request: any = {
      origin: `${originName}, Colombia`,
      destination: `${isRoundTrip ? returnName : destinationName}, Colombia`,
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
      fields: ['distanceMeters'],
    };
    if (isRoundTrip) {
      request.intermediates = [`${destinationName}, Colombia`];
    }

    try {
      const route = await Promise.race([
        computeRoute(request),
        new Promise((resolve) =>
          setTimeout(() => resolve(null), this.ROUTE_TIMEOUT_MS),
        ),
      ]);
      const km = routeDistanceKm(route);
      return km ? Number(km.toFixed(1)) : undefined;
    } catch (error) {
      console.error('No se pudo calcular la distancia del viaje:', error);
      return undefined;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.tripForm.valid) {
      const { ownerId, balance, ...formData } = this.tripForm.getRawValue();
      const tripData: ModelTrip = {
        ...formData,
        numberOfDays: 0,
        paidBalance: this.trip?.paidBalance ?? false,
        id: this.trip ? this.trip.id : null,
      };

      if (
        tripData.startDate &&
        typeof tripData.startDate === 'string' &&
        tripData.startDate.length === 10
      ) {
        if (
          this.trip?.startDate &&
          typeof this.trip.startDate === 'string' &&
          this.trip.startDate.startsWith(tripData.startDate)
        ) {
          tripData.startDate = this.trip.startDate;
        } else {
          tripData.startDate = `${tripData.startDate}T${new Date().toISOString().split('T')[1]}`;
        }
      }

      if (['Completado', 'Cancelado', 'Pendiente'].includes(tripData.status)) {
        tripData.endDate = new Date().toISOString();
        if (tripData.startDate && tripData.endDate) {
          const start = new Date(tripData.startDate);
          const end = new Date(tripData.endDate);
          const diffTime = Math.abs(end.getTime() - start.getTime());
          tripData.numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }

      this.isSaving = true;

      const distanceKm = await this.resolveDistanceKm(
        this.tripForm.getRawValue(),
      );
      if (distanceKm !== undefined) {
        tripData.distanceKm = distanceKm;
      }

      this.tripService.createTrip(tripData).subscribe({
        next: () => {
          // Guardar cambia la disponibilidad: la cache deja de ser valida.
          this.vehiclesByOwnerCache.clear();
          this.toastService.showSuccess(
            'Gestión de Viajes',
            `Viaje ${this.trip ? 'actualizado' : 'creado'} exitosamente!`,
          );
          this.notificationsService.refreshNotifications();
          this.saved.emit(tripData);
          this.isSaving = false;
        },
        error: (error) => {
          console.error('Error saving trip:', error);
          this.toastService.showError('Error', 'Error al guardar el viaje');
          this.isSaving = false;
        },
      });
    }
  }

  formatCurrencyInput(controlName: string, event: any): void {
    // El viaje vacío no maneja montos: los campos están ocultos
    if (this.isEmptyTrip) return;

    const MAX = 999_999_999;
    const input = event.target as HTMLInputElement;
    const value = input.value;
    const stringValue = String(value).replaceAll(/\D/g, '');
    // Campo vacío -> null, para que `required` se dispare. Con 0 el validador
    // lo daba por diligenciado y el mensaje nunca aparecía.
    const numericValue = stringValue ? Number.parseInt(stringValue, 10) : null;

    if (numericValue !== null && numericValue > MAX) {
      const current = this.tripForm.get(controlName)?.value ?? 0;
      input.value = new Intl.NumberFormat('de-DE').format(current);
      return;
    }
    this.tripForm.get(controlName)?.setValue(numericValue, { emitEvent: true });
    this.tripForm.get(controlName)?.markAsDirty();
    this.tripForm.get(controlName)?.markAsTouched();
  }

  getFormattedValue(controlName: string): string {
    const value = this.tripForm.get(controlName)?.value;
    if (value === null || value === undefined) return '';
    return new Intl.NumberFormat('de-DE').format(value);
  }

  onCancel(): void {
    this.cancel.emit();
  }

  allowOnlyNumbers(event: any): void {
    const pattern = /\d/;
    const inputChar = String.fromCodePoint(event.charCode);

    if (!pattern.test(inputChar)) {
      event.preventDefault();
    }
  }

  get canSave(): boolean {
    return this.tripForm.valid && this.isModified;
  }

  private captureInitialState(): void {
    this.initialFormValue = JSON.stringify(
      CustomValidators.getNormalizedFormValue(this.tripForm.getRawValue()),
    );
  }

  get isModified(): boolean {
    return (
      JSON.stringify(
        CustomValidators.getNormalizedFormValue(this.tripForm.getRawValue()),
      ) !== this.initialFormValue
    );
  }
}
