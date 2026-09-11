import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ModelOwner } from '../../models/owner-model';
import { SubscriptionPayment } from '../../models/subscription-model';
import { SubscriptionService } from '../../services/subscription.service';
import { ToastService } from '../../services/toast.service';
import { SubscriptionUtils } from '../../utils/subscription';
import { Formatters } from '../../utils/formatters';
import { PaginationUtils } from '../../utils/pagination-utils';
import { paymentMethodName } from '../../utils/payment-methods';
import { GConfirmSheetComponent } from '../g-confirm-sheet/g-confirm-sheet.component';
import { GDocumentViewerComponent } from '../g-document-viewer/g-document-viewer.component';

/** En qué estado está la suscripción de un propietario. */
type SubscriptionState = 'activa' | 'porVencer' | 'vencida' | 'sinFecha';

/** Por qué columna se ordena el detalle. */
type SortField =
  | 'name'
  | 'subscription'
  | 'drivers'
  | 'vehicles'
  | 'trips'
  | 'fee';

/** Una fila del detalle: el propietario y lo que tiene montado encima. */
interface SubscriptionRow {
  id: number | null;
  name: string;
  state: SubscriptionState;
  /** Fecha fin normalizada a `YYYY-MM-DD`, o `null` si no tiene. */
  endDate: string | null;
  /** "Vence en 12 días", "Suscripción vencida"… */
  label: string;
  /** Días restantes; negativo si venció. Ordena la lista. */
  days: number | null;
  vehicles: number;
  /** Tope de vehículos que tiene contratado. `0` si no se le fijó ninguno. */
  maxVehicles: number;
  drivers: number;
  trips: number;
  /** Lo que paga al año por esos vehículos — ver `TARIFA_BASE`. */
  fee: number;
}

/**
 * Estado de las suscripciones de la plataforma. Solo para el administrador.
 *
 * Es la única lectura del tablero que no va de dinero rodando sino del negocio
 * que lo sostiene: cuántos propietarios están al día, a cuántos hay que llamar
 * este mes y cuántos ya se cayeron — y, en cada caso, qué tamaño tiene lo que
 * está en juego, porque no es lo mismo que venza quien tiene un camión que
 * quien tiene doce.
 *
 * **No pide nada.** Todo sale de lo que el tablero ya tiene cargado: el
 * catálogo de propietarios (`subscriptionEndDate`, `vehicleCount`,
 * `driverCount`) y los viajes del periodo, que el reporte agregado ya devuelve
 * agrupados por propietario para el administrador.
 */
@Component({
  selector: 'g-subscriptions-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GConfirmSheetComponent,
    GDocumentViewerComponent,
  ],
  templateUrl: './g-subscriptions-report.component.html',
  styleUrls: ['./g-subscriptions-report.component.scss'],
})
export class GSubscriptionsReportComponent implements OnInit, OnChanges {
  /** El catálogo que el tablero carga para su filtro de propietario. */
  @Input({ required: true }) owners: ModelOwner[] = [];

  /**
   * Viajes del periodo por `id` de propietario. Los saca el tablero de su
   * propio reporte, así que cuentan el mismo periodo que las gráficas: el mes
   * abierto en el panel, o el año si ese es el alcance.
   *
   * Los cuenta por fecha de creación del viaje. No cuadran entonces con el
   * menú de Viajes, que los lista todos sin filtrar por fecha: ahí un
   * propietario con un viaje de agosto y otro de septiembre muestra dos, y
   * aquí muestra uno por mes. La columna se rotula con el periodo por eso.
   */
  @Input({ required: true }) tripsByOwnerId: Record<number, number> = {};

  /** El periodo, solo para rotular de qué son los viajes. */
  @Input({ required: true }) periodLabel: string = '';

  /** Se resolvió un comprobante: el vencimiento de ese propietario cambió y el
   *  tablero tiene que releer su catálogo. */
  @Output() paymentResolved = new EventEmitter<void>();

  public rows: SubscriptionRow[] = [];

  public activas = 0;
  public porVencer = 0;
  public vencidas = 0;
  public sinFecha = 0;

  /** El umbral de aviso, para nombrarlo en la tarjeta en vez de dejarlo
   *  implícito: "por vencerse" no dice cuándo. */
  public readonly warningDays = SubscriptionUtils.WARNING_DAYS;

  /** Estado abierto en el filtro, o `null` para todos. */
  public filter: SubscriptionState | null = null;

  /** Lo escrito en el buscador del detalle. Filtra por nombre y en memoria:
   *  las filas ya estan todas cargadas aqui, no hay consulta que repetir. */
  public searchTerm = '';

