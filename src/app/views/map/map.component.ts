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
import { FormsModule } from '@angular/forms';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelTrip } from 'src/app/models/trip-model';
import { ModelOwner } from 'src/app/models/owner-model';
import {
  ModelFilterTable,
  Filter,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { map, of, Subscription, switchMap, distinctUntilChanged } from 'rxjs';
import { computeRoute } from 'src/app/utils/google-routes';
import { locationQuery } from 'src/app/utils/city-geo';
import { PlatePipe } from '../../pipes/plate.pipe';
import { Formatters } from '../../utils/formatters';

declare const google: any;

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule, FormsModule, PlatePipe],
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

  owners: ModelOwner[] = [];
  selectedOwnerFilterId: number | null = null;

  private markers: any[] = [];
  private polylines: any[] = [];

  /* ---- Colores de los puntos de la ruta ----------------------------------
     Verde el origen y rojo el final, como siempre. La parada intermedia del
     viaje redondo va en naranja: el camion pasa por ahi, pero no termina ahi.
     Se nombran aqui y la leyenda los lee de estas propiedades, para que los
     marcadores y el recuadro no puedan discrepar. */
  public readonly colorOrigin = '#28a745';
  public readonly colorLegStop = '#fd7e14';
  public readonly colorDestination = '#dc3545';

  /* Cada `clearMap()` invalida lo que se estuviera dibujando. La ruta y el
     geocoding son asincronos, y sin esto lo que quedara en vuelo al cambiar
     de vehiculo terminaba pintandose sobre el mapa ya limpio. */
  private renderId = 0;
  private geocoder: any;
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

    this.userSub = this.securityService.userData$
      .pipe(
        distinctUntilChanged((prev: any, curr: any) => prev?.id === curr?.id),
      )
      .subscribe((user: any) => {
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
            if (this.userRole === 'ADMINISTRADOR') {
              this.loadOwners();
            }
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
      if (this.userRole === 'ADMINISTRADOR' || this.loggedInUserId) {
        this.loadActiveData();
      }
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

          if (
            roleUpper === 'ADMINISTRADOR' &&
            this.selectedOwnerFilterId === null
          ) {
            // No consultar vehículos hasta que el administrador haga una selección
            return of({ data: { content: [] } });
          }

          if (
            roleUpper === 'ADMINISTRADOR' &&
            this.selectedOwnerFilterId &&
            this.selectedOwnerFilterId !== -1
          ) {
            vehiclesFilter.push(
              new Filter(
                'owner.id',
                '=',
                this.selectedOwnerFilterId.toString(),
              ),
            );
          } else if (roleUpper === 'PROPIETARIO' && this.loggedInUserId) {
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

          if (roleUpper === 'ADMINISTRADOR' || roleUpper === 'PROPIETARIO') {
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
            new Pagination(1000, 0),
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

  /** La ciudad del catalogo, o `null` si el viaje no la trae o no esta. */
  private findCity(cityId: any): any {
    if (cityId === null || cityId === undefined || cityId === '') return null;
    return this.citiesList.find((c) => String(c.id) === String(cityId)) ?? null;
  }

  /** La ciudad tal como la espera Google: nombre, departamento y pais. */
  private cityQuery(city: any): string {
    return city
      ? locationQuery(`${city.name}, ${city.state}`, city)
      : 'Colombia';
  }

  /** Los puntos de un `path` de la API de rutas, como objetos planos. */
  private toLatLngs(path: any): any[] {
    return (path ?? []).map((point: any) => ({
      lat: typeof point.lat === 'function' ? point.lat() : point.lat,
      lng: typeof point.lng === 'function' ? point.lng() : point.lng,
    }));
  }

  /**
   * El tramo que el vehiculo esta recorriendo ahora. En el viaje redondo el
   * primer tramo es la ida y el segundo el regreso, y `currentLeg` dice en
   * cual va; el otro —hecho o por hacer— se pinta tenue. Sin ese dato no se
   * atenua nada: los dos tramos se ven igual, como estaba antes.
   */
  private isActiveLeg(trip: ModelTrip, legIndex: number): boolean {
    if (!trip.currentLeg) return true;
    return trip.currentLeg === 'REGRESO' ? legIndex >= 1 : legIndex === 0;
  }

  private addRoutePolyline(
    path: any[],
    color: string,
    isActive: boolean,
  ): void {
    const polyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: isActive ? 0.8 : 0.3,
      strokeWeight: 5,
      map: this.map,
    });
    this.polylines.push(polyline);
  }

  private drawVehicleRoute(
    vehicle: ModelVehicle,
    trip: ModelTrip,
    lastLocation: any,
  ): void {
    const renderId = this.renderId;
    const vehicleColor = this.getVehicleColor(vehicle);

    // Resolve city names
    const originCity = this.findCity(trip.originId);
    const destCity = this.findCity(trip.destinationId);
    const returnCity = this.findCity(trip.returnDestinationId);

    const originName = this.cityQuery(originCity);
    const destName = this.cityQuery(destCity);
    const returnName = returnCity ? this.cityQuery(returnCity) : '';

    /* El viaje redondo tiene dos destinos: el de ida queda como parada
       intermedia y el de regreso cierra la ruta, asi que el trazo cubre los
       dos tramos —la misma forma con la que el formulario calcula los
       kilometros y el panel de informacion arma la ruta—. Se reconoce por el
       destino de regreso, que solo lleva el REDONDO: el formulario lo limpia
       en los demas tipos. */
    const isRoundTrip = !!returnName;

    /* Las paradas en orden de recorrido. La misma lista sirve para los
       marcadores y para el trazo recto de respaldo, asi que el segundo
       destino no hay que volver a resolverlo mas abajo. */
    const stops = [
      {
        query: originName,
        label: 'O',
        title: `Origen: ${originCity?.name || trip.originId}`,
        color: this.colorOrigin,
      },
      {
        query: destName,
        label: isRoundTrip ? 'I' : 'D',
        title: isRoundTrip
          ? `Destino de ida: ${destCity?.name || trip.destinationId}`
          : `Destino: ${destCity?.name || trip.destinationId}`,
        color: isRoundTrip ? this.colorLegStop : this.colorDestination,
      },
    ];
    if (isRoundTrip) {
      stops.push({
        query: returnName,
        label: 'R',
        title: `Destino de regreso: ${returnCity?.name || trip.returnDestinationId}`,
        color: this.colorDestination,
      });
    }

    const drawStraightLineFallback = (): void => {
      Promise.all(stops.map((stop) => this.getCoordinates(stop.query))).then(
        (positions) => {
          if (renderId !== this.renderId) return;
          positions.forEach((position, i) => {
            this.addMarker(
              position,
              stops[i].label,
              stops[i].title,
              stops[i].color,
            );
          });
          const polyline = new google.maps.Polyline({
            path: positions,
            strokeColor: vehicleColor,
            strokeWeight: 4,
            map: this.map,
          });
          this.polylines.push(polyline);
        },
      );
    };

    const request: any = {
      origin: originName,
      destination: isRoundTrip ? returnName : destName,
      travelMode: 'DRIVING',
      /* En el redondo se piden tambien los tramos: con ellos se ubica la
         parada intermedia y se distingue la ida del regreso. */
      fields: isRoundTrip ? ['path', 'legs'] : ['path'],
    };
    if (isRoundTrip) {
      request.intermediates = [destName];
    }

    computeRoute(request)
      .then((route: any) => {
        if (renderId !== this.renderId) return;

        // `path` reemplaza a `overview_path` del servicio anterior
        const pathPoints = this.toLatLngs(route?.path);

        if (pathPoints.length === 0) {
          console.warn(`Route request returned no path for ${vehicle.plate}`);
          drawStraightLineFallback();
          return;
        }

        const legPaths = (route?.legs ?? [])
          .map((leg: any) => this.toLatLngs(leg?.path))
          .filter((points: any[]) => points.length > 0);

        // Origin and Destination markers (taken from the route path for precision)
        const lastStop = stops.at(-1)!;
        this.addMarker(
          pathPoints[0],
          stops[0].label,
          stops[0].title,
          stops[0].color,
        );
        this.addMarker(
          pathPoints.at(-1),
          lastStop.label,
          lastStop.title,
          lastStop.color,
        );

        /* La parada intermedia del redondo es donde termina el primer tramo.
           Si la API no devolvio los tramos se geocodifica la ciudad: el punto
           queda menos preciso, pero el destino de ida no puede faltar. */
        if (isRoundTrip) {
          const stop = stops[1];
          const legEnd = legPaths[0]?.at(-1);
          if (legEnd) {
            this.addMarker(legEnd, stop.label, stop.title, stop.color);
          } else {
            this.getCoordinates(stop.query).then((position) => {
              if (renderId !== this.renderId) return;
              this.addMarker(position, stop.label, stop.title, stop.color);
            });
          }
        }

        // Path Polyline
        if (isRoundTrip && legPaths.length > 1) {
          legPaths.forEach((legPath: any[], i: number) => {
            this.addRoutePolyline(
              legPath,
              vehicleColor,
              this.isActiveLeg(trip, i),
            );
          });
        } else {
          this.addRoutePolyline(pathPoints, vehicleColor, true);
        }

        // Current Location marker (if available)
        if (lastLocation?.latitude && lastLocation.longitude) {
          const currentPos = {
            lat: Number(lastLocation.latitude),
            lng: Number(lastLocation.longitude),
          };
          this.addMarker(
            currentPos,
            Formatters.formatPlate(vehicle.plate),
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
      })
      .catch((error: any) => {
        console.warn(`Route request failed for ${vehicle.plate}:`, error);
        // Fallback to straight line if the route cannot be computed
        if (renderId === this.renderId) drawStraightLineFallback();
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

  /**
   * Si en el mapa hay algun viaje redondo. La leyenda solo nombra el destino
   * de ida cuando existe: en un mapa de viajes sencillos seria un color que
   * no aparece en ninguna parte.
   */
  get hasRoundTripOnMap(): boolean {
    return this.activeVehicles.some(
      (v) =>
        (this.selectedVehicleId === null || this.selectedVehicleId === v.id) &&
        !!(v as any).currentTrip?.returnDestinationId,
    );
  }

  showAll(): void {
    this.selectedVehicleId = null;
    this.renderAllVehiclesOnMap();
  }

  getVehicleColor(vehicle: ModelVehicle): string {
    // Generate a consistent color based on plate
    let hash = 0;
    for (let i = 0; i < vehicle.plate.length; i++) {
      hash = (vehicle.plate.codePointAt(i) ?? 0) + ((hash << 5) - hash);
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
    this.renderId++;
    this.markers.forEach((m) => m.setMap(null));
    this.polylines.forEach((p) => p.setMap(null));
    this.markers = [];
    this.polylines = [];
  }

  togglePanel(): void {
    this.isPanelCollapsed = !this.isPanelCollapsed;
  }

  /**
   * Los propietarios del filtro: solo los que tienen algun viaje en curso.
   *
   * El mapa no pinta otra cosa, asi que el catalogo completo llenaba el
   * desplegable de nombres que no llevan a ninguna parte: al elegir uno, el
   * mapa quedaba vacio y no habia forma de saber de antemano cuales si tenian
   * algo que mostrar.
   *
   * El backend no filtra viajes por propietario, asi que va en dos pasos —el
   * mismo camino de la vista de viajes—: los viajes en curso traen anidada la
   * relacion vehiculo-propietario, y con esos ids se piden los propietarios.
   */
  loadOwners(): void {
    const tripFilter = new ModelFilterTable(
      [new Filter('status', '=', 'En Curso')],
      new Pagination(1000, 0),
      new Sort('id', true),
    );

    this.tripService
      .getTripFilter(tripFilter)
      .pipe(
        switchMap((tripsResp: any) => {
          const trips: ModelTrip[] = tripsResp?.data?.content || [];
          const ownerIds = [
            ...new Set(trips.flatMap((trip) => this.ownerIdsOf(trip))),
          ];
          if (ownerIds.length === 0) return of({ data: { content: [] } });

          const ownerFilter = new ModelFilterTable(
            [new Filter('id', 'in', ownerIds.join(','))],
            new Pagination(ownerIds.length, 0),
            new Sort('name', true),
          );
          return this.ownerService.getOwnerFilter(ownerFilter);
        }),
      )
      .subscribe({
        next: (res: any) => {
          this.owners = res?.data?.content || [];
        },
        error: (err) => {
          console.error('Map: Error loading owners:', err);
          this.owners = [];
        },
      });
  }

  /**
   * Los propietarios de un viaje. Un vehiculo puede tener varios —cada uno
   * con su porcentaje— y el filtro del mapa lo encuentra por cualquiera de
   * ellos, asi que entran todos. Si el viaje no trae la relacion, queda el
   * propietario del conductor.
   */
  private ownerIdsOf(trip: ModelTrip): number[] {
    const fromVehicle = (trip.vehicle?.owners ?? [])
      .map((relation) => relation?.ownerId)
      .filter((id): id is number => id != null);
    if (fromVehicle.length > 0) return fromVehicle;
    return trip.driver?.ownerId == null ? [] : [trip.driver.ownerId];
  }

  onOwnerFilterChange(): void {
    this.selectedVehicleId = null;
    this.loadActiveData();
  }
}
