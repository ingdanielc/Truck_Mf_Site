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
import { ReportService } from '../../services/report.service';
import { TripService } from '../../services/trip.service';
import { CommonService } from '../../services/common.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';
import { ModelTrip } from '../../models/trip-model';
import {
  DashboardGroup,
  DashboardGroupTrip,
  DashboardGroupTrips,
  DashboardMonth,
} from '../../models/dashboard-report-model';

/** Un vehículo del selector. */
interface VehicleOption {
  /** `key` del reporte (`vehicle:8`). Es lo que pide el Endpoint B. */
  key: string;
  plate: string;
}

/** Una fila de la tabla de utilidad por viaje. */
interface TripRow {
  /** `id` del viaje: es por donde se le pega el destino de regreso. */
  id: number;
  label: string;
  /** Ciudades de la ruta, ya resueltas a nombre y unidas con flechas. Se
   *  rearma cuando llegan el catálogo de ciudades o el tramo de regreso, que
   *  viajan aparte del reporte. */
  route: string;
  originId?: string;
  destinationId?: string;
  /** Tercera parada del viaje redondo. La trae `/trip/filter`: el reporte
   *  agregado no la devuelve. */
  returnDestinationId?: string;
  monthLabel: string;
  income: number;
  expenses: number;
  profit: number;
  /** `null` cuando el flete es cero: dividir por cero no da 0%, no da nada. */
  margin: number | null;
}

type SortField = 'label' | 'income' | 'expenses' | 'profit' | 'margin';

/**
 * Reporte de rentabilidad de un vehículo. Solo para propietario y conductor.
 *
 * Responde la pregunta del negocio —¿este camión deja plata?— en los tres
 * niveles que la definen: el año, el mes y el viaje. Vive aparte de la sección
 * de Gráficos, que es comparativa —rankea vehículos entre sí— y no baja al
 * viaje salvo tras tocar una barra.
 *
 * **Un propietario o un conductor puede tener varios vehículos**, y la utilidad
 * de una flota no responde por ninguno de sus camiones: el encabezado elige uno,
 * o "Todos" para el total de la flota. Son dos preguntas distintas —cuánto dejó
 * lo mío, y cuál de ellos lo dejó—, y por eso conviven en el mismo selector.
 *
 * El administrador no lo ve — su tablero agrupa por propietario, una dimensión
 * que este reporte no usa.
 *
 * Se alimenta de los mismos endpoints de reportes que el tablero, y solo de
 * ellos:
 *
 *   Endpoint A (`/reports/dashboard?groupBy=vehicle`) — los doce meses de cada
 *     vehículo en alcance. De aquí salen el selector y las cuatro cifras.
 *   Endpoint B (`/reports/dashboard/groups/{key}/trips`) — el detalle viaje a
 *     viaje del periodo. De aquí sale la tabla.
 *
 * El periodo no lo elige: se lo pasa el tablero desde su control de arriba.
 */
@Component({
  selector: 'g-profitability-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-profitability-report.component.html',
  styleUrls: ['./g-profitability-report.component.scss'],
})
export class GProfitabilityReportComponent implements OnChanges {
  public loading = true;
  public loadError = false;

  /* ---- Qué se mira: lo fijan los dos controles del tablero -------------- */

  /**
   * El periodo y el vehículo los mandan los controles de arriba, los mismos
   * que mueven las nueve gráficas: el reporte no tiene selectores propios.
   *
   * Tuvo los dos, y con ellos era posible dejar la rentabilidad en agosto y en
   * un camión mientras las gráficas de abajo mostraban septiembre y la flota
   * entera — dos lecturas distintas en una misma pantalla, que es exactamente
   * lo que el tablero ya había resuelto cuando quitó el selector de cada
   * tarjeta.
   */
  @Input({ required: true }) year: number = new Date().getFullYear();

  /** Mes a mostrar, o `ANIO` para los doce. Lo traduce `reportMonth` del
   *  tablero desde su panel de periodo. */
  @Input({ required: true }) month: number = new Date().getMonth();

