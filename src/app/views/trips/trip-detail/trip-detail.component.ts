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

  // State tracking for logistics
  originalStatus: string = '';
  originalPaidBalance: boolean = false;

  // UI State
  isOffcanvasOpen: boolean = false;
  isTripInfoOpen: boolean = false;
  estimatedArrivalTime: string = '--:--';

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;

  // Expenses
  totalExpenses: number = 0;

  // Location
  lastLocation: ModelDriverLocation | null = null;
  mapInstance: any = null;
  mapMarker: any = null;

  private routeSub?: Subscription;
  private readonly userSub?: Subscription;

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
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.tripId = Number(id);
        this.loadCities();
        this.loadVehicleBrands();
        // Wait for user data to be available before validating access
        this.securityService.userData$.subscribe({
          next: (user) => {
            if (user && this.tripId) {
              this.userRole = (
                user.userRoles?.[0]?.role?.name || ''
              ).toUpperCase();
              if (this.userRole === 'PROPIETARIO') {
                this.loggedInOwnerId = user.id ?? null;
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
            if (this.trip.id && this.trip.vehicleId) {
              this.loadExpenses(this.trip.id, this.trip.vehicleId);
              if (
                this.userRole === 'PROPIETARIO' ||
                this.userRole === 'ADMINISTRADOR'
              ) {
                this.loadVehicleLocation(this.trip.vehicleId);
              } else {
                this.calculateETA();
              }
            }
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

                const vehicleFilter = new ModelFilterTable(
                  [
                    new Filter('ownerId', '=', ownerId.toString()),
                    new Filter('id', '=', vehicleId.toString()),
                  ],
                  new Pagination(1, 0),
                  new Sort('id', true),
                );

                return this.vehicleService
                  .getVehicleOwnerFilter(vehicleFilter)
                  .pipe(
                    map((vResp: any) => ({
                      hasAccess: vResp?.data?.content?.length > 0,
                    })),
                  );
              }),
            );
          } else if (roleName === 'CONDUCTOR') {
            const driverFilter = new ModelFilterTable(
              [new Filter('userId', '=', user.id.toString())],
              new Pagination(1, 0),
              new Sort('id', true),
            );

            return this.driverService.getDriverFilter(driverFilter).pipe(
              map((driverResp: any) => {
                const driver = driverResp?.data?.content?.[0];
                const hasAccess = driver && driver.vehicleId === vehicleId;
                return { hasAccess };
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
        if (result.hasAccess) {
          this.loadTrip(tripId);
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
        this.notificationsService.refreshNotifications();
      },
      error: (err: any) => {
        console.error('Error updating trip:', err);
        this.toastService.showError('Error', 'No se pudo actualizar el viaje');
        this.loading = false;
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

    if (globalThis.google === 'undefined' || !globalThis.google?.maps?.routes) {
      this.fallbackToDirectionsServiceProgress();
      return;
    }

    const currentLoc =
      this.lastLocation?.latitude && this.lastLocation?.longitude
        ? {
            location: {
              latLng: {
                latitude: this.lastLocation.latitude,
                longitude: this.lastLocation.longitude,
              },
            },
          }
        : null;

    if (!currentLoc) {
      this.calculatedProgressPercentage = 0;
      return; // No location reported = 0%
    }

    const routesApi = globalThis.google.maps.routes.Route;

    // We do two concurrent calls to get total distance, and distance left
    Promise.all([
      routesApi.computeRoutes({
        origin: { address: `${this.originName}, Colombia` },
        destination: { address: `${this.destinationName}, Colombia` },
        travelMode: 'DRIVING',
      }),
      routesApi.computeRoutes({
        origin: currentLoc,
        destination: { address: `${this.destinationName}, Colombia` },
        travelMode: 'DRIVING',
      }),
    ])
      .then(([totalResponse, remainingResponse]) => {
        const totalDistance = totalResponse.routes?.[0]?.distanceMeters || 1;
        const remainingDistance =
          remainingResponse.routes?.[0]?.distanceMeters || totalDistance;

        let progress =
          ((totalDistance - remainingDistance) / totalDistance) * 100;
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;

        this.calculatedProgressPercentage = Math.round(progress);
      })
      .catch((e) => {
        console.error('Error computing progress distance:', e);
        this.fallbackToDirectionsServiceProgress();
      });
  }

  private fallbackToDirectionsServiceProgress(): void {
    if (
      globalThis.google === 'undefined' ||
      !globalThis.google?.maps?.DirectionsService
    ) {
      return;
    }
    const currentLoc =
      this.lastLocation?.latitude && this.lastLocation?.longitude
        ? { lat: this.lastLocation.latitude, lng: this.lastLocation.longitude }
        : null;

    if (!currentLoc) {
      this.calculatedProgressPercentage = 0;
      return;
    }

    // Geometry logic as fallback
    const directionsService = new globalThis.google.maps.DirectionsService();

    // Call 1: Total Route
    directionsService.route(
      {
        origin: `${this.originName}, Colombia`,
        destination: `${this.destinationName}, Colombia`,
        travelMode: globalThis.google.maps.TravelMode.DRIVING,
      },
      (totalRes: any, totalStatus: any) => {
        if (totalStatus === 'OK' && totalRes.routes.length > 0) {
          const totalDist = totalRes.routes[0].legs[0].distance.value || 1;

          directionsService.route(
            {
              origin: currentLoc,
              destination: `${this.destinationName}, Colombia`,
              travelMode: globalThis.google.maps.TravelMode.DRIVING,
            },
            (remRes: any, remStatus: any) => {
              if (remStatus === 'OK' && remRes.routes.length > 0) {
                const remDist =
                  remRes.routes[0].legs[0].distance.value || totalDist;
                let progress = ((totalDist - remDist) / totalDist) * 100;
                if (progress < 0) progress = 0;
                if (progress > 100) progress = 100;
                this.calculatedProgressPercentage = Math.round(progress);
              }
            },
          );
        }
      },
    );
  }

  get tripDurationInHours(): number {
    if (!this.trip?.startDate || !this.trip?.endDate) return 0;
    const start = new Date(this.trip.startDate);
    const end = new Date(this.trip.endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  }

  get currentLocationName(): string {
    if (['Completado', 'Pendiente'].includes(this.trip?.status || '')) {
      return this.destinationName;
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
    const filterPayload = new ModelFilterTable(
      filters,
      new Pagination(1, 0),
      new Sort('creationDate', true), // Get the latest one
    );

    this.locationService.getLocationService(filterPayload).subscribe({
      next: (resp: any) => {
        if (resp?.data?.content && resp.data.content.length > 0) {
          this.lastLocation = resp.data.content[0];
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

        this.mapMarker = new globalThis.google.maps.Marker({
          position: position,
          map: this.mapInstance,
          title: this.lastLocation!.addressText || 'Ubicación del vehículo',
          animation: globalThis.google.maps.Animation.DROP,
        });

        if (this.lastLocation!.addressText) {
          const infoWindow = new globalThis.google.maps.InfoWindow({
            content: `<div style="padding:5px 0;margin:0;font-size:13px"><p class="mb-1 fw-bold">Última ubicación:</p><p class="mb-0 text-secondary">${this.lastLocation!.addressText}</p></div>`,
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
    this.router.navigate(['/site/trips']);
  }

  onExpensesClick(): void {
    if (this.tripId && this.trip?.vehicleId) {
      this.router.navigate(['/site/expenses'], {
        queryParams: {
          tripId: this.tripId,
          vehicleId: this.trip.vehicleId,
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

  onTripSaved(): void {
    this.toggleOffcanvas();
    if (this.tripId) {
      this.loadTrip(this.tripId);
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

    if (globalThis.google === 'undefined' || !globalThis.google?.maps?.routes) {
      this.fallbackToDirectionsServiceETA();
      return;
    }

    const originQuery =
      this.lastLocation?.latitude && this.lastLocation?.longitude
        ? {
            location: {
              latLng: {
                latitude: this.lastLocation.latitude,
                longitude: this.lastLocation.longitude,
              },
            },
          }
        : { address: `${this.originName}, Colombia` };

    globalThis.google.maps.routes.Route.computeRoutes({
      origin: originQuery,
      destination: { address: `${this.destinationName}, Colombia` },
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
    })
      .then((response: any) => {
        if (response.routes && response.routes.length > 0) {
          const route = response.routes[0];
          let duration = '';
          if (route.staticDuration) {
            const sDurationSec = Number.parseInt(
              route.staticDuration.replace('s', ''),
              10,
            );
            duration = this.formatDuration(sDurationSec);
          } else if (route.duration) {
            const durationSec = Number.parseInt(
              route.duration.replace('s', ''),
              10,
            );
            duration = this.formatDuration(durationSec);
          }
          this.estimatedArrivalTime = duration || '--:--';
        }
      })
      .catch((error: any) => {
        console.error('Error in computeRoutes ETA:', error);
        this.fallbackToDirectionsServiceETA();
      });
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }

  private fallbackToDirectionsServiceETA(): void {
    if (
      globalThis.google === 'undefined' ||
      !globalThis.google?.maps?.DirectionsService
    ) {
      return;
    }

    const directionsService = new globalThis.google.maps.DirectionsService();
    const originQuery =
      this.lastLocation?.latitude && this.lastLocation?.longitude
        ? { lat: this.lastLocation.latitude, lng: this.lastLocation.longitude }
        : `${this.originName}, Colombia`;

    directionsService.route(
      {
        origin: originQuery,
        destination: `${this.destinationName}, Colombia`,
        travelMode: globalThis.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: 'bestguess',
        },
      },
      (response: any, status: any) => {
        if (status === 'OK' && response.routes && response.routes.length > 0) {
          const leg = response.routes[0].legs[0];
          this.estimatedArrivalTime =
            leg.duration_in_traffic?.text || leg.duration?.text || '--:--';
        }
      },
    );
  }
}
