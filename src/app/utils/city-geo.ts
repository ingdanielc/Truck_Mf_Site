/**
 * Consulta de ubicacion para Google Maps a partir del catalogo de ciudades.
 *
 * El catalogo es casi todo colombiano, asi que el pais no viene en un campo
 * propio: se sobreentiende, y cada pantalla anexaba ", Colombia" al nombre.
 * Las ciudades de frontera son la excepcion y ponen el pais donde pueden: en
 * el departamento —Tulcan esta guardada como "Tulcán / Ecuador"— o pegado al
 * nombre. Anexarles Colombia mandaba la ruta a un punto equivocado.
 *
 * `locationQuery` recibe el mismo texto que la pantalla ya venia armando: si
 * la ciudad es colombiana devuelve exactamente la consulta de antes, y solo
 * la reescribe cuando encuentra otro pais.
 */

/** Pais que se asume cuando la ciudad no nombra otro. */
export const DEFAULT_COUNTRY = 'Colombia';

/** Paises que pueden aparecer en el catalogo, por su forma normalizada. */
const COUNTRIES = new Map<string, string>([
  ['colombia', 'Colombia'],
  ['ecuador', 'Ecuador'],
  ['venezuela', 'Venezuela'],
  ['peru', 'Perú'],
  ['brasil', 'Brasil'],
  ['brazil', 'Brasil'],
  ['panama', 'Panamá'],
  ['chile', 'Chile'],
  ['argentina', 'Argentina'],
  ['bolivia', 'Bolivia'],
  ['paraguay', 'Paraguay'],
  ['uruguay', 'Uruguay'],
  ['mexico', 'México'],
  ['costa rica', 'Costa Rica'],
]);

/** Codigos ISO por si el catalogo llegara a traerlos en vez del nombre. */
const COUNTRY_CODES = new Map<string, string>([
  ['co', 'Colombia'],
  ['ec', 'Ecuador'],
  ['ve', 'Venezuela'],
  ['pe', 'Perú'],
  ['br', 'Brasil'],
  ['pa', 'Panamá'],
  ['cl', 'Chile'],
  ['ar', 'Argentina'],
  ['bo', 'Bolivia'],
  ['py', 'Paraguay'],
  ['uy', 'Uruguay'],
  ['mx', 'México'],
  ['cr', 'Costa Rica'],
]);

/**
 * Articulos que delatan que el pais es en realidad parte del nombre: "La
 * Argentina" es un municipio del Huila, no el pais.
 */
const ARTICLES = new Set(['la', 'el', 'las', 'los', 'de', 'del']);

/**
 * Un pais fuera de la lista se acepta solo si parece un nombre. Asi un campo
 * con un id —"57"— no termina dentro de la consulta.
 */
const COUNTRY_NAME = /^[\p{L}][\p{L}\s.'-]*$/u;

/** Minusculas y sin tildes: el catalogo escribe "Perú", "Peru" y "PERU". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Los tramos de "Tulcan - Ecuador" o de "Ipiales (Nariño)". */
function splitSegments(text: string): string[] {
  return text
    .replace(/[()]/g, ',')
    .split(/[-,/]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

/** El pais que nombra un texto, o `null` si no nombra ninguno. */
function countryFrom(text: string): string | null {
  const key = normalize(text);
  if (!key) return null;
  return (
    COUNTRIES.get(key) ??
    (key.length === 2 ? COUNTRY_CODES.get(key) : null) ??
    null
  );
}

/**
 * Separa el pais del texto de una ciudad. `parts` es lo que queda —el nombre
 * y, si venia, la provincia—, en el mismo orden.
 */
function splitCountry(text: string): {
  parts: string[];
  country: string | null;
} {
  const segments = splitSegments(text);
  if (segments.length === 0) return { parts: [], country: null };

  const [first, ...rest] = segments;
  const parts: string[] = [];
  let country: string | null = null;

  for (const segment of rest) {
    const match = countryFrom(segment);
    if (match && !country) country = match;
    else parts.push(segment);
  }
  if (country) return { parts: [first, ...parts], country };

  // Sin separador el pais queda pegado al nombre: "Tulcan Ecuador". Solo
  // cuenta como pais si cierra el nombre y no lo introduce un articulo.
  const words = first.split(/\s+/);
  for (const size of [2, 1]) {
    if (words.length <= size) continue;
    const match = countryFrom(words.slice(-size).join(' '));
    const previous = normalize(words[words.length - size - 1]);
    if (match && !ARTICLES.has(previous)) {
      return {
        parts: [words.slice(0, -size).join(' '), ...parts],
        country: match,
      };
    }
  }

  return { parts: [first, ...parts], country: null };
}

/** Une los tramos sin repetir ninguno: "Ecuador, Ecuador" no le sirve a Google. */
function joinParts(parts: string[]): string {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of parts) {
    const value = part.trim();
    if (!value) continue;
    const key = normalize(value);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result.join(', ');
}

/**
 * El pais de una ciudad del catalogo, mirando —en ese orden— su campo de
 * pais, el nombre y el departamento. `null` si no lo nombra en ninguno.
 */
export function cityCountry(city: any): string | null {
  if (!city) return null;

  const explicit = city.country ?? city.countryName ?? city.countryCode;
  if (explicit) {
    // El campo puede venir como texto, como objeto del catalogo o como id.
    const text = String(explicit?.name ?? explicit).trim();
    const known = countryFrom(text);
    // Un id ("57") no dice nada del pais: se ignora y se mira el nombre
    if (known) return known;
    if (COUNTRY_NAME.test(text)) return text;
  }

  return (
    splitCountry(String(city.name ?? '')).country ??
    countryFrom(String(city.state ?? ''))
  );
}

/**
 * Consulta de ubicacion para Google Maps.
 *
 * `base` es el texto de la ciudad tal como lo arma la pantalla —el nombre
 * solo, o con el departamento—. En una ciudad colombiana la consulta es la
 * misma de siempre: `base` mas ", Colombia". Solo cuando la ciudad resulta de
 * otro pais se le quita el pais al texto y se pone el que corresponde.
 */
export function locationQuery(base: string, city?: any): string {
  const text = String(base ?? '').trim();
  if (!text) return '';

  const country = cityCountry(city) ?? splitCountry(text).country;
  if (!country || normalize(country) === normalize(DEFAULT_COUNTRY)) {
    return `${text}, ${DEFAULT_COUNTRY}`;
  }

  return joinParts([...splitCountry(text).parts, country]);
}