  /**
   * `key` del vehículo a mostrar (`vehicle:8`), o `null` para la flota entera.
   * Es la misma llave que el tablero indexa del reporte, así que las dos
   * secciones filtran por el mismo camión sin traducir nada.
   */
  @Input() vehicleKey: string | null = null;

  /**
   * Propietario del que responde el reporte, o `null` para que el alcance
   * salga del token.
   *
   * Solo lo manda el administrador, que ve a todos: sin acotar, el reporte
   * traería los vehículos de la plataforma entera y "la utilidad" no sería de
   * nadie. Propietario y conductor no lo usan — su alcance ya viene resuelto.
   */
  @Input() ownerId: number | null = null;

  /**
   * Los `id` de los vehículos que el reporte acaba de cargar.
   *
   * Existe por el administrador: su tablero agrupa por propietario, así que no
   * sabe qué camiones tiene el que eligió, y la sección de gastos los necesita
   * para acotar su consulta. Este reporte sí los sabe —pide `groupBy=vehicle`
   * con el `ownerId`—, y pasarlos hacia arriba evita que el tablero repita esa
   * misma petición solo para enterarse.
   */
  @Output() vehiclesLoaded = new EventEmitter<number[]>();

  /** El valor de `month` que significa "los doce meses". */
  public readonly ANIO = -1;

