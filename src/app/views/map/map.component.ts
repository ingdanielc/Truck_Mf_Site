import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SecurityService } from 'src/app/services/security/security.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { TripService } from 'src/app/services/trip.service';
import { LocationService } from 'src/app/services/location.service';
import { CommonService } from 'src/app/services/common.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelTrip } from 'src/app/models/trip-model';
import {
  ModelFilterTable,
  Filter,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { map, of, Subscription, switchMap } from 'rxjs';

declare const google: any;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './map.component.html',
  styleUrls: ['./map.component.scss'],
})
export class MapComponent implements OnInit, AfterViewInit, OnDestroy {
  map: any;
  activeVehicles: ModelVehicle[] = [];
  selectedVehicleId: number | null = null;
  userRole: string = '';
  loggedInUserId: number | null = null;
  isPanelCollapsed: boolean = false;
  fromParam: string | null = null;

  private markers: any[] = [];
  private polylines: any[] = [];
  private geocoder: any;
  private readonly directionsService = new google.maps.DirectionsService();
  private userSub?: Subscription;
  private readonly coordCache: Map<string, any> = new Map();

  constructor(
    private readonly securityService: SecurityService,
    private readonly vehicleService: VehicleService,
    private readonly tripService: TripService,
    private readonly locationService: LocationService,
    private readonly commonService: CommonService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly route: ActivatedRoute,
    private readonly location: Location,
  ) {}

  ngOnInit(): void {
    this.geocoder = new google.maps.Geocoder();

    this.route.queryParams.subscribe((params) => {
      if (params['vehicleId']) {
        this.selectedVehicleId = Number(params['vehicleId']);
      }
      this.fromParam = params['from'] || null;
    });

    this.userSub = this.securityService.userData$.subscribe((user: any) => {
      if (user) {
        this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
        const userId = user.id;

        if (this.userRole === 'PROPIETARIO') {
          this.resolveOwnerIdAndLoad(userId);
        } else if (this.userRole === 'CONDUCTOR') {
          this.resolveDriverIdAndLoad(userId);
        } else {
          // Admin or others (resolve as is)
          this.loggedInUserId = userId;
          if (this.map) this.loadActiveData();
        }
      }
    });
  }

  private resolveOwnerIdAndLoad(userId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe((res) => {
      this.loggedInUserId = res?.data?.content?.[0]?.id || null;
      if (this.map) this.loadActiveData();
    });
  }

