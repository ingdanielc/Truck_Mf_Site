import { Component, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SecurityService } from 'src/app/services/security/security.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { TripService } from 'src/app/services/trip.service';
import { LocationService } from 'src/app/services/location.service';
import { CommonService } from 'src/app/services/common.service';
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

  private markers: any[] = [];
  private polylines: any[] = [];
  private geocoder: any;
  private userSub?: Subscription;

  constructor(
    private readonly securityService: SecurityService,
    private readonly vehicleService: VehicleService,
    private readonly tripService: TripService,
    private readonly locationService: LocationService,
    private readonly commonService: CommonService,
  ) {}

  ngOnInit(): void {
    this.geocoder = new google.maps.Geocoder();
    this.userSub = this.securityService.userData$.subscribe((user) => {
      if (user) {
        this.userRole = (user as any).role?.name || '';
        this.loggedInUserId = user.id || null;
        if (this.map) {
          this.loadActiveData();
        }
      }
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
      styles: [
        {
          featureType: 'all',
          elementType: 'labels.text.fill',
          stylers: [{ color: '#ffffff' }],
        },
        {
          featureType: 'water',
          elementType: 'geometry',
          stylers: [{ color: '#193341' }],
        },
        {
          featureType: 'landscape',
          elementType: 'geometry',
          stylers: [{ color: '#2c3e50' }],
        },
      ],
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
          if (roleUpper.includes('PROPIETARIO') && this.loggedInUserId) {
            // Based on VehiclesComponent, Propietario uses 'owner.id' with the user ID
            vehiclesFilter.push(
              new Filter('owner.id', '=', this.loggedInUserId.toString()),
            );
          } else if (roleUpper.includes('CONDUCTOR') && this.loggedInUserId) {
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

          return this.vehicleService.getVehicleOwnerFilter(vehicleFilterTable);
        }),
        switchMap((vehiclesResp: any) => {
          const vehicles: ModelVehicle[] = vehiclesResp?.data?.content || [];

          if (vehicles.length === 0) {
            this.activeVehicles = [];
            return of({ vehicles: [], trips: [] });
          }

          // 3. Extract IDs and filter trips
          const vehicleIds = vehicles
            .map((v) => v.id)
            .filter((id) => !!id)
            .join(',');

          let tripFilters: Filter[] = [
            new Filter('status', '=', 'En Curso'),
            new Filter('vehicle.id', 'in', vehicleIds),
          ];

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

          this.renderAllVehiclesOnMap();
        },
        error: (err) => console.error('Map: Error loading data:', err),
      });
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

    Promise.all([
      this.getCoordinates(originName),
      this.getCoordinates(destName),
    ]).then(([originPos, destPos]) => {
      // Markers
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

      const pathPoints = [originPos];

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
        pathPoints.push(currentPos);
      }

      pathPoints.push(destPos);

      const polyline = new google.maps.Polyline({
        path: pathPoints,
        geodesic: true,
        strokeColor: vehicleColor,
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map: this.map,
      });
      this.polylines.push(polyline);

      // Adjust map bounds if this is the only or first vehicle
      if (this.activeVehicles.length === 1) {
        const bounds = new google.maps.LatLngBounds();
        pathPoints.forEach((p) => bounds.extend(p));
        this.map.fitBounds(bounds);
      }
    });
  }

  private getCoordinates(address: string): Promise<any> {
    return new Promise((resolve) => {
      this.geocoder.geocode({ address }, (results: any, status: any) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location;
          resolve({ lat: loc.lat(), lng: loc.lng() });
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
    this.selectedVehicleId = vehicle.id || null;
    const trip = (vehicle as any).currentTrip;
    if (!trip) return;

    // Clear and redraw specifically for this vehicle to show current location
    this.clearMap();

    // 1. Fetch current location only on click
    const filter = new ModelFilterTable(
      [new Filter('vehicleId', '=', vehicle.id!.toString())],
      new Pagination(1, 0),
      new Sort('creationDate', false),
    );

    this.locationService.getLocationService(filter).subscribe((res) => {
      const loc = res?.data?.content?.[0];

      // 2. Redraw all routes but this one with location
      this.activeVehicles.forEach((v) => {
        const vTrip = (v as any).currentTrip;
        if (v.id === vehicle.id) {
          this.drawVehicleRoute(v, vTrip, loc);
        } else {
          this.drawVehicleRoute(v, vTrip, null);
        }
      });

      // 3. Pan to location if available, otherwise origin
      if (loc) {
        this.map.panTo({
          lat: Number(loc.latitude),
          lng: Number(loc.longitude),
        });
        this.map.setZoom(12);
      } else {
        // Fallback pan logic could go here
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
