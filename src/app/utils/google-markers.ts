/**
 * Marcadores de Google Maps con `AdvancedMarkerElement`, que reemplaza a
 * `google.maps.Marker`, obsoleto desde el 21 de febrero de 2024.
 *
 * Guía de migración:
 * https://developers.google.com/maps/documentation/javascript/advanced-markers/migration
 *
 * Importante: los marcadores avanzados exigen que el mapa se haya creado con
 * un `mapId` (ver `environment.googleMapsMapId`). Sin él no se dibujan.
 */

export interface PinMarkerOptions {
  map: any;
  position: { lat: number; lng: number };
  /** Texto dentro del globo, normalmente una letra */
  glyphText?: string;
  /** Texto al pasar el cursor */
  title?: string;
  background?: string;
  borderColor?: string;
  glyphColor?: string;
}

/**
 * Crea un globo con letra.
 */
export async function createPinMarker(options: PinMarkerOptions): Promise<any> {
  const maps = (globalThis as any).google?.maps;
  if (typeof maps?.importLibrary !== 'function') return null;

  try {
    const { AdvancedMarkerElement, PinElement } =
      await maps.importLibrary('marker');

    const background = options.background ?? '#dc3545';
    const pin = new PinElement({
      background: background,
      borderColor: options.borderColor ?? background,
      glyphColor: options.glyphColor ?? '#ffffff',
      glyphText: options.glyphText ?? '',
    });

    return new AdvancedMarkerElement({
      map: options.map,
      position: options.position,
      title: options.title,
      content: pin.element,
    });
  } catch (error) {
    console.error('No se pudo crear el marcador avanzado:', error);
    return null;
  }
}

/** Quita un marcador del mapa, sea avanzado o de la clase anterior. */
export function removeMarker(marker: any): void {
  if (!marker) return;
  if (typeof marker.setMap === 'function') marker.setMap(null);
  else marker.map = null;
}