  /* ---- Tarifa ------------------------------------------------------------
     La suscripción es anual: una base que ya incluye un vehículo, más un cargo
     por cada uno adicional. Están aquí como constantes con nombre y no
     repartidas por la plantilla porque son el precio del producto: el día que
     suba, se cambia en un sitio y la sección entera cuadra sola. */

  /** Anual, incluye el primer vehículo. */
  public static readonly TARIFA_BASE = 100000;

  /** Anual, por cada vehículo a partir del segundo. */
  public static readonly TARIFA_VEHICULO_ADICIONAL = 40000;

  public readonly tarifaBase = GSubscriptionsReportComponent.TARIFA_BASE;
  public readonly tarifaAdicional =
    GSubscriptionsReportComponent.TARIFA_VEHICULO_ADICIONAL;

  /** Facturación de los que están al día: activas más por vencerse. Es el
   *  ingreso anual que la plataforma tiene hoy en pie. */
  public ingresoVigente = 0;

  /** De lo anterior, lo que vence dentro del umbral de aviso: no está perdido,
   *  pero es lo que hay que salir a renovar este mes. */
  public ingresoPorRenovar = 0;

  /** Lo que dejó de entrar: suscripciones ya vencidas. */
  public ingresoVencido = 0;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    void this.loadPending();
  }

  ngOnChanges(): void {
    this.build();
    this.page = 0;
  }

  /* ======================================================================
     Comprobantes por revisar
     ======================================================================
     Es lo unico de esta seccion que pide datos, y lo unico que actua sobre
     ellos: aprobar renueva la suscripcion del propietario y dispara su aviso.
     Va arriba del todo porque es trabajo pendiente y no una lectura: mientras
     haya un comprobante sin revisar, hay alguien esperando su acceso. */

  public pending: SubscriptionPayment[] = [];
  public loadingPending = false;

  /** El comprobante sobre el que se esta decidiendo, y que se le va a hacer. */
  public actionPayment: SubscriptionPayment | null = null;
  public action: 'confirmar' | 'rechazar' | null = null;
  public rejectReason = '';
  public actionError = '';
  public actionBusy = false;

  /** El comprobante abierto en el visor. */
  public receiptUrl: string | null = null;

  private async loadPending(): Promise<void> {
    this.loadingPending = true;
    try {
      this.pending = await firstValueFrom(
        this.subscriptionService.getPendingPayments(),
      );
    } catch (error) {
      console.error('Error cargando los comprobantes pendientes:', error);
      this.pending = [];
    } finally {
      this.loadingPending = false;
    }
  }

  /** El nombre del propietario. Si el pago no lo trae, sale del catalogo que
   *  el tablero ya tiene cargado. */
  public payerName(payment: SubscriptionPayment): string {
    if (payment.ownerName) return Formatters.titleCase(payment.ownerName);
    const owner = (this.owners ?? []).find((o) => o.id === payment.ownerId);
    return Formatters.titleCase(owner?.name) || 'Propietario';
  }

  public methodName(id: string): string {
    return paymentMethodName(id);
  }

  public openReceipt(payment: SubscriptionPayment): void {
    if (payment.receiptUrl) this.receiptUrl = payment.receiptUrl;
  }

  public askConfirm(payment: SubscriptionPayment): void {
    this.actionPayment = payment;
    this.action = 'confirmar';
    this.rejectReason = '';
    this.actionError = '';
  }

  public askReject(payment: SubscriptionPayment): void {
    this.actionPayment = payment;
    this.action = 'rechazar';
    this.rejectReason = '';
    this.actionError = '';
  }

  public cancelAction(): void {
    if (this.actionBusy) return;
    this.actionPayment = null;
    this.action = null;
    this.rejectReason = '';
    this.actionError = '';
  }

  get actionTitle(): string {
    return this.action === 'rechazar'
      ? '¿Rechazar el comprobante?'
      : '¿Aprobar el pago?';
  }

  get actionMessage(): string {
    if (!this.actionPayment) return '';
    const quien = this.payerName(this.actionPayment);
    return this.action === 'rechazar'
      ? `${quien} vera el motivo en su pantalla y podra enviar otro comprobante.`
      : `Se renueva la suscripcion de ${quien} y se le avisa por WhatsApp.`;
  }

  /**
   * Aprueba o rechaza, segun lo que se haya pedido.
   *
   * El rechazo exige motivo y se valida aqui antes de salir: es lo unico que el
   * propietario va a leer para saber que corregir, y un rechazo sin explicacion
   * lo deja mandando el mismo comprobante otra vez.
   */
  public async submitAction(): Promise<void> {
    const payment = this.actionPayment;
    if (!payment?.id || this.actionBusy) return;

    const motivo = this.rejectReason.trim();
    if (this.action === 'rechazar' && !motivo) {
      this.actionError = 'Escribe el motivo del rechazo.';
      return;
    }

    this.actionBusy = true;
    this.actionError = '';
    try {
      if (this.action === 'rechazar') {
        await firstValueFrom(
          this.subscriptionService.rejectPayment(payment.id, motivo),
        );
        this.toastService.showSuccess(
          'Comprobante rechazado',
          `Se le aviso a ${this.payerName(payment)}.`,
        );
      } else {
        await firstValueFrom(
          this.subscriptionService.confirmPayment(payment.id),
        );
        this.toastService.showSuccess(
          'Pago aprobado',
          `La suscripcion de ${this.payerName(payment)} quedo renovada.`,
        );
      }

      this.actionPayment = null;
      this.action = null;
      this.rejectReason = '';
      await this.loadPending();
      /* El vencimiento del propietario cambio: el detalle de abajo y los
         contadores salen del catalogo del tablero, que hay que releer. */
      this.paymentResolved.emit();
    } catch (error) {
      console.error('Error resolviendo el comprobante:', error);
      this.actionError =
        'No se pudo completar la accion. Intentalo de nuevo en un momento.';
    } finally {
      this.actionBusy = false;
    }
  }

  private build(): void {
    this.rows = (this.owners ?? []).map((o) => {
      const days = SubscriptionUtils.daysRemaining(o.subscriptionEndDate);
      return {
        id: o.id ?? null,
        name: Formatters.titleCase(o.name) || 'Sin nombre',
        state: this.stateOf(o.subscriptionEndDate),
        endDate: SubscriptionUtils.toDateOnly(o.subscriptionEndDate),
        label: SubscriptionUtils.label(o.subscriptionEndDate),
        days,
        vehicles: o.vehicleCount ?? 0,
        maxVehicles: o.maxVehicles ?? 0,
        drivers: o.driverCount ?? 0,
        trips: o.id != null ? (this.tripsByOwnerId[o.id] ?? 0) : 0,
        fee: this.feeOf(o.vehicleCount ?? 0),
      };
    });

    this.applySort();

    this.activas = this.rows.filter((r) => r.state === 'activa').length;
    this.porVencer = this.rows.filter((r) => r.state === 'porVencer').length;
    this.vencidas = this.rows.filter((r) => r.state === 'vencida').length;
    this.sinFecha = this.rows.filter((r) => r.state === 'sinFecha').length;

    const sumaDe = (...estados: SubscriptionState[]) =>
      this.rows
        .filter((r) => estados.includes(r.state))
        .reduce((a, r) => a + r.fee, 0);

    /* Las que no tienen fecha no entran en ninguna de las tres: no se sabe si
       están al día ni si vencieron, y sumarlas como vigentes inflaría la cifra
       con dinero que nadie ha confirmado. */
    this.ingresoVigente = sumaDe('activa', 'porVencer');
    this.ingresoPorRenovar = sumaDe('porVencer');
    this.ingresoVencido = sumaDe('vencida');
  }

  /**
   * Lo que paga un propietario al año.
   *
   * La base ya incluye un vehículo, así que solo se cobran los que pasen del
   * primero. Con cero vehículos registrados paga la base igual: la suscripción
   * es de la cuenta, no del camión.
   */
  private feeOf(vehicles: number): number {
    const adicionales = Math.max(0, vehicles - 1);
    return (
      GSubscriptionsReportComponent.TARIFA_BASE +
      adicionales * GSubscriptionsReportComponent.TARIFA_VEHICULO_ADICIONAL
    );
  }

  /**
   * Los tres estados salen de `SubscriptionUtils`, que es donde vive la regla
   * acordada con el backend —solo la fecha, zona de Bogotá, límite inclusivo—.
   * Repetir aquí la comparación habría abierto la puerta a que la tarjeta del
   * propietario y este contador discreparan en el día del vencimiento.
   */
  private stateOf(endDate: any): SubscriptionState {
    if (SubscriptionUtils.daysRemaining(endDate) === null) return 'sinFecha';
    if (SubscriptionUtils.isExpired(endDate)) return 'vencida';
    if (SubscriptionUtils.isExpiringSoon(endDate)) return 'porVencer';
    return 'activa';
  }

  /** Tocar una tarjeta acota la lista a ese estado; tocarla otra vez la abre
   *  entera. Es el gesto que ya tienen los contadores de propietarios. */
  public toggleFilter(state: SubscriptionState): void {
    this.filter = this.filter === state ? null : state;
    this.page = 0;
  }

  get visibleRows(): SubscriptionRow[] {
    const term = GSubscriptionsReportComponent.normalize(this.searchTerm);
    return this.rows.filter(
      (r) =>
        (!this.filter || r.state === this.filter) &&
        (!term ||
          GSubscriptionsReportComponent.normalize(r.name).includes(term)),
    );
  }

  /** Se busca sin tildes y sin mayusculas: quien escribe "nunez" espera
   *  encontrar a "Nunez" con tilde, que es como suele estar registrado. */
  private static normalize(text: string): string {
    return (text ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase();
  }

  /** Cada tecla puede dejar la pagina actual fuera de rango. */
  public onSearch(): void {
    this.page = 0;
  }

  /* ---- Orden ---------------------------------------------------------------
     Se ordena aqui y no en el servidor por lo mismo que se busca y se pagina
     aqui: las filas ya estan todas en memoria. */

  /**
   * Por omision manda el vencimiento, que es la urgencia: lo vencido arriba y
   * despues lo que esta por caer. Es con lo que se entra a la seccion —a quien
   * hay que llamar—; el resto de columnas responden otras preguntas —quien
   * tiene mas camiones, quien viaja mas, quien factura mas— y se piden
   * tocandolas.
   */
  public sortField: SortField = 'subscription';
  public sortAsc = true;

  public sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      /* Los conteos y la tarifa se leen de mayor a menor —lo gordo primero— y
         el nombre y el vencimiento de menor a mayor: en los dos casos, lo
         primero es lo que se busca. */
      this.sortAsc = field === 'name' || field === 'subscription';
    }
    this.applySort();
    this.page = 0;
  }

  public sortIcon(field: SortField): string {
    if (this.sortField !== field) return 'fa-sort';
    return this.sortAsc ? 'fa-sort-up' : 'fa-sort-down';
  }

  /**
   * Ordena el detalle entero, no la pagina: si ordenara lo que se pinta, cada
   * pagina saldria ordenada por su cuenta y la primera no traeria a los
   * primeros.
   *
   * En los empates manda el nombre, y por eso el orden no depende de en que
   * orden vinieron los propietarios del catalogo: sin fecha son varios, con
   * cero viajes tambien, y la tarifa se repite en todos los que tienen los
   * mismos camiones. `localeCompare` en es-CO para que las tildes y la 'n' no
   * queden al final.
   *
   * Las suscripciones sin fecha van siempre al final, en los dos sentidos: no
   * son ni las mas urgentes ni las que mas lejos quedan, y colarlas en un
   * extremo sugeriria un dato que no existe.
   */
  private applySort(): void {
    const dir = this.sortAsc ? 1 : -1;
    const campo = this.sortField;

    const porNombre = (a: SubscriptionRow, b: SubscriptionRow) =>
      a.name.localeCompare(b.name, 'es-CO', { sensitivity: 'base' });

    this.rows = [...this.rows].sort((a, b) => {
      if (campo === 'name') return dir * porNombre(a, b);

      if (campo === 'subscription') {
        if (a.days === b.days) return porNombre(a, b);
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return dir * (a.days - b.days);
      }

      const av = a[campo];
      const bv = b[campo];
      if (av === bv) return porNombre(a, b);
      return dir * (av - bv);
    });
  }

  /* ---- Paginacion ---------------------------------------------------------
     Las filas se calculan aqui sobre los propietarios que ya tiene el tablero,
     asi que se pagina en memoria: no hay consulta que repetir por pagina. */

  public page = 0;
  public readonly rowsPerPage = 9;

  get totalPages(): number {
    return Math.ceil(this.visibleRows.length / this.rowsPerPage);
  }

  /** Filas de la pagina actual, las que realmente se pintan. */
  get pagedRows(): SubscriptionRow[] {
    const start = this.page * this.rowsPerPage;
    return this.visibleRows.slice(start, start + this.rowsPerPage);
  }

  get desktopPages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 12);
  }

  get mobilePages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 4);
  }

  public changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
    }
  }

  /* ---- Totales de lo que está en juego -----------------------------------
     Un contador de propietarios no dice el tamaño: tres vencidos con un camión
     cada uno y tres con diez son el mismo número y dos problemas distintos. */
  get vehiclesAtRisk(): number {
    return this.rows
      .filter((r) => r.state === 'vencida' || r.state === 'porVencer')
      .reduce((a, r) => a + r.vehicles, 0);
  }

  public badgeClass(state: SubscriptionState): string {
    if (state === 'vencida') return 'bg-danger-subtle text-danger';
    if (state === 'porVencer') return 'bg-warning-subtle text-warning-emphasis';
    if (state === 'activa') return 'bg-success-subtle text-success';
    return 'bg-secondary-subtle text-body-secondary';
  }
}
