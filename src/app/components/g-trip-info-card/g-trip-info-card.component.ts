import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';

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
  @Input() vehicleAxles: number = 2;
  @Output() close = new EventEmitter<void>();

  loading: boolean = false;
  routeData: any = null;
  errorMsg: string | null = null;
  distance: string = '';
  duration: string = '';
  durationInTraffic: string = '';
  tollsCount: number = 0;
  mapInstance: any = null;
  directionsRenderer: any = null;

  // New features
  tollsList: { name: string; price: number }[] = [];
  tollsTotalCost: number = 0;
  showTolls: boolean = false;
  fuelEstimatedGals: string = '0';
  fuelEstimatedCost: number = 0;
  readonly KM_PER_GALLON = 7; // More realistic average for loaded trucks in Colombia
  readonly DIESEL_PRICE_GALLON = 11001; // Estimated COP per gallon
  readonly CARGO_DURATION_FACTOR = 1.35; // 35% more time for heavy vehicles

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['isOpen'] &&
      this.isOpen &&
      this.originName &&
      this.destinationName
    ) {
      this.calculateRoute();
    }
  }

  calculateRoute(): void {
    this.loading = true;
    this.errorMsg = null;
    this.routeData = null;
    this.tollsCount = 0;

    if (!this.originName || !this.destinationName) {
      this.loading = false;
      return;
    }

    if (globalThis.google === 'undefined' || !globalThis.google?.maps?.routes) {
      // Fallback to old directions service if modern routes not available in SDK version
      this.fallbackToDirectionsService();
      return;
    }

    // Using the modern computeRoutes API as suggested by warning
    globalThis.google.maps.routes.Route.computeRoutes({
      origin: { address: `${this.originName}, Colombia` },
      destination: { address: `${this.destinationName}, Colombia` },
      travelMode: 'DRIVING',
      routingPreference: 'TRAFFIC_AWARE',
    })
      .then((response: any) => {
        if (response.routes && response.routes.length > 0) {
          const route = response.routes[0];
          // The new API structure returns distanceMeters and duration natively
          const km = route.distanceMeters ? route.distanceMeters / 1000 : 0;
          this.distance = km ? `${km.toFixed(1)} km` : 'N/A';
          this.fuelEstimatedGals = km
            ? (km / this.KM_PER_GALLON).toFixed(1)
            : '0';
          this.fuelEstimatedCost =
            Number.parseFloat(this.fuelEstimatedGals) *
            this.DIESEL_PRICE_GALLON;

          // Standard duration
          if (route.duration) {
            const durationSec = Number.parseInt(
              route.duration.replace('s', ''),
              10,
            );
            this.duration = this.formatDuration(
              Math.floor(durationSec * this.CARGO_DURATION_FACTOR),
            );
          } else {
            this.duration = 'N/A';
          }

          // Traffic duration
          if (route.staticDuration) {
            const sDurationSec = Number.parseInt(
              route.staticDuration.replace('s', ''),
              10,
            );
            this.durationInTraffic = this.duration; // 'duration' field is traffic aware when pref is TRAFFIC_AWARE
            this.duration = this.formatDuration(
              Math.floor(sDurationSec * this.CARGO_DURATION_FACTOR),
            );
          } else {
            this.durationInTraffic = this.duration;
          }

          this.tollsList = [];
          if (route.legs) {
            for (const leg of route.legs) {
              if (leg.steps) {
                for (const step of leg.steps) {
                  if (step.navigationInstruction?.instructions) {
                    const ins = step.navigationInstruction.instructions;
                    if (
                      ins.toLowerCase().includes('peaje') ||
                      ins.toLowerCase().includes('toll')
                    ) {
                      const tollName = this.cleanInstructionString(ins);
                      const price = this.mockTollPrice();
                      this.tollsList.push({ name: tollName, price: price });
                      this.tollsTotalCost += price;
                    }
                  }
                }
              }
            }
          }
          this.tollsCount = this.tollsList.length;

          // If no tolls found in instructions but travelAdvisory says there are tolls, add a generic message
          if (
            this.tollsCount === 0 &&
            route.travelAdvisory?.tollInfo?.estimatedPrice
          ) {
            this.tollsCount = 1;
            const fallbackPrice =
              route.travelAdvisory.tollInfo.estimatedPrice.units ||
              this.mockTollPrice();
            this.tollsList.push({
              name: 'Peajes detectados en la ruta',
              price: fallbackPrice,
            });
            this.tollsTotalCost += fallbackPrice;
          }

          this.routeData = route;
          this.renderRouteOnMap(route);
          this.loading = false;
        } else {
          this.errorMsg = 'No se encontraron las rutas esperadas.';
          this.loading = false;
        }
      })
      .catch((error: any) => {
        console.error('Error in computeRoutes:', error);
        // Try fallback
        this.fallbackToDirectionsService();
      });
  }

  toggleTolls(): void {
    this.showTolls = !this.showTolls;
  }

  private mockTollPrice(): number {
    // Current Colombian Toll rates 2024 (estimates per category)
    const axles = this.vehicleAxles || 2;

    if (axles <= 2) return 16700; // Category I/II
    if (axles === 3) return 25000; // Category III
    if (axles === 4) return 33000; // Category IV/V
    if (axles === 5) return 50000; // Category VI
    if (axles >= 6) return 75000; // Category VII

    return 16700; // Fallback
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

  private fallbackToDirectionsService(): void {
    const directionsService = new globalThis.google.maps.DirectionsService();

    directionsService.route(
      {
        origin: `${this.originName}, Colombia`,
        destination: `${this.destinationName}, Colombia`,
        travelMode: globalThis.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(), // for traffic info
          trafficModel: 'bestguess',
        },
        provideRouteAlternatives: false,
      },
      (response: any, status: any) => {
        if (status === 'OK') {
          const route = response.routes[0];
          if (route?.legs && route.legs.length > 0) {
            const leg = route.legs[0];
            const km = leg.distance?.value ? leg.distance.value / 1000 : 0;
            this.distance = leg.distance?.text || 'N/A';
            this.fuelEstimatedGals = km
              ? (km / this.KM_PER_GALLON).toFixed(1)
              : '0';
            this.fuelEstimatedCost =
              Number.parseFloat(this.fuelEstimatedGals) *
              this.DIESEL_PRICE_GALLON;

            this.duration = this.formatDuration(
              Math.floor(
                (leg.duration?.value || 0) * this.CARGO_DURATION_FACTOR,
              ),
            );
            this.durationInTraffic = this.formatDuration(
              Math.floor(
                (leg.duration_in_traffic?.value || leg.duration?.value || 0) *
                  this.CARGO_DURATION_FACTOR,
              ),
            );

            // Calculate tolls
            this.tollsList = [];
            this.tollsTotalCost = 0;
            if (leg.steps) {
              for (const step of leg.steps) {
                const instructions = step.instructions || '';
                if (
                  instructions.toLowerCase().includes('peaje') ||
                  instructions.toLowerCase().includes('toll')
                ) {
                  const tollName = this.cleanInstructionString(instructions);
                  const price = this.mockTollPrice();
                  this.tollsList.push({ name: tollName, price: price });
                  this.tollsTotalCost += price;
                }
              }
            }
            this.tollsCount = this.tollsList.length;
            this.routeData = route;
            this.renderRouteOnMap(response); // DirectionsService returns the full response for renderer
          } else {
            this.errorMsg = 'No se encontraron las rutas esperadas.';
          }
        } else {
          this.errorMsg = 'No se pudo calcular la ruta (' + status + ').';
        }
        this.loading = false;
      },
    );
  }

  onClose(): void {
    this.close.emit();
  }

  private initMap(): void {
    const mapElement = document.getElementById('tripMap');
    if (
      mapElement &&
      globalThis.google !== 'undefined' &&
      globalThis.google?.maps?.Map
    ) {
      if (!this.mapInstance) {
        this.mapInstance = new globalThis.google.maps.Map(mapElement, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      }

      if (!this.directionsRenderer) {
        this.directionsRenderer = new globalThis.google.maps.DirectionsRenderer(
          {
            map: this.mapInstance,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: '#0d6efd',
              strokeWeight: 5,
              strokeOpacity: 0.8,
            },
          },
        );
      }
    }
  }

  private renderRouteOnMap(data: any): void {
    setTimeout(() => {
      this.initMap();
      if (this.directionsRenderer && data) {
        // DirectionsRenderer expects a DirectionsResult object.
        // If data has 'routes', we assume it's compatible.
        if (data.routes) {
          this.directionsRenderer.setDirections(data);
        }
      }
    }, 100);
  }
}
