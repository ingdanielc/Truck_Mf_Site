import { Formatters } from './formatters';

/**
 * A dónde se transfiere la suscripción.
 *
 * Está aquí, y no repartido por la plantilla, porque son los datos de una
 * cuenta real: el día que cambie el número se toca en un solo sitio y la
 * pantalla entera queda al día. Cambiarlo no requiere tocar componentes.
 */

/** Un medio de pago con su cuenta. */
export interface PaymentMethod {
  /** Con lo que se identifica el pago al reportarlo. */
  id: 'NEQUI' | 'BANCOLOMBIA';
  name: string;
  /**
   * Enlace que abre la aplicación en el celular.
   *
   * Solo se intenta en móvil: en escritorio no hay aplicación que abrir y el
   * navegador mostraría un error por un esquema que no conoce.
   */
  appUrl?: string;
  /** `fa-solid fa-…`, el ícono de la tarjeta. */
  icon: string;
  /** "Número", "Cuenta de ahorros"… lo que rotula el dato de abajo. */
  accountLabel: string;
  /** El número al que se transfiere, ya con los espacios de lectura. */
  account: string;
  /** A nombre de quién está la cuenta. */
  holder: string;
}

/**
 * La cuenta a la que se transfiere.
 *
 * TODO(negocio): confirmar `account` y `holder`, y verificar `appUrl` en un
 * celular. Mientras el número sea de ejemplo, la pantalla funciona pero cobra a
 * una cuenta que no existe.
 */
export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: 'NEQUI',
    name: 'Nequi',
    icon: 'fa-solid fa-mobile-screen-button',
    accountLabel: 'Número',
    account: '314 723 5739',
    holder: 'Daniel Castro S.',
    appUrl: 'nequi://',
  },
];

/**
 * Con qué se reporta el pago.
 *
 * No se pregunta: la pantalla ofrece una sola cuenta, así que preguntar por el
 * medio era un campo con una única respuesta posible. Se manda este valor.
 */
export const REPORTED_PAYMENT_METHOD = 'Nequi';

/** El número tal como se pega en la aplicación del banco: solo dígitos. */
export function accountDigits(method: PaymentMethod | null): string {
  return (method?.account ?? '').replace(/\D/g, '');
}

/**
 * El método por su `id`, para nombrarlo en el histórico de pagos.
 *
 * El histórico puede traer métodos que ya no se ofrecen —un pago viejo por
 * Bancolombia—, así que un `id` desconocido se muestra tal cual y no se
 * descarta: es lo que el propietario transfirió.
 */
export function paymentMethodName(id: string | null | undefined): string {
  const clave = (id ?? '').toUpperCase();
  const metodo = PAYMENT_METHODS.find((m) => m.id === clave);
  if (metodo) return metodo.name;
  return Formatters.titleCase(id) || 'Transferencia';
}
