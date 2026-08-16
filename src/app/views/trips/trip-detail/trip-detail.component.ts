import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, of, map, switchMap, catchError } from 'rxjs';
import { TripService } from 'src/app/services/trip.service';
import { CommonService } from 'src/app/services/common.service';
import { ModelTrip } from 'src/app/models/trip-model';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { GTripFormComponent } from '../../../components/g-trip-form/g-trip-form.component';
import { GTripInfoCardComponent } from '../../../components/g-trip-info-card/g-trip-info-card.component';
import { NotificationsService } from 'src/app/services/notifications.service';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';
import { LocationService } from 'src/app/services/location.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ModelDriverLocation } from 'src/app/models/location-model';
import {
  computeRoute,
  routeDurationSeconds,
} from 'src/app/utils/google-routes';

declare var globalThis: any;

@Component({
  selector: 'app-trip-detail',
  standalone: true,
  imports: [CommonModule, GTripFormComponent, GTripInfoCardComponent],
  templateUrl: './trip-detail.component.html',
  styleUrls: ['./trip-detail.component.scss'],
})
export class TripDetailComponent implements OnInit, OnDestroy {
  tripId: number | null = null;
  trip: ModelTrip | null = null;
  cities: any[] = [];
  vehicleBrands: any[] = [];
  loading: boolean = true;
  readonly CARGO_DURATION_FACTOR = 1.35;

  // State tracking for logistics
  originalStatus: string = '';
  originalPaidBalance: boolean = false;
  arrivalDate: string = '';
  originalArrivalDate: string = '';

  // UI State
  isOffcanvasOpen: boolean = false;
  isTripInfoOpen: boolean = false;
  showConfirmModal: boolean = false;
  isSavingLogistics: boolean = false;
  estimatedArrivalTime: string = '--:--';
  /** Solo en viajes redondos: tiempo hasta el destino de regreso */
  estimatedReturnArrivalTime: string = '--:--';
  currentTime: Date = new Date();
  private durationInterval: any = null;

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  originView: string | null = null;

  // Expenses
  totalExpenses: number = 0;

  // Location
  lastLocation: ModelDriverLocation | null = null;
  routeLocations: ModelDriverLocation[] = [];
  mapInstance: any = null;
  mapMarker: any = null;
  routePolyline: any = null;

