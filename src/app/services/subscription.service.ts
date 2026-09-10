import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  SubscriptionPayment,
  SubscriptionPaymentRequest,
  SubscriptionPaymentStatus,
  SubscriptionQuote,
  SubscriptionQuoteItem,
} from '../models/subscription-model';

/**
 * La suscripción del propietario: cuánto debe, cómo la paga y en qué va el
 * comprobante que envió.
 *
 * **Todo lo que llega se normaliza aquí.** El resto de la aplicación lee los
 * modelos de `subscription-model.ts` y no los nombres del backend: si un campo
 * llega con otro nombre, se ajusta en este archivo y ninguna plantilla se
 * entera. Por eso cada lectura acepta varios nombres —el contrato se afinó
 * contra un backend que aún estaba escribiéndose— y ninguna deja el valor en
 * `undefined`: una cifra ausente sale en cero y una fecha ausente en `null`,
 * que es lo que las pantallas saben pintar.
 */
@Injectable({
  providedIn: 'root',
})
export class SubscriptionService {
  private readonly basePath = environment._APIUrl + '/subscription';

  constructor(private readonly http: HttpClient) {}

  /** Lo que el propietario tiene que pagar para renovar, ya desglosado. */
  getQuote(ownerId: number): Observable<SubscriptionQuote> {
    return this.http
      .get<any>(`${this.basePath}/quote/${ownerId}`)
      .pipe(map((resp) => SubscriptionService.toQuote(resp, ownerId)));
  }

  /**
   * Reporta el pago con el comprobante ya subido.
   *
   * El archivo no viaja aquí: se sube antes con `/common/upload-document`, que
   * devuelve la URL, y es esa URL la que se registra. Así el comprobante queda
   * guardado aunque el registro del pago falle, y reintentar no vuelve a subir
   * los cinco megas.
   */
  registerPayment(payload: SubscriptionPaymentRequest): Observable<any> {
    return this.http.post<any>(`${this.basePath}/payment`, payload);
  }

  /** Los pagos que el propietario ha reportado, del más reciente al más viejo. */
  getOwnerPayments(ownerId: number): Observable<SubscriptionPayment[]> {
    return this.http
      .get<any>(`${this.basePath}/payments/owner/${ownerId}`)
      .pipe(
        map((resp) =>
          SubscriptionService.toPayments(resp).sort(
            SubscriptionService.byRecency,
          ),
        ),
      );
  }

  /* ======================================================================
     Administrador
     ====================================================================== */

  /** Los comprobantes que esperan revisión, de todos los propietarios. */
  getPendingPayments(): Observable<SubscriptionPayment[]> {
    return this.http
      .get<any>(`${this.basePath}/payments/pending`)
      .pipe(map((resp) => SubscriptionService.toPayments(resp)));
  }

  /** Aprueba el pago: el backend renueva la suscripción y avisa por WhatsApp. */
  confirmPayment(paymentId: number): Observable<any> {
    return this.http.post<any>(
      `${this.basePath}/payment/${paymentId}/confirm`,
      {},
    );
  }

  /**
   * Rechaza el pago con su motivo, que es obligatorio.
   *
   * El motivo no es burocracia: es lo único que el propietario ve para saber
   * qué corregir antes de volver a mandar el comprobante.
   */
  rejectPayment(paymentId: number, reason: string): Observable<any> {
    return this.http.post<any>(`${this.basePath}/payment/${paymentId}/reject`, {
      reason,
    });
  }

  /* ======================================================================
     Normalización
     ====================================================================== */

