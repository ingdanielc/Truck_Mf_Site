import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  computeRoute,
  RoutePoint,
  routeWaypoints,
} from 'src/app/utils/google-routes';
import { createPinMarker, removeMarker } from 'src/app/utils/google-markers';
import { locationQuery } from 'src/app/utils/city-geo';
import { environment } from 'src/environments/environment';

declare var globalThis: any;

/**
 * El trayecto planeado del viaje: origen, destino y —en los redondos— el
 * destino de regreso, con su trazo azul y sus globos A, B y C. Es el único
 * lugar donde se dibuja una ruta, así que todas se ven igual.
 *
 * Dos formas de usarlo:
 *
 *   - Con las ciudades (`originQuery`, `destinationQuery`, ...): el componente
 *     pide la ruta. Es el caso del detalle del viaje.
 *   - Con `route`: quien ya la calculó la pasa hecha y aquí solo se dibuja. Es
 *     el caso del panel de ruta (`g-trip-info-card`), que pide la suya con
 *     peajes y tiempos y no debe pagar una segunda consulta por el mapa.
 *
 * Es el mapa de los viajes que ya no se están moviendo. El otro mapa del
 * detalle sigue el recorrido que reporta el conductor, y eso solo tiene sentido
 * mientras el viaje está En Curso: en uno Completado, Pendiente o Cancelado la
 * última ubicación reportada puede ser de cualquier parte —incluso de otro
 * viaje posterior del mismo camión— y no dice nada del trayecto.
 *
 * No calcula peajes ni tiempos: para eso está el panel de ruta. Aquí solo se
 * dibuja por dónde iba el viaje.
 */
@Component({
  selector: 'g-route-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-route-map.component.html',
  styleUrls: ['./g-route-map.component.scss'],
})
export class GRouteMapComponent implements OnChanges, OnDestroy {
  /** Nombres visibles, los que se muestran bajo el mapa. */
  @Input() originName: string = '';
  @Input() destinationName: string = '';
  /** Solo en viajes redondos: convierte la ruta en Origen → Ida → Regreso. */
  @Input() returnDestinationName: string = '';

  /**
   * Ubicaciones para Google Maps. Los nombres de arriba no dicen el país, así
   * que el padre pasa aquí la ciudad completa; si no las informa, se asume
   * Colombia, igual que en el panel de ruta.
   */
  @Input() originQuery: string = '';
  @Input() destinationQuery: string = '';
  @Input() returnDestinationQuery: string = '';

  /**
   * Ruta ya calculada. Informarla evita la consulta: el componente se limita a
   * dibujarla y no mira las ciudades de arriba.
   */
  @Input() route: any = null;

  @ViewChild('map') mapElement?: ElementRef<HTMLDivElement>;

  /** Mientras se calcula la ruta. La primera vez siempre se ve. */
  public loading = false;

  /** No hubo ruta que dibujar: faltan ciudades, falló la API o no respondió. */
  public unavailable = false;

  private mapInstance: any = null;
  private polylines: any[] = [];
  private markers: any[] = [];

  /** Descarta la respuesta de un cálculo anterior si el viaje cambió. */
  private requestId = 0;

  /** El SDK de Maps lo carga el shell, no esta aplicación: puede no estar
   *  listo cuando el componente se pinta. */
  private readonly FIRST_WAIT_MS = 100;
  private readonly SDK_RETRIES = 20;
  private readonly SDK_RETRY_MS = 250;
  private readonly ROUTE_TIMEOUT_MS = 8000;

  ngOnChanges(changes: SimpleChanges): void {
    const cambio = Object.keys(changes).some(
      (input) => changes[input].previousValue !== changes[input].currentValue,
    );
    if (!cambio) return;

    if (this.route) void this.drawGivenRoute();
    else void this.drawRoute();
  }

  /** La ruta llegó hecha: solo queda pintarla. */
  private async drawGivenRoute(): Promise<void> {
    const currentRequest = ++this.requestId;
    this.loading = false;
    this.unavailable = false;
    await this.render(this.route, currentRequest);
  }

  ngOnDestroy(): void {
    this.requestId++;
    this.clearOverlays();
  }

  /** Un viaje redondo se distingue por tener destino de regreso. */
  get isRoundTrip(): boolean {
    return !!this.returnDestinationName;
  }

  /** Las paradas, en orden, para el pie del mapa. */
  get stops(): string[] {
    return [
      this.originName,
      this.destinationName,
      this.returnDestinationName,
    ].filter((name) => !!name);
  }

  private queryFor(query: string, name: string): string {
    return query?.trim() || locationQuery(name);
  }

