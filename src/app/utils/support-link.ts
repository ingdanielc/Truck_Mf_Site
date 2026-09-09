import { Formatters } from './formatters';

/**
 * El enlace de soporte por WhatsApp, con el saludo ya escrito.
 *
 * Vive aquí y no en cada pantalla porque el enlace está en dos sitios —el
 * inicio y el menú lateral— y son el mismo botón: si el saludo se escribe dos
 * veces, tarde o temprano uno de los dos se queda sin cambiar y el soporte
 * recibe dos mensajes distintos según por dónde entró el usuario.
 */

/** El celular de soporte. */
const SUPPORT_PHONE = '573147235739';

/** Cómo se nombra cada rol dentro del mensaje. */
const ROLE_LABELS: Record<string, string> = {
  ADMINISTRADOR: 'administrador',
  PROPIETARIO: 'propietario',
  CONDUCTOR: 'conductor',
};

/**
 * El saludo dice quién escribe y desde qué rol.
 *
 * Los mensajes llegaban todos iguales y el primer intercambio se iba en
 * averiguar de qué cuenta venía y si quien escribía era el dueño del camión o
 * el que lo maneja, que no piden lo mismo ni se les responde igual.
 *
 * Sin nombre ni rol —la sesión todavía no ha resuelto al usuario— se manda el
 * saludo de siempre: un "Soy ," con el hueco vacío se lee como un error de la
 * aplicación.
 */
export function supportWhatsappUrl(
  name?: string | null,
  role?: string | null,
): string {
  const quien = [
    Formatters.titleCase(name),
    ROLE_LABELS[(role ?? '').toUpperCase()] ?? '',
  ]
    .filter(Boolean)
    .join(', ');

  const mensaje =
    'Hola Ing. Daniel, te escribo desde la app CashTruck.' +
    (quien ? ` Soy ${quien}.` : '') +
    ' Necesito soporte.';

  return `https://wa.me/${SUPPORT_PHONE}?text=${encodeURIComponent(mensaje)}`;
}
