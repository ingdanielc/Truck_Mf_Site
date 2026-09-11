import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { ToastService } from '../../services/toast.service';
import { NotificationsService } from '../../services/notifications.service';
import { Formatters } from '../../utils/formatters';
import { PaginationUtils } from '../../utils/pagination-utils';
import { applyTripStatusChange } from '../../utils/trip-status';
import { buildXlsx, SHEET_COLORS, xlsxFileName } from '../../utils/xlsx';
import { shareOrDownloadFile } from '../../utils/file-share';
import { GConfirmSheetComponent } from '../g-confirm-sheet/g-confirm-sheet.component';

/** Por qué columna se ordena la lista. */
type SortField = 'company' | 'trip' | 'date' | 'balance';

/** Un viaje entregado y sin cobrar: una deuda de la empresa que lo contrató. */
interface BalanceRow {
  /** El viaje entero: es lo que se manda a guardar al marcarlo pagado. */
  trip: ModelTrip;
  id: number;
  /** Con qué camión se hizo. Es lo que atiende el filtro de vehículo. */
  vehicleId: number | null;
  company: string;
  /** El número con el que se conoce el viaje, ya con almohadilla: "#2". */
  tripNumber: string;
  /** "Cali → Barranquilla". Vacío si no se pudo resolver alguna ciudad. */
  route: string;
  /** Cuándo se creó el viaje. Ordena la lista por omisión. */
  date: Date | null;
  balance: number;
}

/**
 * Saldos pendientes por cobrar: los del propietario, mirados por él mismo o
 * por el administrador que lo eligió en el panel de periodo.
 *
 * Un viaje en "Pendiente" llegó a destino pero no se ha cobrado el saldo del
 * flete: la carga está entregada y la plata sin recibir. Esta pestaña es esa
 * lista de cobro —a quién hay que llamar, desde cuándo y por cuánto— y el
 * sitio donde se cierra: marcar uno como pagado lo pasa a "Completado" con su
 * saldo cobrado, que es justo lo que significa completar un viaje.
 *
 * Van del más antiguo al más reciente porque el orden es la urgencia: lo que
 * lleva tres meses sin cobrarse va primero.
 */
@Component({
  selector: 'g-balances-report',
  standalone: true,
  imports: [CommonModule, GConfirmSheetComponent],
  templateUrl: './g-balances-report.component.html',
  styleUrls: ['./g-balances-report.component.scss'],
})
export class GBalancesReportComponent implements OnChanges {
  /**
   * El usuario en sesion, no el propietario.
   *
   * No son el mismo numero: la cuenta y la ficha de propietario son dos
   * registros, y los vehiculos cuelgan del segundo. El `id` del usuario es lo
   * unico que el tablero tiene a mano, asi que la ficha se resuelve aqui —el
   * mismo camino que hace el listado de viajes—. Pasar el `id` del usuario
   * como si fuera el del propietario devolvia cero vehiculos, y con ellos cero
   * saldos.
   */
  @Input({ required: true }) userId: number | null = null;

  /**
   * La ficha de propietario, cuando quien mira es el administrador.
   *
   * El administrador no es dueño de ningun saldo: los que ve son los del
   * propietario que eligio en el panel de periodo, y de ese propietario el
   * tablero tiene la ficha —no la cuenta—. Asi que llega el `id` de la ficha
   * ya resuelto y el primero de los tres saltos se salta.
   *
   * Manda sobre `userId`: si viene, la lista es de este propietario y la
   * cuenta en sesion no pinta nada.
   */
  @Input() ownerId: number | null = null;

  /**
   * La pestaña está abierta.
   *
   * La lista cuesta tres peticiones y no la mira quien viene por las gráficas,
   * así que no sale a pedirlas hasta que alguien abre la pestaña. Igual que en
   * el reporte de gastos, el componente se oculta en vez de destruirse: ir y
   * volver entre pestañas no vuelve a pedir nada.
   */
  @Input({ required: true }) active = false;