  private readonly monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  private readonly monthNamesShort = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
  ];

  /** Los vehículos del usuario, para traducir `vehicleKey` a placa y para
   *  recorrerlos cuando se mira la flota entera. Quién los ofrece y cuál está
   *  elegido es cosa del tablero. */
  public vehicles: VehicleOption[] = [];

  /** Los doce meses de cada vehículo, por `key`. Índice 0 = enero. */
  private monthsByKey = new Map<string, DashboardMonth[]>();

  /* ---- Las cuatro cifras principales ------------------------------------ */

  public income = 0;
  /* Las dos cubetas del gasto. Ya no se pintan por separado —la tarjeta de
     Gastos las da sumadas—, pero se siguen calculando aparte porque es lo que
     el reporte devuelve y lo que hace verificable el total. */
  private tripExpenses = 0;
  private otherExpenses = 0;
  public expenses = 0;
  public profit = 0;
  /** `null` sin ingresos: no existe rentabilidad sobre cero. */
  public margin: number | null = null;
  public tripCount = 0;

  public avgIncome = 0;
  public avgExpense = 0;
  public avgProfit = 0;

  /* ---- Utilidad por viaje ----------------------------------------------- */

  public tripRows: TripRow[] = [];
  public detailLoading = false;
  public detailError = false;

  /** Gastos del periodo que no cuelgan de ningún viaje: mantenimiento y
   *  sueltos. Van al pie de la tabla, no a sus filas, porque no hay viaje al
   *  que imputarlos — y sin mostrarlos la tabla no cerraría en la utilidad. */
  public unassignedExpenses = 0;

  public sortField: SortField = 'profit';
  public sortAsc = false;

  /** Respuestas del Endpoint B ya recibidas, por vehículo y periodo. */
  private readonly detailCache = new Map<string, DashboardGroupTrips>();

  /** Descarta la respuesta de una petición que ya quedó atrás: con varios
   *  vehículos se puede cambiar de camión antes de que vuelva la anterior. */
  private detailToken = 0;

  constructor(
    private readonly reportService: ReportService,
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
  ) {}

  /**
   * Reacciona al periodo del tablero. Es también la carga inicial: `ngOnChanges`
   * corre antes que `ngOnInit` y ya trae los dos valores.
   *
   * Cambiar de año recarga —el reporte cubre un año a la vez—; cambiar de mes,
   * o pasar del mes al año completo, se resuelve sobre lo que ya está en
   * memoria y solo vuelve a pedir el detalle viaje a viaje.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.citiesAsked) this.loadCities();
    if (changes['year'] || changes['ownerId']) {
      void this.load();
      return;
    }
    if (changes['month'] || changes['vehicleKey']) {
      this.recompute();
      void this.refreshDetail();
    }
  }

  /* ======================================================================
     Carga
     ====================================================================== */

  /**
   * Carga el año: un Endpoint A agrupado por vehículo.
   *
   * El alcance sale del token, así que el propietario recibe sus vehículos y
   * el conductor los que maneja — sean uno o sean seis. La petición es la
   * misma que hace el tablero para estos dos roles; se repite aquí para que
   * las dos secciones no queden acopladas, y son ~10 KB comprimidos.
   */
  public async load(): Promise<void> {
    this.loading = true;
    this.loadError = false;
    try {
      const report = await lastValueFrom(
        this.reportService.getDashboard({
          year: this.year,
          groupBy: 'vehicle',
          ownerId: this.ownerId,
        }),
      );
      this.indexReport(report?.groups ?? []);
    } catch (error) {
      console.error('Error cargando el reporte de rentabilidad:', error);
      this.loadError = true;
      this.clear();
    } finally {
      this.loading = false;
    }
    this.recompute();
    await this.refreshDetail();
  }

  /**
   * Normaliza el reporte: los doce meses de cada vehículo indexados por mes y
   * el selector en orden de placa.
   *
   * Un mes que el backend omita queda en cero, no ausente: los cálculos leen
   * los doce por índice y un hueco los rompería.
   */
  private indexReport(groups: DashboardGroup[]): void {
    this.monthsByKey = new Map();
    this.vehicles = [];
    this.detailCache.clear();

    (groups ?? []).forEach((g) => {
      const key = g?.key?.trim();
      const plate = (g?.label ?? g?.plates?.[0] ?? '').trim();
      if (!key || !plate) return;

      const meses: DashboardMonth[] = Array.from(
        { length: 12 },
        (_, month) => ({
          month,
          activity: false,
          freight: 0,
          tripsByType: {},
          tripExpenses: 0,
          expensesByType: {},
        }),
      );
      (g.months ?? []).forEach((m) => {
        if (m?.month == null || m.month < 0 || m.month > 11) return;
        meses[m.month] = { ...meses[m.month], ...m };
      });

      this.monthsByKey.set(key, meses);
      this.vehicles.push({ key, plate });
    });

    this.vehicles.sort((a, b) => a.plate.localeCompare(b.plate));

    this.vehiclesLoaded.emit(
      this.vehicles
        .map((v) => Number(v.key.split(':').pop()))
        .filter((id) => Number.isFinite(id) && id > 0),
    );
  }

  /** Los grupos cuyo detalle hace falta: el vehículo elegido, o todos. */
  private detailKeys(): string[] {
    if (this.isAllVehicles) return this.vehicles.map((v) => v.key);
    /* Una llave que este reporte no conoce —el tablero cargó su año antes que
       nosotros— no se pide: la carga que viene la traerá. */
    return this.vehicles.some((v) => v.key === this.vehicleKey)
      ? [this.vehicleKey as string]
      : [];
  }

  private cacheKeyOf(key: string): string {
    return `${key}|${this.year}|${this.month}`;
  }

  /**
   * Trae el detalle viaje a viaje del periodo (Endpoint B).
   *
   * Es la única pieza que baja del mes al viaje: el reporte de la carga llega
   * agregado por mes. Sin `month` el endpoint devuelve el año completo, que es
   * justo lo que necesita el alcance anual.
   *
   * En "Todos" pide un grupo por vehículo y junta las respuestas: el Endpoint B
   * responde por grupo y no hay una llave que signifique la flota. Son tantas
   * peticiones como camiones —dos o tres en la práctica—, van en paralelo, y la
   * caché es por vehículo y periodo: entrar a "Todos" después de haber mirado
   * dos placas no vuelve a pedir ninguna de las dos.
   */
  private async refreshDetail(): Promise<void> {
    const token = ++this.detailToken;
    const keys = this.detailKeys();

    if (!keys.length) {
      this.applyDetail([]);
      return;
    }

    const pendientes = keys.filter(
      (k) => !this.detailCache.has(this.cacheKeyOf(k)),
    );
    if (!pendientes.length) {
      this.applyDetail(keys);
      return;
    }

    /* Se vacía antes de salir a la red: si no, la tabla seguiría mostrando los
       viajes del vehículo anterior mientras llega la respuesta. */
    this.applyDetail([]);
    this.detailLoading = true;
    this.detailError = false;
    try {
      const respuestas = await Promise.all(
        pendientes.map((k) =>
          lastValueFrom(
            this.reportService.getGroupTrips(
              k,
              this.year,
              this.month === this.ANIO ? null : this.month,
            ),
          ),
        ),
      );
      if (token !== this.detailToken) return;
      pendientes.forEach((k, i) =>
        this.detailCache.set(this.cacheKeyOf(k), respuestas[i]),
      );
      this.applyDetail(keys);
    } catch (error) {
      if (token !== this.detailToken) return;
      console.error('Error cargando el detalle por viaje:', error);
      this.detailError = true;
      this.applyDetail([]);
    } finally {
      if (token === this.detailToken) this.detailLoading = false;
    }
  }

  /**
   * Arma la tabla con el detalle ya cacheado de esos grupos.
   *
   * El gasto viene imputado por `tripId` y acotado al periodo; lo que no cae en
   * ningún viaje llega aparte y va al pie, sumado entre los vehículos.
   *
   * En "Todos" la placa entra en la etiqueta de cada fila: sin ella dos viajes
   * "#12" de camiones distintos serían indistinguibles. Se toma del vehículo
   * cuyo grupo se pidió, no del campo `plate` del viaje, porque esa es la placa
   * que el reporte garantiza para ese grupo.
   */
  private applyDetail(keys: string[]): void {
    const varios = keys.length > 1;
    let otros = 0;
    const filas: TripRow[] = [];

    keys.forEach((key) => {
      const detail = this.detailCache.get(this.cacheKeyOf(key));
      if (!detail) return;
      otros += detail.otherExpenses || 0;
      const placa = this.plateOf(key);

      (detail.trips ?? []).forEach((t: DashboardGroupTrip) => {
        const income = t.freight || 0;
        const gasto = t.expenses || 0;
        const numero = t.numberTrip ? `#${t.numberTrip}` : `#${t.id}`;
        filas.push({
          id: t.id,
          label: varios ? `${placa} ${numero}` : numero,
          route: '',
          originId: t.originId,
          destinationId: t.destinationId,
          monthLabel: this.monthNamesShort[t.month] ?? '',
          income,
          expenses: gasto,
          profit: income - gasto,
          margin: income > 0 ? ((income - gasto) / income) * 100 : null,
        });
      });
    });

    this.unassignedExpenses = otros;
    this.tripRows = filas;
    this.buildRoutes();
    this.applySort();
    void this.loadReturnLegs();
  }

  /* ---- La ruta de cada viaje -------------------------------------------- */

  /** `id` de ciudad → nombre. Llega del catálogo, que `CommonService` cachea:
   *  pedirlo aquí no cuesta una petición si otra vista ya lo pidió. */
  private cityNames = new Map<string, string>();

  /** Destino de regreso por `id` de viaje, para los redondos. */
  private returnLegs = new Map<number, string>();

  /** Viajes cuyo tramo de regreso ya se preguntó, se haya encontrado o no.
   *  Sin esto, un viaje sin regreso se volvería a pedir en cada repintado. */
  private readonly askedReturnLegs = new Set<number>();

  /**
   * Catálogo de ciudades. Sin él la tabla mostraría los `id` en crudo, que es
   * lo que hacía antes: "12 → 47" en vez de "Bogotá → Cali".
   */
  private citiesAsked = false;

  private loadCities(): void {
    this.citiesAsked = true;
    this.commonService.getCities().subscribe({
      next: (resp: any) => {
        (resp?.data ?? []).forEach((c: any) => {
          if (c?.id != null) this.cityNames.set(String(c.id), c.name);
        });
        this.buildRoutes();
      },
      error: (error: any) => {
        console.error('Error cargando el catálogo de ciudades:', error);
        /* Se vuelve a intentar en el siguiente cambio de periodo: sin catálogo
           la tabla se queda con los `id` a la vista. */
        this.citiesAsked = false;
      },
    });
  }

  /**
   * Tercera parada de los viajes redondos.
   *
   * `returnDestinationId` existe en `trip` pero no en el reporte agregado, así
   * que sale del endpoint que sí lo tiene: `/trip/filter`, acotado por `id in`
   * a los viajes que ya están en la tabla. Es una petición por tabla, no una
   * por fila, y solo por los viajes que aún no se han preguntado.
   *
   * Si falla, la ruta se queda en origen → destino: el tramo que falta es el
   * de vuelta, y las cifras no dependen de él.
   */
  private async loadReturnLegs(): Promise<void> {
    const ids = this.tripRows
      .map((r) => r.id)
      .filter((id) => id != null && !this.askedReturnLegs.has(id));
    if (!ids.length) return;

    ids.forEach((id) => this.askedReturnLegs.add(id));
    try {
      const resp: any = await lastValueFrom(
        this.tripService.getTripFilter(
          new ModelFilterTable(
            [new Filter('id', 'in', ids.join(','))],
            new Pagination(ids.length, 0),
            new Sort('id', false),
          ),
        ),
      );
      const viajes: ModelTrip[] = resp?.data?.content || [];
      viajes.forEach((t) => {
        if (t?.id != null && t.returnDestinationId) {
          this.returnLegs.set(t.id, t.returnDestinationId);
        }
      });
      this.buildRoutes();
    } catch (error) {
      console.error('Error cargando el destino de regreso:', error);
      /* Se desmarcan: si quedaran como preguntados, el tramo de vuelta no se
         volvería a pedir en toda la sesión. */
      ids.forEach((id) => this.askedReturnLegs.delete(id));
    }
  }

  /** Arma el texto de la ruta de cada fila con lo que haya llegado hasta ahora:
   *  el catálogo y los tramos de regreso son dos peticiones aparte, y la tabla
   *  se pinta antes que ninguna de las dos. */
  private buildRoutes(): void {
    this.tripRows.forEach((r) => {
      const paradas = [
        r.originId,
        r.destinationId,
        this.returnLegs.get(r.id),
      ].filter(Boolean) as string[];
      r.route = paradas.map((id) => this.cityName(id)).join(' → ');
    });
  }

  /** El nombre de la ciudad, o su `id` mientras el catálogo no haya llegado —
   *  que es más de lo que decía antes, y no deja el renglón vacío. */
  private cityName(id: string): string {
    return this.cityNames.get(String(id)) ?? String(id);
  }

  private plateOf(key: string): string {
    return this.vehicles.find((v) => v.key === key)?.plate ?? '';
  }

  private clear(): void {
    this.monthsByKey = new Map();
    this.vehicles = [];
    this.detailCache.clear();
    this.applyDetail([]);
  }

  /* ======================================================================
     Cálculo
     ====================================================================== */

  /**
   * Los meses que entran en el alcance: el del selector, o los doce.
   *
   * En "Todos" devuelve los de cada vehículo, uno detrás de otro. `recompute`
   * los suma, y sumar doce meses de dos camiones da lo mismo que sumar los dos
   * camiones mes a mes: no hace falta fundirlos en una serie de doce.
   */
  private scopedMonths(): DashboardMonth[] {
    const series = this.isAllVehicles
      ? this.vehicles.map((v) => this.monthsByKey.get(v.key) ?? [])
      : [(this.vehicleKey && this.monthsByKey.get(this.vehicleKey)) || []];

    if (this.month === this.ANIO) return series.flat();
    return series
      .map((meses) => meses[this.month])
      .filter((m): m is DashboardMonth => !!m);
  }

  /**
   * Las cuatro cifras y los tres promedios.
   *
   * `Gastos` incluye los dos tipos —lo imputado a viajes y el mantenimiento—,
   * porque la utilidad del vehículo los resta a ambos. Es también lo que hace
   * comparable el promedio por viaje: repartir solo el gasto de viaje entre
   * los viajes daría un camión más rentable de lo que es.
   */
  private recompute(): void {
    const meses = this.scopedMonths();

    this.income = meses.reduce((a, m) => a + (m.freight || 0), 0);
    this.tripExpenses = meses.reduce((a, m) => a + (m.tripExpenses || 0), 0);
    this.otherExpenses = meses.reduce(
      (a, m) =>
        a +
        Object.values(m.expensesByType ?? {}).reduce((s, v) => s + (v || 0), 0),
      0,
    );
    this.expenses = this.tripExpenses + this.otherExpenses;
    this.profit = this.income - this.expenses;
    this.margin = this.income > 0 ? (this.profit / this.income) * 100 : null;

    this.tripCount = meses.reduce(
      (a, m) =>
        a +
        Object.values(m.tripsByType ?? {}).reduce((s, v) => s + (v || 0), 0),
      0,
    );

    const n = this.tripCount || 0;
    this.avgIncome = n ? this.income / n : 0;
    this.avgExpense = n ? this.expenses / n : 0;
    this.avgProfit = n ? this.profit / n : 0;
  }

  /* ======================================================================
     Interacción
     ====================================================================== */

  /**
   * Se está mirando la flota entera y no un camión.
   *
   * Con un solo vehículo eso es el mismo número por los dos caminos, pero la
   * frase resumen sí cambia: ahí se nombra la placa, no "todos" — ver
   * `selectedPlate`.
   */
  get isAllVehicles(): boolean {
    return this.vehicleKey == null;
  }

  /** Lo que se está mirando, para la frase resumen y la tabla. */
  get selectedPlate(): string {
    if (!this.isAllVehicles) {
      return this.vehicles.find((v) => v.key === this.vehicleKey)?.plate ?? '—';
    }
    /* Con un solo camión, "Todos los vehículos" sobra y despista: la flota es
       él. */
    return this.vehicles.length === 1
      ? this.vehicles[0].plate
      : 'Todos los vehículos';
  }

  /* Concordancia del vacío de la tabla: "Todos los vehículos no tienen viajes"
     contra "ABC-123 no tiene viajes". Es una tontería y es lo primero que se
     nota. */
  private get plural(): boolean {
    return this.isAllVehicles && this.vehicles.length > 1;
  }

  get verboTener(): string {
    return this.plural ? 'tienen' : 'tiene';
  }

  /** El periodo, tal como se nombra en el encabezado. */
  get periodLabel(): string {
    return this.month === this.ANIO
      ? `Año ${this.year}`
      : `${this.monthNames[this.month]} ${this.year}`;
  }

  /** El periodo cerró en rojo. La tarjeta grande cambia de rótulo y de icono
   *  con esto, no solo de color: el signo tiene que leerse impreso, y para
   *  quien no distingue el rojo del azul. */
  get isLoss(): boolean {
    return this.profit < 0;
  }

  /* ---- Orden de la tabla ------------------------------------------------ */

  /**
   * La tabla abre por utilidad descendente —lo que más dejó arriba, lo que
   * costó plata abajo—, que es la lectura que motiva el reporte. Tocar una
   * columna reordena; tocar la misma invierte el sentido.
   */
  public sortBy(field: SortField): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      /* El número de viaje se lee de menor a mayor y el dinero de mayor a
         menor: en ambos casos lo primero es lo que se está buscando. */
      this.sortAsc = field === 'label';
    }
    this.applySort();
  }

  public sortIcon(field: SortField): string {
    if (this.sortField !== field) return 'fa-sort';
    return this.sortAsc ? 'fa-sort-up' : 'fa-sort-down';
  }

  private applySort(): void {
    const dir = this.sortAsc ? 1 : -1;
    const f = this.sortField;
    this.tripRows = [...this.tripRows].sort((a, b) => {
      if (f === 'label') {
        return dir * a.label.localeCompare(b.label, 'es-CO', { numeric: true });
      }
      /* Un viaje sin flete no tiene margen. Va al final en los dos sentidos:
         tratarlo como cero lo pondría entre los viajes en pérdida y los
         rentables, sugiriendo un dato que no existe. */
      const av = a[f];
      const bv = b[f];
      if (av == null) return 1;
      if (bv == null) return -1;
      return dir * (av - bv);
    });
  }

  /* ---- Totales del pie de la tabla -------------------------------------- */

  get rowsIncome(): number {
    return this.tripRows.reduce((a, r) => a + r.income, 0);
  }

  get rowsExpenses(): number {
    return this.tripRows.reduce((a, r) => a + r.expenses, 0);
  }

  get rowsProfit(): number {
    return this.rowsIncome - this.rowsExpenses;
  }
}
