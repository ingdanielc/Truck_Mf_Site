import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  computeRoute,
  routeDistanceKm,
  routeDurationSeconds,
  routeTollCost,
} from 'src/app/utils/google-routes';
import { createPinMarker, removeMarker } from 'src/app/utils/google-markers';
import { locationQuery } from 'src/app/utils/city-geo';
import { encodeRoutePath } from 'src/app/utils/polyline';
import { toIsoDate } from 'src/app/utils/toll-context';
import { TollService } from 'src/app/services/toll.service';
import {
  TollEstimate,
  TollEstimateRequest,
  TollPoint,
  TollTripContext,
} from 'src/app/models/toll-model';
import { environment } from 'src/environments/environment';

declare var globalThis: any;

@Component({
  selector: 'g-trip-info-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-trip-info-card.component.html',
  styleUrls: ['./g-trip-info-card.component.scss'],
})
export class GTripInfoCardComponent implements OnChanges {
  @Input() isOpen: boolean = false;
  @Input() originName: string = '';
  @Input() destinationName: string = '';
  /** Solo se informa en viajes redondos: convierte la ruta en Origen → Ida → Regreso */
  @Input() returnDestinationName: string = '';
  /**
   * Ubicaciones para Google Maps. Los nombres de arriba son los que se
   * muestran y no dicen el país, así que el padre pasa aquí la ciudad
   * completa; si no las informa, se asume Colombia como antes.
   */
  @Input() originQuery: string = '';
  @Input() destinationQuery: string = '';
  @Input() returnDestinationQuery: string = '';
  @Input() vehicleAxles: number = 2;
  /**
   * Datos del viaje para la estimación de peajes del backend. Si el padre no lo
   * informa, ese bloque no se consulta y la pantalla queda como estaba.
   */
  @Input() tripContext: TollTripContext | null = null;
  @Output() close = new EventEmitter<void>();
  /** Se emite cuando no hay ruta que mostrar, para que el padre cierre el panel */
  @Output() routeUnavailable = new EventEmitter<void>();
  /** Se emite al abrir el panel, para que el padre cierre lo que tenga encima */
  @Output() routeReady = new EventEmitter<void>();

  /**
   * El panel solo se muestra cuando hay ruta. `isOpen` es la solicitud del
   * padre; esta bandera es la visibilidad real. Mientras se calcula no se
   * muestra nada: la espera es silenciosa.
   */
  isVisible: boolean = false;
  routeData: any = null;
  distance: string = '';
  duration: string = '';
  durationInTraffic: string = '';
  tollsCount: number = 0;
  mapInstance: any = null;
  private routePolylines: any[] = [];
  private routeMarkers: any[] = [];

  // New features
  tollsList: { name: string; price: number }[] = [];
  tollsTotalCost: number = 0;
  showTolls: boolean = false;
  fuelEstimatedGals: string = '0';
  fuelEstimatedCost: number = 0;
  readonly KM_PER_GALLON = 7; // More realistic average for loaded trucks in Colombia
  readonly DIESEL_PRICE_GALLON = 11001; // Estimated COP per gallon
  readonly CARGO_DURATION_FACTOR = 1.35; // 35% more time for heavy vehicles
  readonly ROUTE_TIMEOUT_MS = 8000;

  /**
   * Peajes con la tarifa de la tabla del backend. Se pide después de que el
   * panel ya abrió y, cuando llega con datos, reemplaza en pantalla al estimado
   * de Google. En `null` —sin respuesta, error o lista vacía— manda el de Google.
   */
  apiTolls: TollEstimate | null = null;
  showApiTolls: boolean = false;

  /** Descarta respuestas de un cálculo anterior si se cerró o se volvió a abrir */
  private requestId: number = 0;

  constructor(private readonly tollService: TollService) {}

