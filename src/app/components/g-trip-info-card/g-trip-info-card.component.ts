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
  @Output() close = new EventEmitter<void>();

  loading: boolean = false;
  routeData: any = null;
  errorMsg: string | null = null;
  distance: string = '';
  duration: string = '';
  durationInTraffic: string = '';
  tollsCount: number = 0;

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

    if (
      typeof globalThis.google === 'undefined' ||
      !globalThis.google?.maps?.routes
    ) {
      // Fallback to old directions service if modern routes not available in SDK version
      if (globalThis.google?.maps?.DirectionsService) {
        this.fallbackToDirectionsService();
      } else {
        this.errorMsg = 'Google Maps no está disponible.';
        this.loading = false;
      }
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
          this.distance = route.distanceMeters
            ? `${(route.distanceMeters / 1000).toFixed(1)} km`
            : 'N/A';

          // Standard duration
          if (route.duration) {
            const durationSec = Number.parseInt(
              route.duration.replace('s', ''),
              10,
            );
            this.duration = this.formatDuration(durationSec);
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
            this.duration = this.formatDuration(sDurationSec);
          } else {
            this.durationInTraffic = this.duration;
          }

          this.tollsCount = 0; // Modern API requires explicit toll data fields which might need extra properties
          if (route.travelAdvisory?.tollInfo) {
            // If the new API provides explicit toll counts
            this.tollsCount = route.travelAdvisory.tollInfo.estimatedPrice
              ? 1
              : 0;
          } else if (route.legs) {
            for (const leg of route.legs) {
              if (leg.steps) {
                for (const step of leg.steps) {
                  if (step.navigationInstruction?.instructions) {
                    const ins =
                      step.navigationInstruction.instructions.toLowerCase();
                    if (ins.includes('peaje') || ins.includes('toll')) {
                      this.tollsCount++;
                    }
                  }
                }
              }
            }
          }

          this.routeData = route;
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
            this.distance = leg.distance?.text || 'N/A';
            this.duration = leg.duration?.text || 'N/A';
            this.durationInTraffic =
              leg.duration_in_traffic?.text || leg.duration?.text || 'N/A';

            // Calculate tolls
            let tolls = 0;
            if (leg.steps) {
              for (const step of leg.steps) {
                const instructions = step.instructions?.toLowerCase() || '';
                if (
                  instructions.includes('peaje') ||
                  instructions.includes('toll')
                ) {
                  tolls++;
                }
              }
            }
            this.tollsCount = tolls;
            this.routeData = route;
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
}
