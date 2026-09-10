/**
 * La suscripción del propietario: lo que paga, hasta cuándo y por qué esa
 * cifra.
 *
 * El backend cotiza y el frontend solo presenta: el precio no se calcula aquí
 * —el desglose llega ya sumado desde `/subscription/quote/{ownerId}`— para que
 * la pantalla y la factura no puedan discrepar el día que la tarifa cambie.
 */

/** Un renglón del desglose: "Suscripción anual", "Vehículo adicional". */
export interface SubscriptionQuoteItem {
  /** Cómo se llama el cobro en la factura. */
  concept: string;
  /** Cuántas unidades. `null` en los renglones que no se cuentan. */
  quantity: number | null;
  /** Lo que cuesta cada una. `null` cuando el renglón va sin unitario. */
  unitPrice: number | null;
  /** Lo que suma el renglón al total. */
  amount: number;
}

/** Lo que hay que pagar para renovar, y el estado del que se renueva. */
export interface SubscriptionQuote {
  ownerId: number | null;
  /** "Plan anual". */
  planName: string;
  /** Inicio del periodo vigente, en `YYYY-MM-DD`. */
  startDate: string | null;
  /** Vencimiento del periodo vigente, en `YYYY-MM-DD`. */
  endDate: string | null;
  /** Vehículos registrados hoy, que son los que se están cobrando. */
  vehicleCount: number;
  /** Tope del plan. `null` cuando no hay tope declarado. */
  maxVehicles: number | null;
  /**
   * El propietario está en el plan gratuito.
   *
   * `null` cuando el backend no lo dice y hay que deducirlo del histórico de
   * pagos —ver `isFreePlan` en la pantalla—. Si algún día la cotización lo
   * declara, esa deducción deja de usarse.
   */
  isFree: boolean | null;
  items: SubscriptionQuoteItem[];
  /** Lo que se paga. Llega sumado del backend, no se recalcula. */
  total: number;
}

/** En qué va el comprobante que el propietario envió. */
export type SubscriptionPaymentStatus =
  | 'PENDIENTE'
  | 'CONFIRMADO'
  | 'RECHAZADO';

/** Un pago reportado por el propietario. */
export interface SubscriptionPayment {
  id: number | null;
  /** De quién es el pago. Lo necesita la bandeja del administrador, donde los
   *  comprobantes de todos los propietarios llegan juntos. */
  ownerId: number | null;
  /** Cómo se llama ese propietario, si el endpoint lo manda. */
  ownerName: string | null;
  amount: number;
  status: SubscriptionPaymentStatus;
  /** Con qué se pagó: Nequi o Bancolombia. */
  method: string;
  /** El comprobante, tal como quedó subido. */
  receiptUrl: string | null;
  /** Número de la transferencia, si el propietario lo escribió. */
  reference: string | null;
  /** Años que cubre el pago. Uno, salvo que se hayan renovado varios de una. */
  years: number;
  /** Cuándo se reportó. */
  creationDate: string | null;
  /** Por qué se rechazó. Solo viene en los rechazados. */
  rejectionReason: string | null;
}

/** Lo que se manda a `/subscription/payment` al reportar un pago. */
export interface SubscriptionPaymentRequest {
  ownerId: number;
  /**
   * Años que se están pagando, de 1 a 3.
   *
   * Va aparte del monto y no deducido de él: el administrador confirma la
   * renovación por este número, y dividir el total entre la tarifa para
   * adivinarlo se rompería el día que la tarifa cambie a mitad de periodo.
   */
  years: number;
  amount: number;
  method: string;
  /** URL que devolvió `/common/upload-document`. */
  receiptUrl: string;
  reference?: string | null;
}