  /**
   * Entradas que definen el trayecto. Si alguna cambia con el panel abierto,
   * lo que se está mostrando dejó de corresponder al viaje.
   */
  private static readonly TRIP_INPUTS = [
    'originName',
    'destinationName',
    'returnDestinationName',
    'originQuery',
    'destinationQuery',
    'returnDestinationQuery',
    'vehicleAxles',
    'tripContext',
  ];

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen']) {
      // Al guardar la edición el viaje se recarga del servidor, así que los
      // datos llegan después de abrir el panel: sin esto se quedaría mostrando
      // la ruta y los peajes del viaje anterior
      if (this.isOpen && this.tripInputsChanged(changes)) {
        this.calculateRoute();
      }
      return;
    }

    if (this.isOpen) {
      this.isVisible = false;
      this.calculateRoute();
    } else {
      this.requestId++;
      this.isVisible = false;
      this.clearRouteOverlays();
    }
  }

  /** Alguna entrada del trayecto cambió de valor, no solo de referencia. */
  private tripInputsChanged(changes: SimpleChanges): boolean {
    return GTripInfoCardComponent.TRIP_INPUTS.some((input) => {
      const change = changes[input];
      return !!change && change.previousValue !== change.currentValue;
    });
  }

  /** Un viaje redondo se distingue por tener destino de regreso */
  get isRoundTrip(): boolean {
    return !!this.returnDestinationName;
  }

  /** Punto final de la ruta: el destino de regreso en los viajes redondos */
  get finalDestinationName(): string {
    return this.isRoundTrip ? this.returnDestinationName : this.destinationName;
  }

  /**
   * La ubicación que informó el padre; si no la informó, el nombre con su
   * país, que es Colombia salvo que el propio nombre diga otro.
   */
  private queryFor(query: string, name: string): string {
    return query?.trim() || locationQuery(name);
  }

  private get finalDestinationQuery(): string {
    return this.isRoundTrip
      ? this.queryFor(this.returnDestinationQuery, this.returnDestinationName)
      : this.queryFor(this.destinationQuery, this.destinationName);
  }

  async calculateRoute(): Promise<void> {
    const currentRequest = ++this.requestId;
    this.routeData = null;
    this.tollsCount = 0;
    this.tollsList = [];
    this.tollsTotalCost = 0;
    this.showTolls = false;
    this.apiTolls = null;
    this.showApiTolls = false;

    if (!this.originName || !this.destinationName) {
      this.markRouteUnavailable();
      return;
    }

    const request: any = {
      origin: this.queryFor(this.originQuery, this.originName),
      destination: this.finalDestinationQuery,
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
      extraComputations: ['TOLLS'],
      fields: [
        'path',
        'legs',
        'distanceMeters',
        'durationMillis',
        'staticDurationMillis',
        'viewport',
        'travelAdvisory',
      ],
    };

    // En el viaje redondo el destino de ida es una parada intermedia,
    // así que distancia, tiempo, combustible y peajes cubren los dos tramos
    if (this.isRoundTrip) {
      request.intermediates = [
        this.queryFor(this.destinationQuery, this.destinationName),
      ];
    }

    try {
      const route = await this.withTimeout(computeRoute(request));

      // Se cerró el panel o llegó otra solicitud mientras se calculaba
      if (currentRequest !== this.requestId) return;

      if (!route) {
        this.markRouteUnavailable();
        return;
      }

      const km = routeDistanceKm(route);
      this.distance = km ? `${km.toFixed(1)} km` : 'N/A';
      this.fuelEstimatedGals = km ? (km / this.KM_PER_GALLON).toFixed(1) : '0';
      this.fuelEstimatedCost =
        Number.parseFloat(this.fuelEstimatedGals) * this.DIESEL_PRICE_GALLON;

      this.durationInTraffic = this.formatDuration(
        Math.floor(
          routeDurationSeconds(route, { withTraffic: true }) *
            this.CARGO_DURATION_FACTOR,
        ),
      );
      this.duration = this.formatDuration(
        Math.floor(
          routeDurationSeconds(route, { withTraffic: false }) *
            this.CARGO_DURATION_FACTOR,
        ),
      );

      this.collectTolls(route);

      this.routeData = route;
      this.isVisible = true;
      this.routeReady.emit();
      this.renderRouteOnMap(route);

      // Va al final y sin await: el panel ya está abierto, así que la segunda
      // fuente llega cuando llegue y nunca demora la apertura
      this.loadApiTolls(route, currentRequest);
    } catch (error) {
      console.error('Error in computeRoutes:', error);
      if (currentRequest === this.requestId) {
        this.markRouteUnavailable();
      }
    }
  }

  /**
   * No hay nada que mostrar: el panel no se abre y se avisa al padre para que
   * baje su bandera, si no quedaría en un estado "abierto" invisible.
   */
  private markRouteUnavailable(): void {
    this.isVisible = false;
    this.routeData = null;
    this.clearRouteOverlays();
    this.routeUnavailable.emit();
  }

  /**
   * Sin esto, una llamada colgada dejaría al usuario esperando un panel que
   * nunca abre, porque la espera no muestra ningún indicador.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Tiempo de espera agotado al calcular la ruta')),
        this.ROUTE_TIMEOUT_MS,
      );
      promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  /**
   * Los peajes se toman de las instrucciones de cada tramo, que es lo único
   * que los nombra. Si no aparecen ahí, se usa el estimado que reporta la
   * propia API (`extraComputations: ['TOLLS']`) y, como último recurso, la
   * tarifa por número de ejes.
   */
  private collectTolls(route: any): void {
    this.tollsList = [];
    this.tollsTotalCost = 0;

    for (const leg of route.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const instructions = step.instructions || '';
        if (
          instructions.toLowerCase().includes('peaje') ||
          instructions.toLowerCase().includes('toll')
        ) {
          const price = this.mockTollPrice();
          this.tollsList.push({
            name: this.cleanInstructionString(instructions),
            price: price,
          });
          this.tollsTotalCost += price;
        }
      }
    }

    if (this.tollsList.length === 0) {
      const estimated = routeTollCost(route);
      if (estimated > 0) {
        this.tollsList.push({
          name: 'Peajes detectados en la ruta',
          price: estimated,
        });
        this.tollsTotalCost = estimated;
      }
    }

    this.tollsCount = this.tollsList.length;
  }

  toggleTolls(): void {
    this.showTolls = !this.showTolls;
  }

  toggleApiTolls(): void {
    this.showApiTolls = !this.showApiTolls;
  }

  /**
   * Pide la estimación con las tarifas de la tabla del backend.
   *
   * No se espera ni se encadena con nada: cualquier demora o error deja la
   * tarjeta de Google en pantalla, que es como se comportaba antes.
   */
  private loadApiTolls(route: any, currentRequest: number): void {
    const request = this.buildTollRequest(route);
    if (!request) return;

    this.tollService.estimate(request).subscribe((estimate) => {
      // Se cerró el panel o llegó otra solicitud mientras se consultaba
      if (currentRequest !== this.requestId) return;

      this.apiTolls = estimate?.tolls?.length ? estimate : null;
    });
  }

  /**
   * Arma la consulta con lo que ya se calculó para el mapa. Devuelve `null`
   * cuando falta lo mínimo —los dos extremos del trayecto—, porque sin eso el
   * backend no puede responder.
   */
  private buildTollRequest(route: any): TollEstimateRequest | null {
    const positions = this.waypointPositions(route);
    if (positions.length < 2) return null;

    const context = this.tripContext ?? {};
    // En el viaje redondo el destino de ida es la parada intermedia y el punto
    // final es el destino de regreso
    const destinationIndex = this.isRoundTrip ? 1 : positions.length - 1;
    const destination = positions[destinationIndex] ?? positions.at(-1)!;

    const request: TollEstimateRequest = {
      origin: this.tollPoint(positions[0], context.originId),
      destination: this.tollPoint(destination, context.destinationId),
      vehicleId: context.vehicleId ?? null,
      travelDate: context.travelDate || toIsoDate(),
      tripType: context.tripType ?? null,
      tripId: context.tripId ?? null,
      axles: context.axles ?? this.vehicleAxles ?? null,
    };

    if (this.isRoundTrip) {
      request.returnDestination = this.tollPoint(
        positions.at(-1)!,
        context.returnDestinationId,
      );
    }

    // El trazado es opcional: sin él la respuesta sale por corredor
    const encodedPolyline = encodeRoutePath(route?.path ?? []);
    if (encodedPolyline) {
      request.route = {
        provider: 'GOOGLE_ROUTES',
        encodedPolyline: encodedPolyline,
        distanceMeters: route?.distanceMeters,
      };
    }

    return request;
  }

  private tollPoint(
    position: { lat: number; lng: number },
    cityId?: string | null,
  ): TollPoint {
    return { lat: position.lat, lng: position.lng, cityId: cityId ?? null };
  }

  private mockTollPrice(): number {
    // Current Colombian Toll rates 2024 (estimates per cargo category C2-C6+)
    const axles = this.vehicleAxles || 2;

    if (axles <= 2) return 21500; // Category II (Truck C2 / Bus)
    if (axles === 3) return 28500; // Category III (Truck C3)
    if (axles === 4) return 36500; // Category IV (Truck C4)
    if (axles === 5) return 54500; // Category V (Truck C5)
    if (axles >= 6) return 81500; // Category VI+ (Truck C6+)

    return 21500; // Fallback to Category II for cargo vehicles
  }

  private cleanInstructionString(htmlString: string): string {
    let unescaped = htmlString.replaceAll(/<[^>]*>?/gm, '');

    // Common prefixes to remove
    const patternsToRemove = [
      /En la rotonda, toma la .* salida en dirección/gi,
      /Toma la salida .* hacia/gi,
      /Continúa por/gi,
      /Continúa hacia/gi,
      /Carretera con peajes/gi,
      /Carretera con peaje/gi,
      /Pasa por el peaje .* en/gi,
      /Pasa por el peaje/gi,
    ];

    patternsToRemove.forEach((pattern) => {
      unescaped = unescaped.replaceAll(pattern, '');
    });

    // If 'Peaje' is mentioned, try to keep only from 'Peaje' onwards
    const peajeIndex = unescaped.toLowerCase().indexOf('peaje');
    if (peajeIndex !== -1) {
      unescaped = unescaped.substring(peajeIndex);
    } else {
      const tollIndex = unescaped.toLowerCase().indexOf('toll');
      if (tollIndex !== -1) {
        unescaped = unescaped.substring(tollIndex);
      }
    }

    return unescaped.trim();
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} h ${minutes} min`;
    }
    return `${minutes} min`;
  }

  onClose(): void {
    this.close.emit();
  }

  private clearRouteOverlays(): void {
    this.routePolylines.forEach((polyline) => polyline.setMap(null));
    this.routePolylines = [];
    this.routeMarkers.forEach((marker) => removeMarker(marker));
    this.routeMarkers = [];
  }

  /** Normaliza cualquier forma de ubicación que devuelva la API a `{lat, lng}`. */
  private toLatLng(location: any): { lat: number; lng: number } | null {
    const point = location?.latLng ?? location;
    if (!point) return null;

    const lat = typeof point.lat === 'function' ? point.lat() : point.lat;
    const lng = typeof point.lng === 'function' ? point.lng() : point.lng;
    const latitude = lat ?? point.latitude;
    const longitude = lng ?? point.longitude;

    if (latitude === null || latitude === undefined) return null;
    if (longitude === null || longitude === undefined) return null;
    return { lat: Number(latitude), lng: Number(longitude) };
  }

  /**
   * Puntos donde va un globo: origen y el final de cada tramo. En el viaje
   * redondo son tres (A origen, B destino de ida, C destino de regreso).
   */
  private waypointPositions(route: any): { lat: number; lng: number }[] {
    const legs = route?.legs ?? [];
    const positions: ({ lat: number; lng: number } | null)[] = [];

    if (legs.length > 0) {
      positions.push(this.toLatLng(legs[0].startLocation));
      for (const leg of legs) positions.push(this.toLatLng(leg.endLocation));
    }

    let resolved = positions.filter((p) => p !== null) as {
      lat: number;
      lng: number;
    }[];

    // Si los tramos no traen ubicaciones, se usan los extremos del trazado
    if (resolved.length < 2 && route?.path?.length > 1) {
      const first = this.toLatLng(route.path[0]);
      const last = this.toLatLng(route.path.at(-1));
      resolved = [first, last].filter((p) => p !== null) as {
        lat: number;
        lng: number;
      }[];
    }

    return resolved;
  }

  /**
   * Globos rojos con letra blanca (A, B, C), como los que dibujaba el
   * DirectionsRenderer anterior.
   *
   * Se construyen con `PinElement` en vez de `createWaypointAdvancedMarkers`
   * porque las opciones de estilo de ese método (`CreateWaypointMarkersOptions`)
   * solo existen en el canal `v=alpha`.
   */
  private async renderRouteMarkers(route: any): Promise<void> {
    const positions = this.waypointPositions(route);
    if (positions.length === 0) return;

    const labels = 'ABCDEFGHIJ';
    const markers = await Promise.all(
      positions.map((position, index) =>
        createPinMarker({
          map: this.mapInstance,
          position: position,
          glyphText: labels[index] ?? String(index + 1),
          background: '#dc3545',
          glyphColor: '#ffffff',
        }),
      ),
    );

    this.routeMarkers = markers.filter((marker) => marker !== null);
  }

  /**
   * Dibuja la ruta con `createPolylines`, que reemplaza al `DirectionsRenderer`
   * anterior. El `div` del mapa se vuelve a crear en cada apertura, así que el
   * mapa se instancia de nuevo cada vez.
   */
  private renderRouteOnMap(route: any): void {
    setTimeout(async () => {
      const mapElement = document.getElementById('tripMap');
      if (!mapElement || !globalThis.google?.maps?.Map || !route) return;

      this.clearRouteOverlays();

      this.mapInstance = new globalThis.google.maps.Map(mapElement, {
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        // Sin `mapId` los marcadores avanzados no se dibujan
        mapId: environment.googleMapsMapId,
      });

      // Mismo trazo azul que dibujaba el DirectionsRenderer anterior
      this.routePolylines = route.createPolylines?.() ?? [];
      this.routePolylines.forEach((polyline) => {
        polyline.setOptions({
          strokeColor: '#0d6efd',
          strokeWeight: 5,
          strokeOpacity: 0.8,
        });
        polyline.setMap(this.mapInstance);
      });

      if (route.viewport) {
        this.mapInstance.fitBounds(route.viewport, 50);
      }

      await this.renderRouteMarkers(route);
    }, 100);
  }
}