  /**
   * El camión elegido en el panel de periodo, o `null` para toda la flota.
   *
   * Filtra en memoria y no en la consulta: los saldos ya vienen todos, y
   * cambiar de camión es entonces inmediato y sin volver a pedir nada. Es el
   * mismo alcance que ven las gráficas y la rentabilidad — quien acota el
   * tablero a un camión no espera que la lista de cobro hable de otros.
   */
  @Input() vehicleId: number | null = null;

  /** Se cobró un saldo. El tablero recalcula: la utilidad del periodo cambió. */
  @Output() paid = new EventEmitter<void>();

  public rows: BalanceRow[] = [];
  public loading = false;
  public loadError = false;

  /**
   * Fila que se está marcando como pagada. Mientras exista, la confirmación
   * está en pantalla.
   */
  public pendingPaid: BalanceRow | null = null;
  public isSaving = false;

  /* Descarta la respuesta de una carga que otra ya reemplazó: al cambiar de
     propietario las dos consultas quedan en vuelo y la lenta puede llegar
     después. */
  private token = 0;

  /** Hay un propietario pedido que aún no se ha cargado por estar la pestaña
   *  cerrada. Se resuelve en cuanto se abre. */
  private pending = true;

  /** Ciudad por `id`, para armar la ruta. El catálogo lo sirve el servicio
   *  común desde su caché: pedirlo aquí no cuesta una petición nueva. */
  private cityNames = new Map<string, string>();

  constructor(
    private readonly tripService: TripService,
    private readonly ownerService: OwnerService,
    private readonly commonService: CommonService,
    private readonly vehicleService: VehicleService,
    private readonly toastService: ToastService,
    private readonly notificationsService: NotificationsService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    /* Solo cambiar de propietario invalida lo cargado. El camión elegido no:
       se resuelve filtrando lo que ya está en memoria. */
    if (changes['userId'] || changes['ownerId']) this.pending = true;
    if (changes['vehicleId']) this.page = 0;

    if (!this.active || !this.pending) return;
    this.pending = false;
    void this.load();
  }

  /* ======================================================================
     Carga
     ====================================================================== */

  /**
   * Tres saltos: del usuario a su ficha de propietario, de la ficha a sus
   * camiones y de los camiones a los viajes sin cobrar. El viaje cuelga del
   * camion y el camion de su dueño, asi que no hay forma de pedirlos por
   * propietario en una sola consulta. Es el mismo camino que hace el listado
   * de viajes para acotar lo que ve un propietario.
   *
   * Con el administrador son dos: la ficha llega elegida en `ownerId` y el
   * primer salto sobra.
   *
   * Sin filtro de fechas, y a proposito: una deuda no deja de deberse porque
   * el tablero este mirando otro mes. Aqui salen todos los pendientes, del
   * primero al ultimo, sea cual sea el periodo elegido arriba.
   */
  private async load(): Promise<void> {
    const token = ++this.token;

    /* Sin dueño del que hablar no hay lista: ni la ficha que manda el
       administrador ni la cuenta en sesión del propietario. */
    if (this.ownerId == null && this.userId == null) {
      this.apply([]);
      return;
    }

    this.loading = true;
    this.loadError = false;

    try {
      /* La ficha ya resuelta ahorra la primera consulta: es el caso del
         administrador, que elige al propietario en el panel de periodo. */
      const [ownerResp, citiesResp]: any[] = await Promise.all([
        this.ownerId != null
          ? Promise.resolve(null)
          : lastValueFrom(
              this.ownerService.getOwnerFilter(
                new ModelFilterTable(
                  [
                    new Filter(
                      'user.id',
                      '=',
                      (this.userId as number).toString(),
                    ),
                  ],
                  new Pagination(1, 0),
                  new Sort('id', true),
                ),
              ),
            ),
        lastValueFrom(this.commonService.getCities()),
      ]);
      if (token !== this.token) return;

      this.cityNames = new Map(
        (citiesResp?.data ?? []).map((c: any) => [String(c?.id), c?.name]),
      );

      const ownerId: number | null =
        this.ownerId ?? ownerResp?.data?.content?.[0]?.id ?? null;
      if (ownerId == null) {
        this.apply([]);
        return;
      }

      const vehiclesResp: any = await lastValueFrom(
        this.vehicleService.getVehicleOwnerFilter(
          new ModelFilterTable(
            [new Filter('owner.id', '=', ownerId.toString())],
            new Pagination(100, 0),
            new Sort('owner.id', true),
          ),
        ),
      );
      if (token !== this.token) return;

      const vehicleIds: number[] = (vehiclesResp?.data?.content ?? [])
        .map((v: any) => v?.id)
        .filter((id: any): id is number => id != null);

      if (!vehicleIds.length) {
        this.apply([]);
        return;
      }

      /* Sin paginar en el servidor: el total del pie es de toda la deuda y no
         de la página que se está viendo, y pedir página a página lo dejaría
         sin calcular. Son los viajes sin cobrar de un propietario, no un
         histórico. */
      const tripsResp: any = await lastValueFrom(
        this.tripService.getTripFilter(
          new ModelFilterTable(
            [
              new Filter('vehicle.id', 'in', vehicleIds.join(',')),
              new Filter('status', '=', 'Pendiente'),
            ],
            new Pagination(1000, 0),
            new Sort('id', true),
          ),
        ),
      );
      if (token !== this.token) return;

      this.apply(tripsResp?.data?.content ?? []);
    } catch (error) {
      if (token !== this.token) return;
      console.error('Error loading pending balances:', error);
      this.loadError = true;
      this.apply([]);
    } finally {
      if (token === this.token) this.loading = false;
    }
  }

