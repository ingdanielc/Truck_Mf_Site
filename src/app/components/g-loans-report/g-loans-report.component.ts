import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';
import { ModelTrip } from '../../models/trip-model';
import { TripService } from '../../services/trip.service';
import { OwnerService } from '../../services/owner.service';
import { CommonService } from '../../services/common.service';
import { VehicleService } from '../../services/vehicle.service';
import { DriverService } from '../../services/driver.service';
import { Formatters } from '../../utils/formatters';
import { PaginationUtils } from '../../utils/pagination-utils';

/** Por qué columna se ordena la lista. */
type SortField = 'company' | 'trip' | 'date' | 'loan';

/** Un viaje cuyos gastos pasaron del anticipo: alguien puso la diferencia. */
interface LoanRow {
  id: number;
  /** Con qué camión se hizo. Es lo que atiende el filtro de vehículo. */
  vehicleId: number | null;
  company: string;
  /** Placa y número, como en Rentabilidad: "ABC123 #2". Ordena la columna
   *  Viaje. */
  label: string;
  /** "Cali → Barranquilla". Vacío si no se pudo resolver alguna ciudad. */
  route: string;
  /** Cuándo se creó el viaje. Ordena la lista por omisión. */
  date: Date | null;
  advance: number;
  expenses: number;
  /** Lo que se tuvo que prestar: gastos menos anticipo. */
  loan: number;
}

/**
 * Préstamos: viajes con saldo sin cobrar cuyos gastos superaron el anticipo.
 *
 * Mientras el saldo no se cobra, lo que hay para gastar es el anticipo. Si los
 * gastos lo pasaron, la diferencia la puso alguien —el conductor la pidió o
 * el propietario la prestó— y esta pestaña deja constancia de cuánto fue.
 *
 * Solo informa: no tiene acciones. El viaje sale de la lista cuando se cobra
 * su saldo, porque desde ese momento se dispone del flete completo y el
 * faltante deja de existir.
 *
 * Es la misma carga que Saldos —mismos candidatos, mismos roles, mismo filtro
 * de camión—, con una condición más: `totalExpenses > advancePayment`. El
 * total de gastos lo trae el propio `/trip/filter` (tipos 1, 2 y 3, sin
 * mantenimiento).
 */
@Component({
  selector: 'g-loans-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-loans-report.component.html',
  styleUrls: ['./g-loans-report.component.scss'],
})
export class GLoansReportComponent implements OnChanges {
  /** El usuario en sesión, no el propietario. Ver `GBalancesReportComponent`. */
  @Input({ required: true }) userId: number | null = null;

  /** La ficha de propietario elegida por el administrador. Manda sobre
   *  `userId`. */
  @Input() ownerId: number | null = null;

  /** Quien mira es conductor: los camiones son los que tiene asignados. */
  @Input() asDriver = false;

  /** La pestaña está abierta. No se carga nada hasta que alguien la abre. */
  @Input({ required: true }) active = false;

  /** El camión elegido en el panel de periodo, o `null` para toda la flota. */
  @Input() vehicleId: number | null = null;

  /**
   * Lo que el tablero necesita para volver a quedar como estaba al regresar
   * del detalle de un viaje: año y mes, y con el administrador también el
   * propietario elegido.
   */
  @Input() returnParams: Record<string, number> | null = null;

  /**
   * Cambia cuando algo por fuera invalida la lista —se cobró un saldo en la
   * pestaña de Saldos—: el viaje cobrado ya no es un préstamo pendiente.
   */
  @Input() reloadKey = 0;

  public rows: LoanRow[] = [];
  public loading = false;
  public loadError = false;

  /* Descarta la respuesta de una carga que otra ya reemplazó. */
  private token = 0;

  /** Hay una carga pedida que espera a que se abra la pestaña. */
  private pending = true;

  private cityNames = new Map<string, string>();

  constructor(
    private readonly tripService: TripService,
    private readonly ownerService: OwnerService,
    private readonly commonService: CommonService,
    private readonly vehicleService: VehicleService,
    private readonly router: Router,
    private readonly driverService: DriverService,
  ) {}

