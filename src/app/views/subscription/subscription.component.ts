import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, distinctUntilChanged, firstValueFrom } from 'rxjs';
import { SecurityService } from '../../services/security/security.service';
import { OwnerService } from '../../services/owner.service';
import { SubscriptionService } from '../../services/subscription.service';
import { ModelOwner } from '../../models/owner-model';
import {
  SubscriptionPayment,
  SubscriptionQuote,
} from '../../models/subscription-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';
import { SubscriptionUtils } from '../../utils/subscription';
import { paymentMethodName } from '../../utils/payment-methods';
import { GSubscriptionRenewComponent } from '../../components/g-subscription-renew/g-subscription-renew.component';

/** En qué estado está la suscripción. Mismo criterio que el tablero. */
type SubscriptionState = 'activa' | 'porVencer' | 'vencida' | 'sinFecha';

/**
 * Mi suscripción. Solo para el propietario.
 *
 * Es la única pantalla que habla del trato entre el propietario y la
 * plataforma, y no de camiones: hasta cuándo tiene acceso, cuánto cuesta
 * seguir y por dónde se paga. El conductor no paga y el administrador cobra —a
 * él lo suyo le llega por la bandeja de pendientes—, así que la vista es de un
 * solo rol.
 *
 * **No calcula el precio.** El total sale de `/subscription/quote`, cotizado
 * con los vehículos que el propietario tiene hoy. La tarifa vive en el
 * backend y esta pantalla no la conoce.
 */
@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule, GSubscriptionRenewComponent],
  templateUrl: './subscription.component.html',
  styleUrls: ['./subscription.component.scss'],
})
export class SubscriptionComponent implements OnInit, OnDestroy {
  public owner: ModelOwner | null = null;
  public quote: SubscriptionQuote | null = null;
  public payments: SubscriptionPayment[] = [];

  public loading = true;
  public loadError = false;

  /** El histórico de pagos se pudo leer. Ver `isFreePlan`. */
  private paymentsLoaded = false;

  /** El panel de renovación está abierto. */
  public showRenew = false;

  private userSub?: Subscription;