  private apply(trips: ModelTrip[]): void {
    this.rows = (trips ?? [])
      .filter((t) => t?.id != null)
      .map((t) => ({
        trip: t,
        id: t.id as number,
        vehicleId: t.vehicleId ?? t.vehicle?.id ?? null,
        company: Formatters.titleCase(t.company) || 'Sin empresa',
        tripNumber: t.numberTrip ? `#${t.numberTrip}` : '',
        route: this.routeOf(t),
        date: GBalancesReportComponent.dateOf(t),
        balance: t.balance ?? 0,
      }));

    this.applySort();
    this.page = 0;
  }

  /** El nombre de una ciudad por su `id`, para la hoja de cálculo. Vacío si el
   *  catálogo no la tiene: en una columna propia, un `id` suelto no dice nada
   *  y encima se ordenaría entre nombres. */
  private cityLabel(id: string | undefined): string {
    return id ? (this.cityNames.get(String(id)) ?? '') : '';
  }

  /** "Cali → Barranquilla". Si alguna ciudad no está en el catálogo se deja el
   *  hueco en blanco antes que pintar un `id` que no dice nada. */
  private routeOf(trip: ModelTrip): string {
    const origen = this.cityNames.get(String(trip.originId ?? ''));
    const destino = this.cityNames.get(String(trip.destinationId ?? ''));
    if (!origen && !destino) return '';
    return `${origen ?? '—'} → ${destino ?? '—'}`;
  }