  private resolveDriverIdAndLoad(userId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe((res) => {
      this.loggedInUserId = res?.data?.content?.[0]?.id || null;
      if (this.map) this.loadActiveData();
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
    if (this.userRole) {
      this.loadActiveData();
    }
  }

  ngOnDestroy(): void {
    this.clearMap();
    this.userSub?.unsubscribe();
  }

  private initMap(): void {
    const defaultCenter = { lat: 4.5709, lng: -74.2973 }; // Colombia center
    this.map = new google.maps.Map(document.getElementById('google-map'), {
      zoom: 6,
      center: defaultCenter,
      mapId: 'light_map', // Optional: if they have a map ID, otherwise it defaults to standard
    });
  }

  private citiesList: any[] = [];

  private loadActiveData(): void {
    // 1. Load cities first
    this.commonService
      .getCities()
      .pipe(
        switchMap((citiesResp: any) => {
          this.citiesList = citiesResp?.data || [];

          // 2. Consult vehicles for the owner (or all if admin)
          let vehiclesFilter: Filter[] = [];

          const roleUpper = this.userRole.toUpperCase();
          if (roleUpper === 'PROPIETARIO' && this.loggedInUserId) {
            vehiclesFilter.push(
              new Filter('owner.id', '=', this.loggedInUserId.toString()),
            );
          } else if (roleUpper === 'CONDUCTOR' && this.loggedInUserId) {
            // For conductor, we filter trips directly by driver.id later,
            // but we still need the vehicle he's associated with.
            // In trips view, conductor sees only his assigned vehicle trips.
            vehiclesFilter.push(
              new Filter(
                'currentDriverId',
                '=',
                this.loggedInUserId.toString(),
              ),
            );
          }

          const vehicleFilterTable = new ModelFilterTable(
            vehiclesFilter,
            new Pagination(1000, 0),
            new Sort('id', true),
          );

          if (roleUpper === 'PROPIETARIO') {
            return this.vehicleService.getVehicleOwnerFilter(
              vehicleFilterTable,
            );
          } else {
            return this.vehicleService.getVehicleFilter(vehicleFilterTable);
          }
        }),
        switchMap((vehiclesResp: any) => {
          const vehicles: ModelVehicle[] = vehiclesResp?.data?.content || [];

          if (vehicles.length === 0) {
            this.activeVehicles = [];
            return of({ vehicles: [], trips: [] });
          }

          // 3. Extract IDs and filter trips
          const roleUpper = this.userRole.toUpperCase();
          let tripFilters: Filter[] = [new Filter('status', '=', 'En Curso')];

          if (roleUpper === 'CONDUCTOR' && this.loggedInUserId) {
            tripFilters.push(
              new Filter('driver.id', '=', this.loggedInUserId.toString()),
            );
          } else {
            // Admin/Owner: filter by the loaded vehicles
            const vehicleIds = vehicles
              .map((v) => v.id)
              .filter((id) => !!id)
              .join(',');
            if (vehicleIds) {
              tripFilters.push(new Filter('vehicle.id', 'in', vehicleIds));
            } else {
              // No vehicles found for this owner/admin context
              this.activeVehicles = [];
              return of({ vehicles: [], trips: [] });
            }
          }

          const tripFilterTable = new ModelFilterTable(
            tripFilters,
            new Pagination(100, 0),
            new Sort('startDate', false),
          );

          return this.tripService.getTripFilter(tripFilterTable).pipe(
            map((tripsResp) => ({
              vehicles,
              trips: tripsResp?.data?.content || [],
            })),
          );
        }),
      )
      .subscribe({
        next: (result: any) => {
          const vehicles: ModelVehicle[] = result.vehicles || [];
          const trips: ModelTrip[] = result.trips || [];

          // Match trips to vehicles and filter active ones
          this.activeVehicles = vehicles.filter((v) => {
            const trip = trips.find((t) => t.vehicleId === v.id);
            if (trip) {
              v.lastTripStatus = 'En Curso';
              v.lastTripId = trip.id;
              // Force plate to uppercase
              if (v.plate) v.plate = v.plate.toUpperCase();
              (v as any).currentTrip = trip;
              return true;
            }
            return false;
          });

          if (this.selectedVehicleId) {
            const vehicleToFocus = this.activeVehicles.find(
              (v) => v.id === this.selectedVehicleId,
            );
            if (vehicleToFocus) {
              this.selectedVehicleId = null; // Clear to avoid toggle-off in focusVehicle
              this.focusVehicle(vehicleToFocus);
            } else {
              this.renderAllVehiclesOnMap();
            }
          } else {
            this.renderAllVehiclesOnMap();
          }
        },
        error: (err) => console.error('Map: Error loading data:', err),
      });
  }

  goBack(): void {
    this.location.back();
  }

  private renderAllVehiclesOnMap(): void {
    this.clearMap();
    if (this.activeVehicles.length === 0) return;

    this.activeVehicles.forEach((vehicle) => {
      const trip = (vehicle as any).currentTrip;
      if (trip) {
        // Draw initial route without driver location for performance
        this.drawVehicleRoute(vehicle, trip, null);
      }
    });

    // Note: Auto-zoom for multiple vehicles is handled partially within drawVehicleRoute
    // for the first vehicle, or can be added as a separate logic if needed.
  }

  private drawVehicleRoute(
    vehicle: ModelVehicle,
    trip: ModelTrip,
    lastLocation: any,
  ): void {
    const vehicleColor = this.getVehicleColor(vehicle);

    // Resolve city names
    const originCity = this.citiesList.find(
      (c) => String(c.id) === String(trip.originId),
    );
    const destCity = this.citiesList.find(
      (c) => String(c.id) === String(trip.destinationId),
    );

    const originName = originCity
      ? `${originCity.name}, ${originCity.state}, Colombia`
      : 'Colombia';
    const destName = destCity
      ? `${destCity.name}, ${destCity.state}, Colombia`
      : 'Colombia';

    const request = {
      origin: originName,
      destination: destName,
      travelMode: google.maps.TravelMode.DRIVING,
    };

    this.directionsService.route(request, (result: any, status: any) => {
      if (status === 'OK' && result.routes.length > 0) {
        const route = result.routes[0];
        const pathPoints = route.overview_path;

        // Origin and Destination markers (extracting directly from directions result for precision)
        const originPos = route.legs[0].start_location;
        const destPos = route.legs[0].end_location;

        this.addMarker(
          originPos,
          'O',
          `Origen: ${originCity?.name || trip.originId}`,
          '#28a745',
        );
        this.addMarker(
          destPos,
          'D',
          `Destino: ${destCity?.name || trip.destinationId}`,
          '#dc3545',
        );

        // Path Polyline
        const polyline = new google.maps.Polyline({
          path: pathPoints,
          geodesic: true,
          strokeColor: vehicleColor,
          strokeOpacity: 0.8,
          strokeWeight: 5,
          map: this.map,
        });
        this.polylines.push(polyline);

        // Current Location marker (if available)
        if (lastLocation?.latitude && lastLocation.longitude) {
          const currentPos = {
            lat: Number(lastLocation.latitude),
            lng: Number(lastLocation.longitude),
          };
          this.addMarker(
            currentPos,
            vehicle.plate.toUpperCase(),
            'Ubicación Actual',
            vehicleColor,
          );
        }

        // Adjust map bounds
        if (
          this.activeVehicles.length === 1 ||
          this.selectedVehicleId === vehicle.id
        ) {
          const bounds = new google.maps.LatLngBounds();
          pathPoints.forEach((p: any) => bounds.extend(p));
          this.map.fitBounds(bounds);
        }
      } else {
        console.warn(
          `Directions request failed for ${vehicle.plate}: ${status}`,
        );
        // Fallback to straight line if directions fail
        Promise.all([
          this.getCoordinates(originName),
          this.getCoordinates(destName),
        ]).then(([originPos, destPos]) => {
          this.addMarker(originPos, 'O', `Origen`, '#28a745');
          this.addMarker(destPos, 'D', `Destino`, '#dc3545');
          const polyline = new google.maps.Polyline({
            path: [originPos, destPos],
            strokeColor: vehicleColor,
            strokeWeight: 4,
            map: this.map,
          });
          this.polylines.push(polyline);
        });
      }
    });
  }

  private getCoordinates(address: string): Promise<any> {
    if (this.coordCache.has(address)) {
      return Promise.resolve(this.coordCache.get(address));
    }

    return new Promise((resolve) => {
      this.geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          const coords = { lat: loc.lat(), lng: loc.lng() };
          this.coordCache.set(address, coords);
          resolve(coords);
        } else {
          console.warn(`Geocoding failed for ${address}: ${status}`);
          resolve({ lat: 4.5709, lng: -74.2973 }); // Fallback to Colombia center
        }
      });
    });
  }

  private addMarker(
    position: any,
    label: string,
    title: string,
    color: string,
  ): void {
    const marker = new google.maps.Marker({
      position,
      map: this.map,
      title,
      label: {
        text: label,
        color: 'white',
        fontWeight: 'bold',
        fontSize: '12px',
      },
      icon: {
        path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: color,
        fillOpacity: 1,
        strokeWeight: 2,
        strokeColor: '#FFFFFF',
        scale: 8,
      },
    });
    this.markers.push(marker);
  }

  showAll(): void {
    this.selectedVehicleId = null;
    this.renderAllVehiclesOnMap();
  }

  getVehicleColor(vehicle: ModelVehicle): string {
    // Generate a consistent color based on plate
    let hash = 0;
    for (let i = 0; i < vehicle.plate.length; i++) {
      hash = vehicle.plate.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00ffffff).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
  }

  focusVehicle(vehicle: ModelVehicle): void {
    if (this.selectedVehicleId === vehicle.id) {
      // Toggle off: Show all vehicles again
      this.selectedVehicleId = null;
      this.renderAllVehiclesOnMap();
      return;
    }

    this.selectedVehicleId = vehicle.id || null;
    const trip = (vehicle as any).currentTrip;
    if (!trip) return;

    // Clear and draw ONLY for this vehicle
    this.clearMap();

    // 1. Fetch current location only on click
    const filter = new ModelFilterTable(
      [new Filter('vehicleId', '=', vehicle.id!.toString())],
      new Pagination(1, 0),
      new Sort('creationDate', false),
    );

    this.locationService.getLocationService(filter).subscribe((res) => {
      const loc = res?.data?.content?.[0];

      // 2. Draw only this vehicle route with location
      this.drawVehicleRoute(vehicle, trip, loc);

      // 3. Pan to location if available, otherwise origin
      if (loc) {
        this.map.panTo({
          lat: Number(loc.latitude),
          lng: Number(loc.longitude),
        });
        this.map.setZoom(12);
      }
    });
  }

  private clearMap(): void {
    this.markers.forEach((m) => m.setMap(null));
    this.polylines.forEach((p) => p.setMap(null));
    this.markers = [];
    this.polylines = [];
  }

  togglePanel(): void {
    this.isPanelCollapsed = !this.isPanelCollapsed;
  }
}
