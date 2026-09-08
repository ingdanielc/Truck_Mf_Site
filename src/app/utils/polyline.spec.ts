import {
  encodePolyline,
  encodeRoutePath,
  LatLngPoint,
  normalizePoint,
  routePathToPoints,
  simplifyPath,
} from './polyline';

/**
 * Decodificador de referencia, solo para las pruebas: comprueba que lo que se
 * manda al backend se puede volver a leer.
 */
function decodePolyline(encoded: string): LatLngPoint[] {
  const points: LatLngPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const readValue = (): number => {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      return result & 1 ? ~(result >> 1) : result >> 1;
    };

    lat += readValue();
    lng += readValue();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

describe('polyline', () => {
  describe('normalizePoint', () => {
    it('lee el punto con lat/lng como función', () => {
      const point = normalizePoint({ lat: () => 4.711, lng: () => -74.072 });
      expect(point).toEqual({ lat: 4.711, lng: -74.072 });
    });

    it('lee el punto con lat/lng como propiedad', () => {
      expect(normalizePoint({ lat: 4.711, lng: -74.072 })).toEqual({
        lat: 4.711,
        lng: -74.072,
      });
    });

    it('lee el punto envuelto en latLng con latitude/longitude', () => {
      const point = normalizePoint({
        latLng: { latitude: 6.244, longitude: -75.581 },
      });
      expect(point).toEqual({ lat: 6.244, lng: -75.581 });
    });

    it('descarta lo que no es un punto', () => {
      expect(normalizePoint(null)).toBeNull();
      expect(normalizePoint({})).toBeNull();
      expect(normalizePoint({ lat: 4.711 })).toBeNull();
      expect(normalizePoint({ lat: 'norte', lng: -74.072 })).toBeNull();
    });
  });

  describe('routePathToPoints', () => {
    it('omite los puntos que la API no supo entregar', () => {
      const points = routePathToPoints([
        { lat: 1, lng: 2 },
        null,
        { lat: 3 },
        { lat: 4, lng: 5 },
      ]);
      expect(points).toEqual([
        { lat: 1, lng: 2 },
        { lat: 4, lng: 5 },
      ]);
    });

    it('acepta un trazado ausente', () => {
      expect(routePathToPoints(undefined as any)).toEqual([]);
    });
  });

  describe('encodePolyline', () => {
    // Ejemplo publicado en la documentación del formato
    it('codifica el ejemplo de referencia de Google', () => {
      const encoded = encodePolyline([
        { lat: 38.5, lng: -120.2 },
        { lat: 40.7, lng: -120.95 },
        { lat: 43.252, lng: -126.453 },
      ]);
      expect(encoded).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    });

    it('deja la cadena vacía cuando no hay puntos', () => {
      expect(encodePolyline([])).toBe('');
    });

    it('conserva las coordenadas al ida y vuelta', () => {
      const original = [
        { lat: 4.711, lng: -74.072 },
        { lat: 5.0689, lng: -75.5174 },
        { lat: 6.244, lng: -75.581 },
      ];

      const decoded = decodePolyline(encodePolyline(original));

      expect(decoded.length).toBe(original.length);
      decoded.forEach((point, index) => {
        expect(point.lat).toBeCloseTo(original[index].lat, 5);
        expect(point.lng).toBeCloseTo(original[index].lng, 5);
      });
    });

    it('maneja coordenadas negativas y el cruce por cero', () => {
      const original = [
        { lat: -0.2299, lng: -78.5249 },
        { lat: 0.8302, lng: -77.6444 },
      ];

      const decoded = decodePolyline(encodePolyline(original));

      decoded.forEach((point, index) => {
        expect(point.lat).toBeCloseTo(original[index].lat, 5);
        expect(point.lng).toBeCloseTo(original[index].lng, 5);
      });
    });
  });

  describe('simplifyPath', () => {
    it('quita los puntos que no cambian la forma', () => {
      // Tres puntos sobre la misma recta: el del medio no aporta
      const simplified = simplifyPath([
        { lat: 4.0, lng: -74.0 },
        { lat: 4.5, lng: -74.0 },
        { lat: 5.0, lng: -74.0 },
      ]);
      expect(simplified.length).toBe(2);
    });

    it('conserva el punto que sí desvía la ruta', () => {
      // El desvío es de varios kilómetros: muy por encima de la tolerancia
      const simplified = simplifyPath([
        { lat: 4.0, lng: -74.0 },
        { lat: 4.5, lng: -74.2 },
        { lat: 5.0, lng: -74.0 },
      ]);
      expect(simplified.length).toBe(3);
    });

    it('respeta siempre los extremos', () => {
      const points = Array.from({ length: 50 }, (_, index) => ({
        lat: 4 + index * 0.01,
        lng: -74 - index * 0.01,
      }));

      const simplified = simplifyPath(points, 20, 5);

      expect(simplified.length).toBeLessThanOrEqual(5);
      expect(simplified[0]).toEqual(points[0]);
      expect(simplified.at(-1)).toEqual(points.at(-1));
    });

    it('baja un trazado largo hasta el tope de puntos', () => {
      // Zigzag: ninguna simplificación por forma lo reduce, así que entra el recorte parejo
      const points = Array.from({ length: 4000 }, (_, index) => ({
        lat: 4 + index * 0.001 + (index % 2) * 0.02,
        lng: -74 - index * 0.001,
      }));

      expect(simplifyPath(points).length).toBeLessThanOrEqual(1500);
    });

    it('devuelve tal cual los trazados de dos puntos o menos', () => {
      const points = [{ lat: 4, lng: -74 }];
      expect(simplifyPath(points)).toEqual(points);
    });
  });

  describe('encodeRoutePath', () => {
    it('normaliza, simplifica y codifica en un solo paso', () => {
      const path = [
        { lat: () => 4.711, lng: () => -74.072 },
        { latLng: { latitude: 5.0689, longitude: -75.5174 } },
        { lat: 6.244, lng: -75.581 },
      ];

      const decoded = decodePolyline(encodeRoutePath(path));

      expect(decoded.length).toBeGreaterThanOrEqual(2);
      expect(decoded[0].lat).toBeCloseTo(4.711, 5);
      expect(decoded.at(-1)!.lat).toBeCloseTo(6.244, 5);
    });

    it('devuelve cadena vacía sin trazado utilizable', () => {
      expect(encodeRoutePath([])).toBe('');
      expect(encodeRoutePath([{ lat: 4.711, lng: -74.072 }])).toBe('');
      expect(encodeRoutePath(undefined as any)).toBe('');
    });
  });
});