  /** Cuándo se creó el viaje. Si el registro no trae fecha de creación se usa
   *  la de salida, que es la que el formulario pide siempre. */
  private static dateOf(trip: ModelTrip): Date | null {
    const raw = trip.creationDate ?? trip.startDate;
    if (!raw) return null;
    const fecha = new Date(raw);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /* ======================================================================
     Cobro
     ====================================================================== */

  /* ======================================================================
     Exportar
     ====================================================================== */

  /** La hoja de confirmación de la exportación está abierta. */
  public exportOpen = false;

  private exportBlob: Blob | null = null;
  private exportName = '';
  public exportCount = 0;

  /**
   * Prepara la exportación y pide confirmación.
   *
   * El archivo se arma aquí, antes de abrir la hoja: los saldos ya están en
   * memoria, así que no cuesta nada, y el toque que confirma queda libre para
   * abrir la hoja de compartir del sistema —en iOS solo se abre con el gesto
   * vivo—. Es el mismo camino que siguen Viajes y Rentabilidad, que sí tienen
   * que ir al servidor y por eso arman el archivo mientras la hoja está en
   * pantalla.
   *
   * Se exporta lo que está en pantalla —`visibleRows`, ya filtrado por el
   * camión elegido—, no la página que se está viendo: quien exporta quiere la
   * lista entera.
   */
  public askExport(): void {
    if (!this.visibleRows.length) return;

    try {
      const filas = this.visibleRows;
      this.exportCount = filas.length;

      /* Las mismas columnas que la hoja de Viajes y en el mismo orden, hasta
         donde llegan: quien abre las dos no tiene que volver a buscar dónde
         está la placa. Origen y destino van separados y no como una ruta en un
         solo texto, para poder filtrar por cualquiera de los dos. */
      this.exportBlob = buildXlsx({
        name: 'Saldos por cobrar',
        headerColor: SHEET_COLORS.saldos,
        columns: [
          { header: 'Viaje', width: 10 },
          { header: 'Manifiesto', width: 16 },
          { header: 'Estado', width: 13 },
          { header: 'Tipo', width: 12 },
          { header: 'Placa', width: 11 },
          { header: 'Conductor', width: 24 },
          { header: 'Empresa', width: 26 },
          { header: 'Origen', width: 24 },
          { header: 'Destino', width: 24 },
          { header: 'Fecha', width: 14, format: 'date' },
          { header: 'Saldo', width: 16, format: 'money' },
        ],
        rows: filas.map((r) => [
          r.tripNumber,
          r.trip.manifestNumber,
          r.trip.status,
          Formatters.titleCase(r.trip.tripType) || 'Cargado',
          Formatters.formatPlate(r.trip.vehiclePlate ?? r.trip.vehicle?.plate),
          Formatters.titleCase(r.trip.driver?.name),
          r.company,
          this.cityLabel(r.trip.originId),
          this.cityLabel(r.trip.destinationId),
          r.date,
          r.balance,
        ]),
        totals: [
          `Total por cobrar (${filas.length})`,
          ...new Array(9).fill(null),
          this.total,
        ],
        notes: [
          'Viajes entregados y sin cobrar.',
          `Generado el ${new Date().toLocaleString('es-CO')}`,
        ],
      });

      this.exportName = xlsxFileName(
        'Saldos por cobrar',
        new Date().toISOString().slice(0, 10),
      );
      this.exportOpen = true;
    } catch (error) {
      console.error('Error preparing balances export:', error);
      this.toastService.showError('Error', 'No se pudo generar el archivo');
    }
  }

  /** Entrega el archivo. Sin nada que esperar antes: el toque que confirma es
   *  el que abre la hoja de compartir del sistema. */
  public confirmExport(): void {
    const blob = this.exportBlob;
    if (!blob) return;

    this.exportOpen = false;
    void shareOrDownloadFile(blob, this.exportName, 'Saldos por cobrar').then(
      (salida) => {
        if (salida === 'failed') {
          this.toastService.showError('Error', 'No se pudo generar el archivo');
        }
      },
    );
  }

  public cancelExport(): void {
    this.exportOpen = false;
    this.exportBlob = null;
  }

  /** Lo que dice la hoja de confirmación: cuántos saldos van en el archivo. */
  get exportMessage(): string {
    return this.exportCount === 1
      ? '1 saldo pendiente'
      : `${this.exportCount} saldos pendientes`;
  }

  /** Las filas del camión elegido, o todas si no hay ninguno. */
  get visibleRows(): BalanceRow[] {
    if (this.vehicleId == null) return this.rows;
    return this.rows.filter((r) => r.vehicleId === this.vehicleId);
  }

  /* ======================================================================
     Orden
     ====================================================================== */

  /**
   * Abre por fecha ascendente: del más antiguo al más reciente, que es el
   * orden en que hay que salir a cobrar. Tocar una columna reordena; tocar la
   * misma invierte el sentido.
   */
  public sortField: SortField = 'date';
  public sortAsc = true;

  public sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      /* El dinero se lee de mayor a menor —lo gordo primero— y el resto de
         menor a mayor: en los dos casos, lo primero es lo que se busca. */
      this.sortAsc = field !== 'balance';
    }
    this.applySort();
    this.page = 0;
  }

  public sortIcon(field: SortField): string {
    if (this.sortField !== field) return 'fa-sort';
    return this.sortAsc ? 'fa-sort-up' : 'fa-sort-down';
  }

  /**
   * Las filas sin dato van siempre al final, en los dos sentidos: un viaje sin
   * fecha no es el más antiguo ni el más reciente, y colarlo en un extremo
   * sugeriría un dato que no existe.
   */
  private applySort(): void {
    const dir = this.sortAsc ? 1 : -1;
    const campo = this.sortField;

    this.rows = [...this.rows].sort((a, b) => {
      if (campo === 'balance') return dir * (a.balance - b.balance);

      if (campo === 'date') {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return dir * (a.date.getTime() - b.date.getTime());
      }

      const av = campo === 'company' ? a.company : a.tripNumber;
      const bv = campo === 'company' ? b.company : b.tripNumber;
      if (!av) return 1;
      if (!bv) return -1;
      /* `numeric` para que "#10" vaya después de "#9" y no antes. */
      return dir * av.localeCompare(bv, 'es-CO', { numeric: true });
    });
  }

  /**
   * Cuántos de los pendientes son de este mes.
   *
   * Separa lo que acaba de entregarse de lo que lleva meses sin cobrarse: dos
   * saldos del mes son gestión normal y dos de marzo son otra cosa. Se mide
   * contra la fecha del viaje, la misma que ordena la lista.
   */
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

  /** Lo que falta por cobrar, de toda la lista y no solo de la página. */
  get total(): number {
    return this.visibleRows.reduce((suma, r) => suma + r.balance, 0);
  }

  public askPaid(row: BalanceRow): void {
    this.pendingPaid = row;
  }

  public cancelPaid(): void {
    if (this.isSaving) return;
    this.pendingPaid = null;
  }

  /** El texto nombra la empresa y la cifra: quien confirma está dando por
   *  recibido un dinero concreto, no cerrando un registro cualquiera. */
  get confirmMessage(): string {
    const row = this.pendingPaid;
    if (!row) return '';
    const monto = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(row.balance);
    return (
      'Se dará por recibido el saldo de ' +
      monto +
      ' de ' +
      row.company +
      '. El viaje pasa a Completado, sale de esta lista y deja de admitir ediciones.'
    );
  }

  /**
   * Marca el saldo como cobrado.
   *
   * Es el mismo cambio de estado que se hace desde el listado de viajes —de
   * ahí que reutilice `applyTripStatusChange`, que además del estado fija el
   * saldo como pagado y la fecha de llegada—. La fila se quita en cuanto el
   * servidor responde: si siguiera en la lista de cobro, se volvería a llamar
   * a quien ya pagó.
   */
  public confirmPaid(): void {
    const row = this.pendingPaid;
    if (!row) return;

    this.isSaving = true;
    this.tripService
      .createTrip(applyTripStatusChange(row.trip, 'Completado'))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.pendingPaid = null;
          this.rows = this.rows.filter((r) => r.id !== row.id);
          this.clampPage();
          this.toastService.showSuccess(
            'Saldos por cobrar',
            'Saldo de ' + row.company + ' registrado como pagado',
          );
          this.notificationsService.refreshNotifications();
          this.paid.emit();
        },
        error: (error: any) => {
          console.error('Error settling trip balance:', error);
          this.isSaving = false;
          this.pendingPaid = null;
          this.toastService.showError(
            'Error',
            'No se pudo registrar el saldo como pagado',
          );
        },
      });
  }

  /* ======================================================================
     Paginación
     ====================================================================== */

  public page = 0;
  public readonly rowsPerPage = 9;

  get totalPages(): number {
    return Math.ceil(this.visibleRows.length / this.rowsPerPage);
  }

  get pagedRows(): BalanceRow[] {
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

  /** Cobrar el último saldo de la última página la deja vacía. */
  private clampPage(): void {
    const ultima = Math.max(0, this.totalPages - 1);
    if (this.page > ultima) this.page = ultima;
  }
}