  constructor(
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  ngOnInit(): void {
    this.userSub = this.securityService.userData$
      .pipe(
        distinctUntilChanged((prev: any, curr: any) => prev?.id === curr?.id),
      )
      .subscribe((user: any) => {
        if (user?.id) void this.load(user.id);
      });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  /* ======================================================================
     Carga
     ====================================================================== */

  /**
   * La ficha de propietario, la cotización y el histórico.
   *
   * El `id` del usuario no es el del propietario —son dos registros
   * distintos—, así que primero hay que resolver la ficha; de ella cuelga todo
   * lo demás. La cotización y el histórico se piden juntos: son dos endpoints
   * independientes y encadenarlos solo sumaría espera.
   */
  private async load(userId: number): Promise<void> {
    this.loading = true;
    this.loadError = false;

    try {
      const ownerResp: any = await firstValueFrom(
        this.ownerService.getOwnerFilter(
          new ModelFilterTable(
            [new Filter('user.id', '=', userId.toString())],
            new Pagination(1, 0),
            new Sort('id', true),
          ),
        ),
      );

      this.owner = ownerResp?.data?.content?.[0] ?? null;
      const ownerId = this.owner?.id;
      if (!ownerId) {
        this.loadError = true;
        return;
      }

      this.paymentsLoaded = true;
      const [quote, payments] = await Promise.all([
        firstValueFrom(this.subscriptionService.getQuote(ownerId)),
        firstValueFrom(
          this.subscriptionService.getOwnerPayments(ownerId),
        ).catch(() => {
          /* El histórico es un extra sobre la pantalla, así que no la tumba.
               Pero sin él no se puede afirmar que nadie ha pagado nunca, que
               es de donde se deduce el plan gratuito. */
          this.paymentsLoaded = false;
          return [] as SubscriptionPayment[];
        }),
      ]);

      this.quote = quote;
      this.payments = payments;
    } catch (error) {
      console.error('Error cargando la suscripción:', error);
      this.loadError = true;
    } finally {
      this.loading = false;
    }
  }

  /** Se reportó un pago: el histórico cambió y hay que volver a leerlo. */
  public onRenewClosed(reported: boolean): void {
    this.showRenew = false;
    if (!reported) return;

    const userId = this.securityService.getUserData()?.id;
    if (userId) void this.load(userId);
  }

  /* ======================================================================
     Estado
     ====================================================================== */

  /**
   * El vencimiento que manda.
   *
   * La cotización lo trae, pero el catálogo de propietarios también, y es el
   * que ya alimenta el resto de la aplicación. Se prefiere el de la cotización
   * —viene del mismo cálculo que el precio— y se cae al de la ficha cuando el
   * endpoint no lo mande.
   */
  get endDate(): string | null {
    return (
      this.quote?.endDate ??
      SubscriptionUtils.toDateOnly(this.owner?.subscriptionEndDate)
    );
  }

  /**
   * Desde cuándo corre la suscripción.
   *
   * Si la cotización no trae la fecha de inicio se usa la de creación de la
   * cuenta, que es cuando empezó a contar el primer periodo: el propietario ve
   * una fecha cierta en vez de un hueco, y sigue siendo la suya.
   */
  get startDate(): string | null {
    return (
      this.quote?.startDate ??
      SubscriptionUtils.toDateOnly(this.owner?.creationDate)
    );
  }

  get state(): SubscriptionState {
    const fecha = this.endDate;
    if (SubscriptionUtils.daysRemaining(fecha) === null) return 'sinFecha';
    if (SubscriptionUtils.isExpired(fecha)) return 'vencida';
    if (SubscriptionUtils.isExpiringSoon(fecha)) return 'porVencer';
    return 'activa';
  }

  get stateLabel(): string {
    if (this.state === 'vencida') return 'Vencida';
    if (this.state === 'porVencer') return 'Por vencer';
    if (this.state === 'activa') return 'Activa';
    return 'Sin fecha';
  }

  /** "Vence en 12 días", "Suscripción vencida"… */
  get expiryLabel(): string {
    return SubscriptionUtils.label(this.endDate);
  }

  get stateClass(): string {
    if (this.state === 'vencida') return 'bg-danger-subtle text-danger';
    if (this.state === 'porVencer')
      return 'bg-warning-subtle text-warning-emphasis';
    if (this.state === 'activa') return 'bg-success-subtle text-success';
    return 'bg-secondary-subtle text-body-secondary';
  }

  get planName(): string {
    return this.quote?.planName || 'Plan anual';
  }

  /**
   * El propietario está en el plan gratuito.
   *
   * Lo dice el backend si lo manda —por bandera o por el nombre del plan—. Si
   * no lo dice, se deduce del histórico: quien nunca ha tenido un pago
   * confirmado no ha comprado nada y está usando el acceso gratuito.
   *
   * La deducción exige que el histórico haya llegado. Si esa consulta falló, se
   * prefiere no afirmar nada: tratar a un propietario que paga como si fuera
   * gratuito le cambiaría la pantalla entera por un fallo de red.
   */
  get isFreePlan(): boolean {
    if (this.quote?.isFree != null) return this.quote.isFree;
    if (!this.paymentsLoaded) return false;
    return !this.payments.some((p) => p.status === 'CONFIRMADO');
  }

  /** En el plan gratuito no hay nada que renovar todavía: hay que elegir. */
  get renewLabel(): string {
    return this.isFreePlan ? 'Ver planes' : 'Renovar suscripción';
  }

  get renewalPrice(): number {
    return this.quote?.total ?? 0;
  }

  /** Los vehículos por los que se está cobrando. */
  get vehicleCount(): number {
    return this.quote?.vehicleCount || this.owner?.vehicleCount || 0;
  }

  /* ---- Lo que incluye el plan ---------------------------------------------
     Se lee aquí, en la pantalla, y no dentro del panel de renovación: es la
     descripción del producto y se consulta en cualquier momento, no solo al
     ir a pagar. El panel se queda con lo que hace falta para pagar. */

  /** La oferta, tal cual. No es una capacidad que la aplicación consulte. */
  private readonly features: string[] = [
    'Gestión de viajes',
    'Control de gastos',
    'Control de mantenimientos',
    'Reportes de rentabilidad y gastos',
    'Reportes exportables a Excel',
    'Notificaciones y alertas',
  ];

  /**
   * La lista como se lee en pantalla.
   *
   * Abre con los vehículos porque es el único renglón que cambia de un
   * propietario a otro —y el que explica su factura—, y sigue con los
   * conductores: primero de qué tamaño es la flota que se administra y
   * después, lo que se hace con ella.
   */
  get planFeatures(): string[] {
    return [this.vehiclesFeature, 'Administrar conductores', ...this.features];
  }

  /**
   * El renglón de vehículos de la lista.
   *
   * La cifra es la de cada propietario —los camiones que tiene registrados—,
   * que es también por los que se le está cobrando: la suscripción crece con
   * la flota, así que un número fijo en la oferta contradiría la factura.
   *
   * Nunca baja de uno: la tarifa base incluye un vehículo, así que quien
   * todavía no ha registrado ninguno tiene uno a su disposición y "hasta 0"
   * no diría nada cierto.
   */
  get vehiclesFeature(): string {
    const incluidos = Math.max(1, this.vehicleCount);
    return `Administrar hasta ${incluidos} ${
      incluidos === 1 ? 'vehículo' : 'vehículos'
    }`;
  }

  /* ======================================================================
     Pagos
     ====================================================================== */

  /**
   * El comprobante que está esperando revisión.
   *
   * Mientras exista, el botón de renovar cede el sitio al aviso: mandar un
   * segundo comprobante del mismo periodo no adelanta nada y deja al
   * administrador con dos pagos que cuadrar.
   */
  get pendingPayment(): SubscriptionPayment | null {
    return this.payments.find((p) => p.status === 'PENDIENTE') ?? null;
  }

  /**
   * Se puede renovar: hay plan cargado y ningún comprobante esperando revisión.
   *
   * Lo consultan el botón del encabezado y el flotante de móvil, que son el
   * mismo botón en dos tamaños de pantalla y tienen que aparecer y
   * desaparecer juntos.
   */
  get canRenew(): boolean {
    return !this.loading && !this.loadError && !this.pendingPayment;
  }

  /** El último rechazo, que es lo que explica por qué sigue sin renovarse. */
  get lastRejected(): SubscriptionPayment | null {
    return this.payments.find((p) => p.status === 'RECHAZADO') ?? null;
  }

  public methodName(id: string): string {
    return paymentMethodName(id);
  }

  /**
   * Lo que se pagó en ese reporte.
   *
   * Se prefiere el monto que devuelve el backend. Si vuelve en cero —el
   * registro no lo guardó— se muestra el cotizado por los años de ese pago, que
   * es lo que el propietario tenía que transferir: un "$ 0" en su histórico se
   * lee como que su comprobante no valió nada.
   */
  public paymentAmount(payment: SubscriptionPayment): number {
    if (payment.amount > 0) return payment.amount;
    return this.renewalPrice * Math.max(1, payment.years);
  }

  public paymentClass(status: string): string {
    if (status === 'CONFIRMADO') return 'bg-success-subtle text-success';
    if (status === 'RECHAZADO') return 'bg-danger-subtle text-danger';
    return 'bg-warning-subtle text-warning-emphasis';
  }

  public paymentLabel(status: string): string {
    if (status === 'CONFIRMADO') return 'Confirmado';
    if (status === 'RECHAZADO') return 'Rechazado';
    return 'En revisión';
  }
}