  private async drawRoute(): Promise<void> {
    const currentRequest = ++this.requestId;
    this.unavailable = false;

    if (!this.originName || !this.destinationName) {
      /* Todavía no llegaron las ciudades: no es un error, es que el padre aún
         no tiene el viaje. El mapa se dibuja cuando lleguen. */
      this.loading = false;
      return;
    }

    this.loading = true;
    try {
      const request: any = {
        origin: this.queryFor(this.originQuery, this.originName),
        destination: this.isRoundTrip
          ? this.queryFor(
              this.returnDestinationQuery,
              this.returnDestinationName,
            )
          : this.queryFor(this.destinationQuery, this.destinationName),
        travelMode: 'DRIVING',
        fields: ['path', 'legs', 'viewport'],
      };

      /* En el redondo el destino de ida es una parada intermedia, para que el
         trazo cubra los dos tramos. */
      if (this.isRoundTrip) {
        request.intermediates = [
          this.queryFor(this.destinationQuery, this.destinationName),
        ];
      }

      const route = await this.withTimeout(computeRoute(request));
      if (currentRequest !== this.requestId) return;

      if (!route) {
        this.markUnavailable();
        return;
      }

      await this.render(route, currentRequest);
    } catch (error) {
      console.error('No se pudo calcular la ruta del viaje:', error);
      if (currentRequest === this.requestId) this.markUnavailable();
    } finally {
      if (currentRequest === this.requestId) this.loading = false;
    }
  }

  private markUnavailable(): void {
    this.unavailable = true;
    this.clearOverlays();
  }

  /** Sin esto, una llamada colgada dejaría el mapa en "Cargando" para siempre. */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Tiempo de espera agotado al calcular la ruta')),
        this.ROUTE_TIMEOUT_MS,
      );
      promise.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  }

  private async render(route: any, currentRequest: number): Promise<void> {
    const element = await this.waitForMapElement();
    if (!element || currentRequest !== this.requestId) {
      if (currentRequest === this.requestId) this.markUnavailable();
      return;
    }

    this.clearOverlays();
    this.mapInstance = new globalThis.google.maps.Map(element, {
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      /* Sin `mapId` los marcadores avanzados no se dibujan. */
      mapId: environment.googleMapsMapId,
    });

    this.polylines = route.createPolylines?.() ?? [];
    this.polylines.forEach((polyline: any) => {
      polyline.setOptions({
        strokeColor: '#0d6efd',
        strokeWeight: 5,
        strokeOpacity: 0.8,
      });
      polyline.setMap(this.mapInstance);
    });

    if (route.viewport) this.mapInstance.fitBounds(route.viewport, 50);

    await this.renderMarkers(route);
  }

  /**
   * El `div` del mapa y el SDK: el primero aparece cuando Angular pinta la
   * plantilla y el segundo lo carga el shell. Se espera a los dos en vez de
   * darlos por hechos, que es lo que hacía el `setTimeout` de 100 ms del
   * detalle del viaje y fallaba en conexiones lentas.
   */
  private async waitForMapElement(): Promise<HTMLDivElement | null> {
    /* La misma espera que hacía el panel de ruta antes de instanciar el mapa:
       da tiempo a que Angular pinte el `div` y a que el panel que lo contiene
       empiece a abrirse. Google mide el contenedor al crear el mapa. */
    await new Promise((resolve) => setTimeout(resolve, this.FIRST_WAIT_MS));

    for (let intento = 0; intento < this.SDK_RETRIES; intento++) {
      const element = this.mapElement?.nativeElement;
      if (element && globalThis.google?.maps?.Map) return element;
      await new Promise((resolve) => setTimeout(resolve, this.SDK_RETRY_MS));
    }
    return null;
  }

  /** Globos rojos con letra blanca (A, B, C), como los del panel de ruta. */
  private async renderMarkers(route: any): Promise<void> {
    const positions: RoutePoint[] = routeWaypoints(route);
    if (!positions.length) return;

    const labels = 'ABCDEFGHIJ';
    const markers = await Promise.all(
      positions.map((position, index) =>
        createPinMarker({
          map: this.mapInstance,
          position: position,
          glyphText: labels[index] ?? String(index + 1),
          title: this.stops[index] ?? '',
          background: '#dc3545',
          glyphColor: '#ffffff',
        }),
      ),
    );

    this.markers = markers.filter((marker) => marker !== null);
  }

  private clearOverlays(): void {
    this.polylines.forEach((polyline) => polyline.setMap(null));
    this.polylines = [];
    this.markers.forEach((marker) => removeMarker(marker));
    this.markers = [];
  }
}
