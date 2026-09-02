import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelOwner } from '../../models/owner-model';
import { SubscriptionUtils } from '../../utils/subscription';
import { Formatters } from '../../utils/formatters';

/** En qué estado está la suscripción de un propietario. */
type SubscriptionState = 'activa' | 'porVencer' | 'vencida' | 'sinFecha';

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
  imports: [CommonModule],
  templateUrl: './g-subscriptions-report.component.html',
  styleUrls: ['./g-subscriptions-report.component.scss'],
})
export class GSubscriptionsReportComponent implements OnChanges {
  /** El catálogo que el tablero carga para su filtro de propietario. */
  @Input({ required: true }) owners: ModelOwner[] = [];

  /** Viajes del periodo por `id` de propietario. Los saca el tablero de su
   *  propio reporte, así que cuentan el mismo periodo que las gráficas. */
  @Input({ required: true }) tripsByOwnerId: Record<number, number> = {};

  /** El periodo, solo para rotular de qué son los viajes. */
  @Input({ required: true }) periodLabel: string = '';

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

  ngOnChanges(): void {
    this.build();
  }

  private build(): void {
    this.rows = (this.owners ?? [])
      .map((o) => {
        const days = SubscriptionUtils.daysRemaining(o.subscriptionEndDate);
        return {
          id: o.id ?? null,
          name: Formatters.titleCase(o.name) || 'Sin nombre',
          state: this.stateOf(o.subscriptionEndDate),
          endDate: SubscriptionUtils.toDateOnly(o.subscriptionEndDate),
          label: SubscriptionUtils.label(o.subscriptionEndDate),
          days,
          vehicles: o.vehicleCount ?? 0,
          drivers: o.driverCount ?? 0,
          trips: o.id != null ? (this.tripsByOwnerId[o.id] ?? 0) : 0,
          fee: this.feeOf(o.vehicleCount ?? 0),
        };
      })
      /* Lo más urgente arriba: primero lo vencido (días negativos), después lo
         que está por caer. Sin fecha va al final — no hay nada que atender. */
      .sort((a, b) => {
        if (a.days === null) return 1;
        if (b.days === null) return -1;
        return a.days - b.days;
      });

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
  }

  get visibleRows(): SubscriptionRow[] {
    if (!this.filter) return this.rows;
    return this.rows.filter((r) => r.state === this.filter);
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
