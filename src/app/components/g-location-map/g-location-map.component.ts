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
import { createPinMarker, removeMarker } from 'src/app/utils/google-markers';
import { ModelDriverLocation } from 'src/app/models/location-model';
import { environment } from 'src/environments/environment';

declare var globalThis: any;

/**
 * Dónde está el vehículo: un punto en el mapa con la última ubicación que
 * reportó el conductor.
 *
 * Es un solo punto, no un recorrido: responde "¿dónde quedó el camión?", que es
 * lo que se pregunta desde la ficha del vehículo. El recorrido de un viaje vive
 * en el detalle del viaje, que es el que sabe a qué trayecto pertenece.
 *
 * El padre decide si hay algo que mostrar: sin ubicación, este componente no se
 * pinta.
 */
@Component({
  selector: 'g-location-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-location-map.component.html',
  styleUrls: ['./g-location-map.component.scss'],
})
export class GLocationMapComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) location: ModelDriverLocation | null = null;

  @ViewChild('map') mapElement?: ElementRef<HTMLDivElement>;

  private mapInstance: any = null;
  private marker: any = null;
  private requestId = 0;

  /** El SDK de Maps lo carga el shell: puede no estar listo al pintar. */
  private readonly SDK_RETRIES = 20;
  private readonly SDK_RETRY_MS = 250;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['location']) void this.render();
  }

  ngOnDestroy(): void {
    this.requestId++;
    this.clearMarker();
  }

  /** La ubicación sirve si trae coordenadas; sin ellas no hay punto que pintar. */
  get position(): { lat: number; lng: number } | null {
    const lat = Number(this.location?.latitude);
    const lng = Number(this.location?.longitude);
    if (!this.location || Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  }

  get addressText(): string {
    return this.location?.addressText || 'Ubicación sin dirección';
  }

  private async render(): Promise<void> {
    const currentRequest = ++this.requestId;
    const position = this.position;
    if (!position) return;

    const element = await this.waitForMapElement();
    if (!element || currentRequest !== this.requestId) return;

    this.clearMarker();
    this.mapInstance = new globalThis.google.maps.Map(element, {
      center: position,
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      /* Sin `mapId` los marcadores avanzados no se dibujan. */
      mapId: environment.googleMapsMapId,
    });

    this.marker = await createPinMarker({
      map: this.mapInstance,
      position: position,
      title: this.addressText,
      background: '#0d6efd',
      glyphColor: '#ffffff',
    });
  }

  private async waitForMapElement(): Promise<HTMLDivElement | null> {
    for (let intento = 0; intento < this.SDK_RETRIES; intento++) {
      const element = this.mapElement?.nativeElement;
      if (element && globalThis.google?.maps?.Map) return element;
      await new Promise((resolve) => setTimeout(resolve, this.SDK_RETRY_MS));
    }
    return null;
  }

  private clearMarker(): void {
    removeMarker(this.marker);
    this.marker = null;
  }
}