  /** Abre el detalle del viaje y deja la vuelta a esta pestaña. */
  public openTrip(row: LoanRow): void {
    if (row?.id == null) return;
    this.router.navigate(['/site/trips', row.id], {
      queryParams: {
        from: 'dashboard',
        tab: 'prestamos',
        ...(this.returnParams ?? {}),
      },
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['userId'] ||
      changes['ownerId'] ||
      changes['asDriver'] ||
      changes['reloadKey']
    ) {
      this.pending = true;
    }
    if (changes['vehicleId']) this.page = 0;

    if (!this.active || !this.pending) return;
    this.pending = false;
    void this.load();
  }

  /* ======================================================================
     Carga
     ====================================================================== */

  /**
   * Los mismos saltos que Saldos: de la cuenta a la ficha, de la ficha a los
   * camiones y de los camiones a los viajes sin cobrar. Sin filtro de fechas:
   * un préstamo sigue ahí sea cual sea el periodo elegido arriba.
   */
  private async load(): Promise<void> {
    const token = ++this.token;

    if (this.ownerId == null && this.userId == null) {
      this.apply([]);
      return;
    }

    this.loading = true;
    this.loadError = false;

    try {
      const [vehicleIds, citiesResp]: [number[] | null, any] =
        await Promise.all([
          this.asDriver ? this.driverVehicleIds() : this.ownerVehicleIds(),
          lastValueFrom(this.commonService.getCities()),
        ]);
      if (token !== this.token) return;

      this.cityNames = new Map(
        (citiesResp?.data ?? []).map((c: any) => [String(c?.id), c?.name]),
      );

      if (!vehicleIds?.length) {
        this.apply([]);
        return;
      }

      /* Dos consultas y no un `in` sobre el estado, como en Saldos. */
      const [pendientes, enCurso]: any[] = await Promise.all(
        ['Pendiente', 'En Curso'].map((estado) =>
          lastValueFrom(
            this.tripService.getTripFilter(
              new ModelFilterTable(
                [
                  new Filter('vehicle.id', 'in', vehicleIds.join(',')),
                  new Filter('status', '=', estado),
                ],
                new Pagination(1000, 0),
                new Sort('id', true),
              ),
            ),
          ),
        ),
      );
      if (token !== this.token) return;

      this.apply([
        ...(pendientes?.data?.content ?? []),
        ...(enCurso?.data?.content ?? []).filter(
          (t: ModelTrip) => (t?.balance ?? 0) > 0,
        ),
      ]);
    } catch (error) {
      if (token !== this.token) return;
      console.error('Error loading loans:', error);
      this.loadError = true;
      this.apply([]);
    } finally {
      if (token === this.token) this.loading = false;
    }
  }

  private async ownerVehicleIds(): Promise<number[] | null> {
    let ownerId = this.ownerId;
    if (ownerId == null) {
      const ownerResp: any = await lastValueFrom(
        this.ownerService.getOwnerFilter(
          new ModelFilterTable(
            [new Filter('user.id', '=', String(this.userId))],
            new Pagination(1, 0),
            new Sort('id', true),
          ),
        ),
      );
      ownerId = ownerResp?.data?.content?.[0]?.id ?? null;
    }
    if (ownerId == null) return null;

    const vehiclesResp: any = await lastValueFrom(
      this.vehicleService.getVehicleOwnerFilter(
        new ModelFilterTable(
          [new Filter('owner.id', '=', ownerId.toString())],
          new Pagination(100, 0),
          new Sort('owner.id', true),
        ),
      ),
    );
    return GLoansReportComponent.idsOf(vehiclesResp);
  }

  private async driverVehicleIds(): Promise<number[] | null> {
    if (this.userId == null) return null;
    const driverResp: any = await lastValueFrom(
      this.driverService.getDriverFilter(
        new ModelFilterTable(
          [new Filter('user.id', '=', this.userId.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
    );
    const driverId = driverResp?.data?.content?.[0]?.id;
    if (driverId == null) return null;

    const vehiclesResp: any = await lastValueFrom(
      this.vehicleService.getVehicleFilter(
        new ModelFilterTable(
          [new Filter('currentDriverId', '=', driverId.toString())],
          new Pagination(100, 0),
          new Sort('id', true),
        ),
      ),
    );
    return GLoansReportComponent.idsOf(vehiclesResp);
  }

  private static idsOf(resp: any): number[] {
    return (resp?.data?.content ?? [])
      .map((v: any) => v?.id)
      .filter((id: any): id is number => id != null);
  }

  /**
   * Solo quedan los viajes cuyos gastos pasaron del anticipo. Un viaje sin
   * anticipo entra con cualquier gasto: todo lo que se gastó lo puso alguien.
   */
  private apply(trips: ModelTrip[]): void {
    this.rows = (trips ?? [])
      .filter((t) => t?.id != null)
      .map((t) => {
        const advance = t.advancePayment ?? 0;
        const expenses = t.totalExpenses ?? 0;
        return {
          id: t.id as number,
          vehicleId: t.vehicleId ?? t.vehicle?.id ?? null,
          company: Formatters.titleCase(t.company) || 'Sin empresa',
          label: [
            Formatters.formatPlate(t.vehiclePlate ?? t.vehicle?.plate),
            t.numberTrip ? `#${t.numberTrip}` : '',
          ]
            .filter(Boolean)
            .join(' '),
          route: this.routeOf(t),
          date: GLoansReportComponent.dateOf(t),
          advance,
          expenses,
          loan: expenses - advance,
        };
      })
      .filter((r) => r.loan > 0);

    this.applySort();
    this.page = 0;
  }

  private routeOf(trip: ModelTrip): string {
    const origen = this.cityNames.get(String(trip.originId ?? ''));
    const destino = this.cityNames.get(String(trip.destinationId ?? ''));
    if (!origen && !destino) return '';
    return `${origen ?? '—'} → ${destino ?? '—'}`;
  }

  private static dateOf(trip: ModelTrip): Date | null {
    const raw = trip.creationDate ?? trip.startDate;
    if (!raw) return null;
    const fecha = new Date(raw);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /** Las filas del camión elegido, o todas si no hay ninguno. */
  get visibleRows(): LoanRow[] {
    if (this.vehicleId == null) return this.rows;
    return this.rows.filter((r) => r.vehicleId === this.vehicleId);
  }

  /* ======================================================================
     Orden
     ====================================================================== */

  public sortField: SortField = 'date';
  public sortAsc = true;

  public sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      /* El dinero de mayor a menor; el resto de menor a mayor. */
      this.sortAsc = field !== 'loan';
    }
    this.applySort();
    this.page = 0;
  }

  public sortIcon(field: SortField): string {
    if (this.sortField !== field) return 'fa-sort';
    return this.sortAsc ? 'fa-sort-up' : 'fa-sort-down';
  }

  /** Las filas sin dato van siempre al final, en los dos sentidos. */
  private applySort(): void {
    const dir = this.sortAsc ? 1 : -1;
    const campo = this.sortField;

    this.rows = [...this.rows].sort((a, b) => {
      if (campo === 'loan') return dir * (a.loan - b.loan);

      if (campo === 'date') {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return dir * (a.date.getTime() - b.date.getTime());
      }

      const av = campo === 'company' ? a.company : a.label;
      const bv = campo === 'company' ? b.company : b.label;
      if (!av) return 1;
      if (!bv) return -1;
      return dir * av.localeCompare(bv, 'es-CO', { numeric: true });
    });
  }

  /** Cuántos de los préstamos son de viajes de este mes. */
  get currentMonthCount(): number {
    const hoy = new Date();
    return this.visibleRows.filter(
      (r) =>
        r.date &&
        r.date.getMonth() === hoy.getMonth() &&
        r.date.getFullYear() === hoy.getFullYear(),
    ).length;
  }

  /** El mes en curso, con inicial mayúscula: "Septiembre". */
  get currentMonthLabel(): string {
    const nombre = new Date().toLocaleDateString('es-CO', { month: 'long' });
    return nombre.charAt(0).toUpperCase() + nombre.slice(1);
  }

  /** Lo prestado en total, de toda la lista y no solo de la página. */
  get total(): number {
    return this.visibleRows.reduce((suma, r) => suma + r.loan, 0);
  }

  /* ======================================================================
     Paginación
     ====================================================================== */

  public page = 0;
  public readonly rowsPerPage = 9;

  get totalPages(): number {
    return Math.ceil(this.visibleRows.length / this.rowsPerPage);
  }

  get pagedRows(): LoanRow[] {
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
}