  private routeSub?: Subscription;
  private userSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly expenseService: ExpenseService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly notificationsService: NotificationsService,
    private readonly locationService: LocationService,
  ) {}

  ngOnInit(): void {
    this.startDurationTimer();
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.tripId = Number(id);
        this.originView = this.route.snapshot.queryParamMap.get('from');
        this.loadCities();
        this.loadVehicleBrands();
        // Wait for user data to be available before validating access
        this.userSub?.unsubscribe();
        this.userSub = this.securityService.userData$.subscribe({
          next: (user) => {
            if (user && this.tripId) {
              this.userRole = (
                user.userRoles?.[0]?.role?.name || ''
              ).toUpperCase();
              if (this.userRole === 'PROPIETARIO') {
                // We will set loggedInOwnerId inside validateAccess after fetching the actual ID
              }
              this.validateAccess(this.tripId, user);
            }
          },
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.userSub?.unsubscribe();
    this.stopDurationTimer();
  }

  private startDurationTimer(): void {
    this.stopDurationTimer();
    this.durationInterval = setInterval(() => {
      this.currentTime = new Date();
    }, 10000);
  }

  private stopDurationTimer(): void {
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
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
          this.processTripData(response.data.content[0]);
        } else {
          this.toastService.showError('Error', 'No se encontró el viaje');
          this.goBack();
          this.loading = false;
        }
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

  processTripData(tripData: any): void {
    this.trip = tripData;
    if (this.trip) {
      this.originalStatus = this.trip.status;
      this.originalPaidBalance = this.trip.paidBalance ?? false;

      if (this.trip.endDate) {
        const dateObj = new Date(this.trip.endDate);
        if (!Number.isNaN(dateObj.getTime())) {
          this.arrivalDate = this.formatDateToYYYYMMDD(dateObj);
        } else {
          this.arrivalDate = this.maxArrivalDate;
        }
      } else {
        this.arrivalDate = this.maxArrivalDate;
      }
      this.originalArrivalDate = this.arrivalDate;
      if (this.trip.id && this.trip.vehicleId) {
        this.loadExpenses(this.trip.id, this.trip.vehicleId);
        if (
          this.userRole === 'PROPIETARIO' ||
          this.userRole === 'ADMINISTRADOR' ||
          this.userRole === 'CONDUCTOR'
        ) {
          this.loadVehicleLocation(this.trip.vehicleId);
        } else {
          this.calculateETA();
        }
      }
    }
    this.loading = false;
  }

  validateAccess(tripId: number, user: any): void {
    const roleName = (user.userRoles?.[0]?.role?.name || '').toUpperCase();

    if (roleName === 'ADMINISTRADOR') {
      this.loadTrip(tripId);
      return;
    }

    // Load trip first to get vehicleId
    const tripFilter = new ModelFilterTable(
      [new Filter('id', '=', tripId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.tripService
      .getTripFilter(tripFilter)
      .pipe(
        switchMap((tripResp: any) => {
          if (!tripResp?.data?.content || tripResp.data.content.length === 0) {
            return of({ hasAccess: false, error: 'No se encontró el viaje' });
          }

          const tripData = tripResp.data.content[0];
          const vehicleId = tripData.vehicleId;

          if (roleName === 'PROPIETARIO') {
            const ownerFilter = new ModelFilterTable(
              [new Filter('user.id', '=', user.id.toString())],
              new Pagination(1, 0),
              new Sort('id', true),
            );

            return this.ownerService.getOwnerFilter(ownerFilter).pipe(
              switchMap((ownerResp: any) => {
                const ownerId = ownerResp?.data?.content?.[0]?.id;
                if (!ownerId) return of({ hasAccess: false });
                this.loggedInOwnerId = ownerId; // Correctly store the fetched ownerId

                const vehicleFilter = new ModelFilterTable(
                  [
                    new Filter('ownerId', '=', ownerId.toString()),
                    new Filter('vehicleId', '=', vehicleId.toString()),
                  ],
                  new Pagination(1, 0),
                  new Sort('id', true),
                );

                return this.vehicleService
                  .getVehicleOwnerFilter(vehicleFilter)
                  .pipe(
                    map((vResp: any) => ({
                      hasAccess: vResp?.data?.content?.length > 0,
                      tripData,
                    })),
                  );
              }),
            );
          } else if (roleName === 'CONDUCTOR') {
            const driverFilter = new ModelFilterTable(
              [new Filter('user.id', '=', user.id.toString())],
              new Pagination(1, 0),
              new Sort('id', true),
            );

            return this.driverService.getDriverFilter(driverFilter).pipe(
              map((driverResp: any) => {
                const driver = driverResp?.data?.content?.[0];
                const hasAccess =
                  driver &&
                  (Number(driver.id) === Number(tripData.driverId) ||
                    Number(driver.id) === Number(tripData.driver?.id) ||
                    driver.vehicleId === vehicleId);
                return { hasAccess, tripData };
              }),
            );
          }

          return of({ hasAccess: false });
        }),
        catchError((err) => {
          console.error('Error validating access:', err);
          return of({ hasAccess: false, error: 'Error de validación' });
        }),
      )
      .subscribe((result: any) => {
        if (result.hasAccess && result.tripData) {
          this.processTripData(result.tripData);
        } else {
          this.toastService.showError(
            'Acceso Denegado',
            result.error || 'No tiene permiso para ver este viaje',
          );
          this.goBack();
        }
      });
  }

  get originName(): string {
    if (!this.trip?.originId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.originId),
    );
    if (!city) return String(this.trip.originId);
    return city.name.split('-')[0].split(',')[0].trim();
  }

  get originFullName(): string {
    if (!this.trip?.originId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.originId),
    );
    if (!city) return String(this.trip.originId);
    return this.formatCityName(city);
  }

  get destinationName(): string {
    if (!this.trip?.destinationId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.destinationId),
    );
    if (!city) return String(this.trip.destinationId);
    return city.name.split('-')[0].split(',')[0].trim();
  }

  /** Vacío salvo en viajes redondos: alimenta la ruta de tres puntos del trayecto */
  get returnDestinationName(): string {
    if (this.trip?.tripType !== 'REDONDO' || !this.trip?.returnDestinationId) {
      return '';
    }
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.returnDestinationId),
    );
    if (!city) return String(this.trip.returnDestinationId);
    return city.name.split('-')[0].split(',')[0].trim();
  }

  /** Un viaje redondo se distingue por tener destino de regreso */
  get isRoundTrip(): boolean {
    return !!this.returnDestinationName;
  }

  get returnDestinationFullName(): string {
    if (this.trip?.tripType !== 'REDONDO' || !this.trip?.returnDestinationId) {
      return '';
    }
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.returnDestinationId),
    );
    if (!city) return String(this.trip.returnDestinationId);
    return this.formatCityName(city);
  }

  /** Última parada del recorrido: el destino de regreso en los redondos */
  get finalStopName(): string {
    return this.isRoundTrip ? this.returnDestinationName : this.destinationName;
  }

  get finalStopFullName(): string {
    return this.isRoundTrip
      ? this.returnDestinationFullName
      : this.destinationFullName;
  }

  get finalStopEta(): string {
    return this.isRoundTrip
      ? this.estimatedReturnArrivalTime
      : this.estimatedArrivalTime;
  }

  get destinationFullName(): string {
    if (!this.trip?.destinationId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip?.destinationId),
    );
    if (!city) return String(this.trip.destinationId);
    return this.formatCityName(city);
  }

  private formatCityName(cityObj: any): string {
    if (!cityObj?.name) return '';
    let name = cityObj.name.trim();

    if (name.includes('-')) {
      name = name.split('-')[0].trim();
    } else if (name.includes(',')) {
      name = name.split(',')[0].trim();
    }

    if (cityObj.state) {
      return `${name} (${cityObj.state.trim()})`;
    }
    return name;
  }

  get vehicleBrandName(): string {
    const brandId = this.trip?.vehicle?.vehicleBrandId;
    if (!brandId) return '';

    const brand = this.vehicleBrands.find(
      (b) => Number(b.id) === Number(brandId),
    );
    return brand ? brand.name : '';
  }

  get maxArrivalDate(): string {
    return this.formatDateToYYYYMMDD(new Date());
  }

  formatDateToYYYYMMDD(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onArrivalDateChange(val: string): void {
    if (!val) return;
    if (val > this.maxArrivalDate) {
      val = this.maxArrivalDate;
      this.toastService.showError(
        'Fecha no permitida',
        'No se permiten fechas futuras para la fecha de llegada.',
      );
    }
    this.arrivalDate = val;
    if (this.trip) {
      if (val === this.maxArrivalDate) {
        this.trip.endDate = new Date().toISOString();
      } else {
        this.trip.endDate = new Date(val + 'T12:00:00').toISOString();
      }
    }
  }

  get hasLogisticsChanges(): boolean {
    if (!this.trip) return false;
    const isCompletedOrPending = ['Completado', 'Pendiente'].includes(
      this.trip.status,
    );
    const dateChanged =
      isCompletedOrPending && this.arrivalDate !== this.originalArrivalDate;

    return (
      this.trip.status !== this.originalStatus ||
      this.trip.paidBalance !== this.originalPaidBalance ||
      dateChanged
    );
  }

  get totalIncome(): number {
    if (!this.trip) return 0;
    if (this.trip.paidBalance) {
      return this.trip.freight || 0;
    }
    return (this.trip.freight || 0) - (this.trip.balance || 0);
  }

  onStatusChange(newStatus: string): void {
    if (!this.trip) return;
    this.trip.status = newStatus;

    if (newStatus === 'Completado') {
      this.trip.paidBalance = true;
    } else if (newStatus === 'Pendiente') {
      this.trip.paidBalance = false;
    }

    if (['Completado', 'Pendiente'].includes(newStatus)) {
      if (!this.arrivalDate) {
        this.arrivalDate = this.maxArrivalDate;
      }
      if (this.arrivalDate === this.maxArrivalDate) {
        this.trip.endDate = new Date().toISOString();
      } else {
        this.trip.endDate = new Date(
          this.arrivalDate + 'T12:00:00',
        ).toISOString();
      }
    }
  }

  updateLogistics(): void {
    if (!this.trip) return;

    // If status is being changed to "Completado", show confirmation
    if (
      this.trip.status === 'Completado' &&
      this.originalStatus !== 'Completado'
    ) {
      this.showConfirmModal = true;
      return;
    }

    this.saveLogistics();
  }

  confirmLogisticsUpdate(): void {
    this.showConfirmModal = false;
    this.saveLogistics();
  }

  cancelLogisticsUpdate(): void {
    this.showConfirmModal = false;
    if (this.trip) {
      this.trip.status = this.originalStatus;
      this.arrivalDate = this.originalArrivalDate;
    }
  }

  private saveLogistics(): void {
    if (!this.trip) return;

    if (['Completado', 'Cancelado', 'Pendiente'].includes(this.trip.status)) {
      if (
        ['Completado', 'Pendiente'].includes(this.trip.status) &&
        this.arrivalDate
      ) {
        this.trip.endDate = new Date(
          this.arrivalDate + 'T12:00:00',
        ).toISOString();
      } else if (!this.trip.endDate) {
        this.trip.endDate = new Date().toISOString();
      }

      if (this.trip.startDate && this.trip.endDate) {
        const start = new Date(this.trip.startDate);
        const end = new Date(this.trip.endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        this.trip.numberOfDays = Math.max(
          1,
          Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
        );
      }
    }

    this.isSavingLogistics = true;
    this.tripService.createTrip(this.trip).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Gestión de Viajes',
          'Viaje actualizado exitosamente!',
        );
        if (this.tripId) {
          this.loadTrip(this.tripId);
        }
        this.notificationsService.refreshNotifications();
        this.isSavingLogistics = false;
      },
      error: (err: any) => {
        console.error('Error updating trip:', err);
        this.toastService.showError('Error', 'No se pudo actualizar el viaje');
        this.isSavingLogistics = false;
      },
    });
  }

  calculatedProgressPercentage: number = 0;

  get progressPercentage(): number {
    if (!this.trip) return 0;
    if (['Completado', 'Pendiente'].includes(this.trip.status)) return 100;
    if (this.trip.status === 'Planeado') return 0;
    return this.calculatedProgressPercentage;
  }

  calculateLocationProgress(): void {
    if (
      !this.trip ||
      !this.originName ||
      this.originName === 'N/A' ||
      !this.destinationName ||
      this.destinationName === 'N/A'
    ) {
      this.calculatedProgressPercentage = 0;
      return;
    }

    const currentLoc =
      this.lastLocation?.latitude && this.lastLocation?.longitude
        ? {
            lat: Number(this.lastLocation.latitude),
            lng: Number(this.lastLocation.longitude),
          }
        : null;

    if (!currentLoc) {
      this.calculatedProgressPercentage = 0;
      return; // No location reported = 0%
    }

    const destination = `${this.destinationName}, Colombia`;

    // We do two concurrent calls to get total distance, and distance left
    Promise.all([
      computeRoute({
        origin: `${this.originName}, Colombia`,
        destination: destination,
        travelMode: 'DRIVING',
        fields: ['distanceMeters'],
      }),
      computeRoute({
        origin: currentLoc,
        destination: destination,
        travelMode: 'DRIVING',
        fields: ['distanceMeters'],
      }),
    ])
      .then(([totalRoute, remainingRoute]) => {
        const totalDistance = totalRoute?.distanceMeters || 1;
        const remainingDistance =
          remainingRoute?.distanceMeters || totalDistance;

        let progress =
          ((totalDistance - remainingDistance) / totalDistance) * 100;
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;

        this.calculatedProgressPercentage = Math.round(progress);
      })
      .catch((e) => {
        console.error('Error computing progress distance:', e);
      });
  }

  get tripDurationInHours(): number {
    if (!this.trip?.startDate) return 0;
    const start = new Date(this.trip.startDate);
    let end: Date;
    if (
      ['Completado', 'Pendiente'].includes(this.trip?.status || '') &&
      this.arrivalDate
    ) {
      if (this.trip?.endDate && this.arrivalDate === this.maxArrivalDate) {
        end = new Date(this.trip.endDate);
      } else if (this.arrivalDate === this.maxArrivalDate) {
        end = this.currentTime || new Date();
      } else {
        end = new Date(this.arrivalDate + 'T12:00:00');
      }
    } else if (this.trip?.endDate) {
      end = new Date(this.trip.endDate);
    } else {
      end = this.currentTime || new Date();
    }
    const diffMs = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  }

  get currentLocationName(): string {
    if (['Completado', 'Pendiente'].includes(this.trip?.status || '')) {
      return this.destinationName;
    }
    if (this.lastLocation?.addressText) {
      return this.lastLocation.addressText;
    }
    return this.originName;
  }

  loadExpenses(tripId: number, vehicleId: number): void {
    const filters = [
      new Filter('vehicleId', '=', vehicleId.toString()),
      new Filter('tripId', '=', tripId.toString()),
    ];

    const filterPayload = new ModelFilterTable(
      filters,
      new Pagination(100, 0),
      new Sort('id', false),
    );

    this.expenseService.getExpenseFilter(filterPayload).subscribe({
      next: (resp: any) => {
        const expenses = resp?.data?.content || [];
        // Categorías 1 (Vehículo), 2 (Conductor), 3 (Viaje). Se exceptúa 4 (Mantenimiento).
        this.totalExpenses = expenses
          .filter((e: any) => {
            const typeId = e.category?.expenseTypeId;
            return typeId === 1 || typeId === 2 || typeId === 3;
          })
          .reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      },
      error: (err) => {
        console.error('Error loading expenses:', err);
      },
    });
  }

  loadVehicleLocation(vehicleId: number): void {
    const filters = [new Filter('vehicleId', '=', vehicleId.toString())];

    if (this.tripId) {
      filters.push(new Filter('tripId', '=', this.tripId.toString()));
    }

    if (!this.tripId && this.trip?.driverId) {
      filters.push(new Filter('driverId', '=', this.trip.driverId.toString()));
    }

    const filterPayload = new ModelFilterTable(
      filters,
      new Pagination(1, 0),
      new Sort('id', false),
    );

    this.locationService.getLocationService(filterPayload).subscribe({
      next: (resp: any) => {
        if (resp?.data?.content && resp.data.content.length > 0) {
          this.lastLocation = resp.data.content[0];
          this.loadVehicleRouteHistory(vehicleId);
        } else {
          this.initMap();
        }
        this.calculateETA();
        this.calculateLocationProgress();
      },
      error: (err) => {
        console.error('Error loading vehicle location', err);
        this.calculateETA();
        this.calculateLocationProgress();
      },
    });
  }

  private loadVehicleRouteHistory(vehicleId: number): void {
    const filters = [new Filter('vehicleId', '=', vehicleId.toString())];
    if (this.tripId) {
      filters.push(new Filter('tripId', '=', this.tripId.toString()));
    }
    if (!this.tripId && this.trip?.driverId) {
      filters.push(new Filter('driverId', '=', this.trip.driverId.toString()));
    }

    const filterPayload = new ModelFilterTable(
      filters,
      new Pagination(2000, 0),
      new Sort('id', false),
    );

    this.locationService.getLocationService(filterPayload).subscribe({
      next: (resp: any) => {
        if (resp?.data?.content && resp.data.content.length > 0) {
          this.routeLocations = resp.data.content;
        }
        this.initMap();
      },
      error: (err) => {
        console.error('Error loading vehicle route history', err);
        this.initMap();
      },
    });
  }

  /**
   * Ajusta el histórico de ubicaciones a las vías reales usando
   * `computeRoutes`. Si la API no responde, cae a la línea recta entre puntos.
   */
  private drawTraveledRoute(pathCoordinates: any[]): void {
    const maxIntermediates = 23;
    const origin = pathCoordinates[0];
    const destination = pathCoordinates.at(-1);

    const intermediateCoords = pathCoordinates.slice(1, -1);
    const intermediates: any[] = [];
    if (intermediateCoords.length > 0) {
      const step = Math.max(
        1,
        Math.floor(intermediateCoords.length / maxIntermediates),
      );
      for (
        let i = 0;
        i < intermediateCoords.length &&
        intermediates.length < maxIntermediates;
        i += step
      ) {
        // `via` es el equivalente al antiguo `stopover: false`
        intermediates.push({ location: intermediateCoords[i], via: true });
      }
    }

    computeRoute({
      origin: origin,
      destination: destination,
      intermediates: intermediates,
      travelMode: 'DRIVING',
      fields: ['path'],
    })
      .then((route: any) => {
        const polylines = route?.createPolylines?.() ?? [];
        if (polylines.length === 0) {
          this.drawSimplePolyline(pathCoordinates);
          return;
        }
        polylines.forEach((polyline: any) => {
          polyline.setOptions({
            strokeColor: '#0d6efd',
            strokeOpacity: 0.8,
            strokeWeight: 4,
          });
          polyline.setMap(this.mapInstance);
        });
        this.routePolyline = polylines[0];
        // El DirectionsRenderer anterior encuadraba solo; createPolylines no
        this.fitBoundsTo(pathCoordinates);
      })
      .catch(() => this.drawSimplePolyline(pathCoordinates));
  }

  private fitBoundsTo(coordinates: any[]): void {
    if (!this.mapInstance || coordinates.length === 0) return;
    const bounds = new globalThis.google.maps.LatLngBounds();
    coordinates.forEach((coord: any) => bounds.extend(coord));
    this.mapInstance.fitBounds(bounds);
  }

  private drawSimplePolyline(pathCoordinates: any[]): void {
    if (!this.mapInstance) return;
    this.routePolyline = new globalThis.google.maps.Polyline({
      path: pathCoordinates,
      geodesic: true,
      strokeColor: '#0d6efd',
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: this.mapInstance,
    });
    const bounds = new globalThis.google.maps.LatLngBounds();
    pathCoordinates.forEach((coord: any) => bounds.extend(coord));
    this.mapInstance.fitBounds(bounds);
  }

  initMap(): void {
    if (!this.lastLocation?.latitude || !this.lastLocation?.longitude) return;

    setTimeout(() => {
      const mapElement = document.getElementById('vehicleMap');
      if (
        mapElement &&
        globalThis.google !== 'undefined' &&
        globalThis.google?.maps?.Map
      ) {
        const position = {
          lat: this.lastLocation!.latitude,
          lng: this.lastLocation!.longitude,
        };

        this.mapInstance = new globalThis.google.maps.Map(mapElement, {
          center: position,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
        });

        // Draw the path
        if (this.routeLocations && this.routeLocations.length > 1) {
          const pathCoordinates = this.routeLocations
            .slice()
            .reverse()
            .map((loc) => ({
              lat: loc.latitude,
              lng: loc.longitude,
            }));

          this.drawTraveledRoute(pathCoordinates);
        }

        // Draw final location marker distinctively
        this.mapMarker = new globalThis.google.maps.Marker({
          position: position,
          map: this.mapInstance,
          title: this.lastLocation!.addressText || 'Ubicación del vehículo',
          animation: globalThis.google.maps.Animation.DROP,
        });

        if (this.lastLocation!.addressText) {
          const infoWindow = new globalThis.google.maps.InfoWindow({
            content: `<div style="padding:5px 0;margin:0;font-size:13px"><p class="mb-1 fw-bold text-danger">Ubicación Final / Actual:</p><p class="mb-0 text-secondary">${this.lastLocation!.addressText}</p></div>`,
          });
          this.mapMarker.addListener('click', () => {
            infoWindow.open(this.mapInstance, this.mapMarker);
          });
          // Also open by default
          infoWindow.open(this.mapInstance, this.mapMarker);
        }
      }
    }, 100);
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
    if (this.originView === 'vehicles') {
      this.router.navigate(['/site/vehicles']);
    } else if (this.originView === 'dashboard') {
      this.router.navigate(['/site/dashboard']);
    } else {
      this.router.navigate(['/site/trips']);
    }
  }

  onExpensesClick(): void {
    if (this.tripId && this.trip?.vehicleId) {
      this.router.navigate(['/site/expenses'], {
        queryParams: {
          tripId: this.tripId,
          vehicleId: this.trip.vehicleId,
          origin: 'detail',
        },
      });
    }
  }

  toggleOffcanvas(): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
  }

  editTrip(): void {
    this.toggleOffcanvas();
  }

  onTripSaved(savedTrip?: ModelTrip): void {
    this.toggleOffcanvas();
    if (this.tripId) {
      this.loadTrip(this.tripId);
    }
    if (this.originName !== 'N/A' && this.destinationName !== 'N/A') {
      this.isTripInfoOpen = true;
    }
  }

  openTripInfo(): void {
    if (
      this.originName &&
      this.originName !== 'N/A' &&
      this.destinationName &&
      this.destinationName !== 'N/A'
    ) {
      this.isTripInfoOpen = true;
    }
  }

  closeTripInfo(): void {
    this.isTripInfoOpen = false;
  }

  calculateETA(): void {
    if (!this.destinationName || this.destinationName === 'N/A') {
      return;
    }

    const originQuery =
      this.lastLocation?.latitude && this.lastLocation?.longitude
        ? {
            lat: Number(this.lastLocation.latitude),
            lng: Number(this.lastLocation.longitude),
          }
        : `${this.originName}, Colombia`;

    // Tiempo hasta el destino de ida (el destino a secas si no es redondo)
    computeRoute({
      origin: originQuery,
      destination: `${this.destinationName}, Colombia`,
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
      fields: ['durationMillis', 'staticDurationMillis'],
    })
      .then((route: any) => {
        this.estimatedArrivalTime = this.formatRouteEta(route);
      })
      .catch((error: any) => {
        console.error('Error in computeRoutes ETA:', error);
      });

    if (!this.isRoundTrip) {
      this.estimatedReturnArrivalTime = '--:--';
      return;
    }

    // Tiempo hasta el destino de regreso: cubre los dos tramos
    computeRoute({
      origin: originQuery,
      intermediates: [`${this.destinationName}, Colombia`],
      destination: `${this.returnDestinationName}, Colombia`,
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
      fields: ['durationMillis', 'staticDurationMillis'],
    })
      .then((route: any) => {
        this.estimatedReturnArrivalTime = this.formatRouteEta(route);
      })
      .catch((error: any) => {
        console.error('Error in computeRoutes ETA de regreso:', error);
      });
  }

  private formatRouteEta(route: any): string {
    const seconds = route
      ? routeDurationSeconds(route, { withTraffic: true })
      : 0;
    return seconds
      ? this.formatDuration(Math.floor(seconds * this.CARGO_DURATION_FACTOR))
      : '--:--';
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }
}