  /** El primero de los nombres que traiga un valor utilizable. */
  private static pick(source: any, ...keys: string[]): any {
    for (const key of keys) {
      const value = source?.[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  /** A número, o cero: una cifra en blanco no puede dejar el total en `NaN`. */
  private static toNumber(value: any): number {
    const amount = Number(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(amount) ? amount : 0;
  }

  /** A `YYYY-MM-DD`, que es como se comparan y se pintan las fechas aquí. */
  private static toDateOnly(value: any): string | null {
    if (!value) return null;
    const iso = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
    if (iso) return iso[0];
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
  }

  private static toQuote(resp: any, ownerId: number): SubscriptionQuote {
    const data = resp?.data ?? resp ?? {};

    const renglones =
      SubscriptionService.pick(
        data,
        'items',
        'details',
        'breakdown',
        'lines',
      ) ?? [];

    const items: SubscriptionQuoteItem[] = (
      Array.isArray(renglones) ? renglones : []
    ).map((item: any) => ({
      concept:
        SubscriptionService.pick(item, 'concept', 'description', 'name') ??
        'Suscripción',
      quantity: SubscriptionService.pick(item, 'quantity', 'units', 'count'),
      unitPrice: SubscriptionService.pick(item, 'unitPrice', 'price'),
      amount: SubscriptionService.toNumber(
        SubscriptionService.pick(item, 'amount', 'value', 'subtotal', 'total'),
      ),
    }));

    /* El total lo manda el backend. Solo si no viniera se suma el desglose: es
       la misma cifra, pero calculada aquí ya no sería la que se va a cobrar. */
    const totalCrudo = SubscriptionService.pick(
      data,
      'total',
      'totalAmount',
      'amount',
      'amountToPay',
    );
    const total =
      totalCrudo != null
        ? SubscriptionService.toNumber(totalCrudo)
        : items.reduce((suma, item) => suma + item.amount, 0);

    const maxVehicles = SubscriptionService.pick(
      data,
      'maxVehicles',
      'vehicleLimit',
      'includedVehicles',
    );

    /* La bandera manda; si no viene, el nombre del plan también lo delata
       cuando el backend lo llama "Gratis" o "Free". Sin ninguna de las dos
       queda en `null` y lo resuelve la pantalla con el histórico de pagos. */
    const banderaGratis = SubscriptionService.pick(
      data,
      'isFree',
      'free',
      'isTrial',
      'trial',
    );
    const nombrePlan =
      SubscriptionService.pick(data, 'planName', 'plan', 'name') ??
      'Plan anual';
    const nombreGratis = /gratis|free|gratuit/i.test(nombrePlan);

    let isFree: boolean | null = null;
    if (banderaGratis != null) {
      isFree = banderaGratis === true || String(banderaGratis) === 'true';
    } else if (nombreGratis) {
      isFree = true;
    }

    return {
      ownerId: SubscriptionService.pick(data, 'ownerId') ?? ownerId,
      isFree,
      planName: nombrePlan,
      startDate: SubscriptionService.toDateOnly(
        SubscriptionService.pick(
          data,
          'startDate',
          'subscriptionStartDate',
          'currentStartDate',
        ),
      ),
      endDate: SubscriptionService.toDateOnly(
        SubscriptionService.pick(
          data,
          'endDate',
          'subscriptionEndDate',
          'currentEndDate',
        ),
      ),
      vehicleCount: SubscriptionService.toNumber(
        SubscriptionService.pick(data, 'vehicleCount', 'vehicles', 'quantity'),
      ),
      maxVehicles: maxVehicles != null ? Number(maxVehicles) : null,
      items,
      total,
    };
  }

  /**
   * Del más reciente al más viejo.
   *
   * El orden no es cosmético. La pantalla del propietario lee el primero para
   * saber en qué quedó su último comprobante, y el endpoint no promete ningún
   * orden: si devuelve los pagos como se le ocurra, un rechazo viejo pasa por
   * ser el último y el aviso rojo se queda puesto aunque el envío siguiente ya
   * se haya confirmado.
   *
   * Cuando falta la fecha manda el id, que también crece con el tiempo.
   */
  private static byRecency(
    a: SubscriptionPayment,
    b: SubscriptionPayment,
  ): number {
    const fecha = (p: SubscriptionPayment): number | null => {
      const instante = p.creationDate
        ? new Date(p.creationDate).getTime()
        : NaN;
      return Number.isNaN(instante) ? null : instante;
    };

    const primera = fecha(a);
    const segunda = fecha(b);
    if (primera !== null && segunda !== null && primera !== segunda) {
      return segunda - primera;
    }
    return (b.id ?? 0) - (a.id ?? 0);
  }

  private static toPayments(resp: any): SubscriptionPayment[] {
    const data = resp?.data ?? resp;
    const lista = data?.content ?? data ?? [];

    return (Array.isArray(lista) ? lista : []).map((p: any) => ({
      id: SubscriptionService.pick(p, 'id', 'paymentId'),
      ownerId:
        SubscriptionService.pick(p, 'ownerId') ??
        SubscriptionService.pick(p?.owner, 'id'),
      ownerName:
        SubscriptionService.pick(p, 'ownerName') ??
        SubscriptionService.pick(p?.owner, 'name'),
      amount: SubscriptionService.toNumber(
        SubscriptionService.pick(
          p,
          'amount',
          'amountPaid',
          'paidAmount',
          'value',
          'total',
          'totalAmount',
        ),
      ),
      status: SubscriptionService.toStatus(
        SubscriptionService.pick(p, 'status', 'state', 'paymentStatus'),
      ),
      method:
        SubscriptionService.pick(p, 'method', 'paymentMethod', 'channel') ?? '',
      receiptUrl: SubscriptionService.pick(
        p,
        'receiptUrl',
        'fileUrl',
        'voucherUrl',
        'documentUrl',
      ),
      reference: SubscriptionService.pick(
        p,
        'reference',
        'referenceNumber',
        'transactionId',
      ),
      years: Math.max(
        1,
        SubscriptionService.toNumber(
          SubscriptionService.pick(p, 'years', 'periods', 'yearsPaid'),
        ) || 1,
      ),
      creationDate: SubscriptionService.pick(
        p,
        'creationDate',
        'createdAt',
        'paymentDate',
        'reportDate',
      ),
      rejectionReason: SubscriptionService.pick(
        p,
        'rejectionReason',
        'reason',
        'observations',
      ),
    }));
  }

  /**
   * Los tres estados del pago.
   *
   * Se aceptan también en inglés: el endpoint es nuevo y el nombre del estado
   * es lo que más suele cambiar entre lo acordado y lo desplegado. Lo que no
   * se reconoce cae en pendiente, que es el estado que no promete nada.
   */
  private static toStatus(value: any): SubscriptionPaymentStatus {
    const estado = String(value ?? '')
      .toUpperCase()
      .trim();

    if (['CONFIRMADO', 'CONFIRMED', 'APPROVED', 'APROBADO'].includes(estado)) {
      return 'CONFIRMADO';
    }
    if (['RECHAZADO', 'REJECTED', 'DENIED'].includes(estado)) {
      return 'RECHAZADO';
    }
    return 'PENDIENTE';
  }
}
