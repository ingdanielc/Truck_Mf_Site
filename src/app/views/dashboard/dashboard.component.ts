import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TripService } from '../../services/trip.service';
import { VehicleService as ExpenseService } from '../../services/expense.service';
import { VehicleService } from '../../services/vehicle.service';
import { SecurityService } from '../../services/security/security.service';
import { OwnerService } from '../../services/owner.service';
import { ReportService } from '../../services/report.service';
import { CommonService } from '../../services/common.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';
import { lastValueFrom, Subscription, distinctUntilChanged } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartConfiguration,
  ChartData,
  ChartType,
  Plugin,
  registerables,
} from 'chart.js';
import { ModelVehicle } from '../../models/vehicle-model';
import { ModelTrip } from '../../models/trip-model';
import { ModelExpense } from '../../models/expense-model';
import { ModelOwner } from '../../models/owner-model';
import {
  DashboardActiveTrip,
  DashboardGroup,
  DashboardGroupTrip,
  DashboardGroupTrips,
  DashboardMonth,
  MAINTENANCE_EXPENSE_TYPE,
} from '../../models/dashboard-report-model';
import { FormsModule } from '@angular/forms';
import { GVehicleTripExpCardComponent } from '../../components/g-vehicle-trip-exp-card/g-vehicle-trip-exp-card.component';

Chart.register(...registerables);

/** Resumen de una serie de utilidad, para el pie de los detalles. */
interface ProfitStats {
  max: number;
  min: number;
  avg: number;
  maxLabel: string;
  minLabel: string;
  n: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    GVehicleTripExpCardComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  loading = true;
  activeTrips: {
    vehicle: ModelVehicle;
    trip: ModelTrip;
    expenses: ModelExpense[];
  }[] = [];
  activeTripsCollapsed: boolean = true;
  chartsCollapsed: boolean = false;
  userRole: string = '';
  owners: ModelOwner[] = [];
  selectedOwnerId: number | null = null;

  showHistoryPanel: boolean = false;

  public currentMonthName: string = '';
  public selectedMonth: number = new Date().getMonth();
  public selectedYear: number = new Date().getFullYear();
  public browsingYear: number = new Date().getFullYear();
  public readonly systemMonth: number = new Date().getMonth();
  public readonly systemYear: number = new Date().getFullYear();

  /** Series del desglose por tipo de viaje (solo propietario y conductor) */
  private readonly TRIP_TYPE_SERIES = [
    { id: 'CARGADO', label: 'Cargado', color: '#3b82f6' },
    { id: 'REDONDO', label: 'Redondo', color: '#10b981' },
    { id: 'VACIO', label: 'Vacío', color: '#f59e0b' },
  ];

  /**
   * Alcance de TODAS las gráficas: el mes seleccionado o el año completo.
   *
   * Antes cada tarjeta traía su propio selector y podían quedar desfasadas —
   * una en el mes y la de al lado en el año —, lo que invita a comparar cifras
   * de periodos distintos. Ahora hay un único control, arriba junto al del
   * periodo, y todas las gráficas responden a él.
   *
   * Qué cambia con el alcance depende de la gráfica: en unas solo se amplía la
   * ventana acumulada, y en las que tienen el mes en el eje X (viajes
   * mensuales, utilidad mensual e ingresos vs egresos) cambia la dimensión que
   * se dibuja. Cada builder lo documenta.
   */
  public scope: 'mes' | 'anio' = 'mes';

  public tripsByVehicleOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Viajes por Vehículo (${this.currentMonthName})`,
      },
    },
  };
  public tripsByVehicleType: ChartType = 'bar';
  public tripsByVehiclePlugins: Plugin<'bar'>[] = [this.ownerAvatarTicks()];

  /** Total de viajes pintados. Suma las tres series del desglose por tipo
   *  (cargado, redondo, vacío) o la única del administrador, según el rol.
   *  Lo fija el builder: la plantilla lo lee en cada ciclo. */
  public tripsByVehicleTotal = 0;

  public tripsByVehicleData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ data: [], label: 'Viajes', backgroundColor: '#3b82f6' }],
  };

  private readonly MESES_CORTOS = [
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

  public financialOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Ingresos vs Egresos (${this.currentMonthName})`,
      },
    },
  };
  public financialType: ChartType = 'bar';

  public financialPlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatMoneyLabel(v)),
    this.ownerAvatarTicks('viaje'),
  ];

  /** Totales de las dos series, tal como están pintadas. */
  public financialIncomeTotal = 0;
  public financialExpenseTotal = 0;

  /** Gastos del periodo que no cuelgan de ningún viaje del periodo. No están
   *  en las barras — no pertenecen a ningún viaje —, pero sí en la utilidad. */
  public financialOtherExpenses = 0;

  /** Ingresos menos los dos tipos de gasto: coincide con la utilidad de
   *  "Utilidad por Viaje", que parte de las mismas filas. */
  get financialProfitTotal(): number {
    return (
      this.financialIncomeTotal -
      this.financialExpenseTotal -
      this.financialOtherExpenses
    );
  }

  /** El alto lo manda la cantidad de categorías: cada una aloja sus dos barras
   *  —ingresos y egresos— con el grosor común. */
  get financialHeight(): number {
    const n = this.financialData.labels?.length ?? 0;
    return Math.max(250, n * DashboardComponent.ROW_H2 + 64);
  }

  public financialData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Ingresos (Flete)',
        backgroundColor: '#10b981',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
      {
        data: [],
        label: 'Egresos (Gastos)',
        backgroundColor: '#ef4444',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
    ],
  };

  // New Chart: Ingresos vs Gastos por Vehículo
  public monthVehicleFinOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Ingresos vs Gastos por Vehículo (${this.currentMonthName})`,
      },
    },
  };
  public monthVehicleFinType: ChartType = 'bar';

  public monthVehicleFinPlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatMoneyLabel(v)),
    this.ownerAvatarTicks(),
  ];

  public monthVehicleFinIncomeTotal = 0;
  public monthVehicleFinExpenseTotal = 0;

  /** Ver `financialHeight`. */
  get monthVehicleFinHeight(): number {
    const n = this.monthVehicleFinData.labels?.length ?? 0;
    return Math.max(250, n * DashboardComponent.ROW_H2 + 64);
  }

  public monthVehicleFinData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Ingresos (Flete)',
        backgroundColor: '#10b981',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
      {
        data: [],
        label: 'Egresos (Gastos)',
        backgroundColor: '#f43f5e',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
    ],
  };

  /** Ingresos/gastos/margen por placa, para el tooltip de utilidad. */
  private vehicleProfitDetail: Record<
    string,
    { ingresos: number; gastos: number; margen: number }
  > = {};

  /**
   * Chart: Utilidad por Vehículo — barras horizontales divergentes.
   *
   * Azul y rojo en vez de verde y rojo: verde-rojo es justo el par que no
   * distingue un lector con daltonismo rojo-verde. Además el signo viaja por
   * tres canales — el lado de la barra respecto al cero, el color y el propio
   * número del tooltip — así que la lectura nunca depende del color.
   */
  /**
   * Grosor único de las barras horizontales, en píxeles, y alto de la fila que
   * las contiene. Todas las gráficas horizontales lo comparten para que una
   * barra mida lo mismo en cualquier tarjeta.
   *
   * `ROW_H2` es para las gráficas de dos series (ingresos y egresos): la fila
   * tiene que alojar dos barras del mismo grosor más su separación.
   */
  /** Estadísticos en cero, para cuando no hay ningún detalle abierto. */
  private static readonly STATS_VACIO: ProfitStats = {
    max: 0,
    min: 0,
    avg: 0,
    maxLabel: '—',
    minLabel: '—',
    n: 0,
  };

  /** Avatar del eje en móvil: gris para todos, con las iniciales en negro. */
  private static readonly AVATAR_BG = '#cbd5e1';
  private static readonly AVATAR_TEXT = '#111827';

  public static readonly BAR_THICKNESS = 26;
  private static readonly ROW_H = 44;
  private static readonly ROW_H2 = 72;

  public static readonly PROFIT_POS = '#2a78d6';
  public static readonly PROFIT_NEG = '#e34948';

  public vehicleProfitOptions: ChartConfiguration['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      // Una sola serie: el título ya dice qué se está pintando.
      legend: { display: false },
      title: {
        display: true,
        text: `Utilidad por Vehículo (${this.currentMonthName})`,
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const d = this.vehicleProfitDetail[ctx.label] ?? {
              ingresos: 0,
              gastos: 0,
              margen: 0,
            };
            const money = (v: number) =>
              '$ ' + Math.round(v).toLocaleString('es-CO');
            return [
              `Ingresos: ${money(d.ingresos)}`,
              `Gastos: ${money(d.gastos)}`,
              `Utilidad: ${money(ctx.parsed.x)}`,
              `Margen: ${d.margen.toFixed(1)} %`,
            ];
          },
        },
      },
    },
    /* `grace` reserva un margen en el eje de valores para que la etiqueta de
       la punta quepa fuera de la barra en vez de salirse del area. */
    scales: { x: { beginAtZero: true, grace: '18%' }, y: {} },
  };
  public vehicleProfitType: ChartType = 'bar';
  public vehicleProfitData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Utilidad',
        backgroundColor: [],
        // Punta redondeada y borde recto sobre el cero.
        borderRadius: 4,
        borderSkipped: 'start',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
    ],
  };

  /** El alto crece con la flota: una fila por vehículo, nunca comprimidas. */
  get vehicleProfitHeight(): number {
    const n = this.vehicleProfitData.labels?.length ?? 0;
    return Math.max(200, n * DashboardComponent.ROW_H + 64);
  }

  /** Utilidad total de los vehículos que se están mostrando. Para el
   *  propietario en sesión son los suyos: la carga ya filtra por sus placas. */
  public vehicleProfitTotal = 0;

  /** Tinta vigente del tema, para lo que se dibuja a mano en el canvas. */
  private chartTextColor = '#475569';

  /** Etiqueta de la punta: signo, moneda y monto compacto. */
  private formatProfitLabel(v: number): string {
    if (Math.round(v) === 0) return '$0';
    return (v > 0 ? '+' : '-') + '$' + this.formatMobileValue(Math.abs(v));
  }

  /**
   * Escribe el valor al final de cada barra. Chart.js no trae etiquetas
   * directas y no compensa una dependencia nueva por unos pocos números.
   *
   * El texto va con la tinta del tema, nunca con el color de la barra: el
   * color identifica el signo, no la etiqueta.
   *
   * Colocación, en orden: fuera de la punta; si se sale del área, al otro
   * lado del cero (donde siempre sobra sitio en una escala asimétrica);
   * y como último recurso dentro de la barra en blanco. Nunca se recorta.
   */
  /* Método y no propiedad: los `*Plugins` que lo invocan se declaran antes
     en la clase, y una propiedad todavía no estaría inicializada. */
  private barValueLabels(format: (v: number) => string): Plugin<'bar'> {
    return {
      id: 'barValueLabels',
      afterDatasetsDraw: (chart) => {
        const ctx = chart.ctx;
        const area = chart.chartArea;
        const GAP = 6;
        // Con `indexAxis: 'y'` la barra crece en X; si no, en Y.
        const horizontal = (chart.options as any)?.indexAxis === 'y';

        ctx.save();
        ctx.font = "600 11px 'Inter', sans-serif";

        chart.data.datasets?.forEach((ds: any, di: number) => {
          const meta = chart.getDatasetMeta(di);
          if (meta.hidden || !meta.data?.length) return;
          const values = ds.data as (number | null)[];

          meta.data.forEach((bar: any, i: number) => {
            const v = values[i];
            if (v == null) return;

            // El formateador puede devolver vacío para omitir la etiqueta.
            const text = format(v);
            if (!text) return;

            const w = ctx.measureText(text).width;
            const positivo = v >= 0;
            const base = bar.base; // el cero
            let dentro = false;

            if (horizontal) {
              const tip = bar.x;
              const cabe = (px: number) =>
                px >= area.left && px + w <= area.right;

              // 1) Fuera de la punta: la posición natural.
              let x = positivo ? tip + GAP : tip - GAP - w;

              // 2) Si se sale, al otro lado del cero. En una escala asimétrica el
              //    lado corto no tiene sitio, pero el largo siempre sí.
              if (!cabe(x)) x = positivo ? base - GAP - w : base + GAP;

              // 3) Último recurso: dentro de la barra, y solo si el texto cabe.
              if (!cabe(x)) {
                if (Math.abs(tip - base) < w + GAP * 2) return;
                x = positivo ? tip - GAP - w : tip + GAP;
                dentro = true;
              }

              ctx.textAlign = 'left';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = dentro ? '#ffffff' : this.chartTextColor;
              ctx.fillText(text, x, bar.y);
              return;
            }

            /* Vertical: la etiqueta va centrada sobre la punta. El alto del texto
               se aproxima con el tamaño de fuente; no hace falta más precisión
               para decidir si cabe. */
            const H = 11;
            const tip = bar.y;
            const cabe = (py: number) =>
              py - H >= area.top && py <= area.bottom;

            let y = positivo ? tip - GAP : tip + GAP + H;
            if (!cabe(y)) {
              if (Math.abs(tip - base) < H + GAP * 2) return;
              y = positivo ? tip + GAP + H : tip - GAP;
              dentro = true;
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = dentro ? '#ffffff' : this.chartTextColor;
            ctx.fillText(text, bar.x, y);
          });
        });

        ctx.restore();
      },
    };
  }

  public vehicleProfitPlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatProfitLabel(v)),
    this.ownerAvatarTicks(),
  ];

  /** Monto sin signo. El cero no se rotula: con media flota sin taller en el
   *  mes, o sin gastos en un viaje, una fila de "$0" sería solo ruido. */
  private formatMoneyLabel(v: number): string {
    if (Math.round(v) === 0) return '';
    return '$' + this.formatMobileValue(v);
  }

  public maintenancePlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatMoneyLabel(v)),
    this.ownerAvatarTicks(),
  ];

  /* Detalle: Utilidad Mensual del grupo seleccionado ------------------------

     Se despliega bajo "Utilidad por Vehículo/Propietario" al tocar una de sus
     barras, y solo en el alcance de año: en el de mes no hay nada que
     desglosar, la barra ya ES el mes.

     Los datos no se recalculan: salen de `profitByGroupMonth`, que arma
     `processProfitByMonth` con el mismo criterio, así que los doce meses
     suman exactamente la barra de la que se abrió. */
  public selectedProfitGroup: string | null = null;

  /**
   * Filas viaje a viaje del grupo abierto, en el mes seleccionado. Vienen del
   * Endpoint B, que solo se pide al tocar una barra: el reporte de la carga
   * llega agregado por mes y no baja al viaje.
   *
   * Es la fuente comun de las dos tarjetas de detalle del alcance de mes
   * —"Utilidad por Viaje" e "Ingresos vs Egresos por Viaje"—, y por eso sus
   * totales cuadran por construcción y no por coincidencia.
   */
  private groupTripRows: {
    label: string;
    freight: number;
    gasto: number;
    mes: number;
  }[] = [];

  /** Gastos del periodo que no cuelgan de ningun viaje del periodo:
   *  mantenimiento y gastos sueltos. Los devuelve el mismo Endpoint B. */
  private groupTripOthers = 0;

  /** El detalle viaja aparte de la carga: mientras llega, la tarjeta lo dice. */
  public detailLoading = false;

  /** Respuestas del Endpoint B ya recibidas, por grupo, año y mes. Cerrar y
   *  volver a abrir la misma barra no vuelve a pedir nada. */
  private readonly detailCache = new Map<string, DashboardGroupTrips>();

  /** Descarta la respuesta de una petición que ya quedó atrás: el usuario
   *  puede tocar otra barra antes de que vuelva la anterior. */
  private detailToken = 0;

  /** Utilidad por grupo y mes del año cargado. Llave: la etiqueta del grupo. */
  private profitByGroupMonth: Record<string, number[]> = {};

  /** Meses en los que cada grupo tuvo movimiento — ver `processProfitByMonth`. */
  private profitActiveMonths: Record<string, boolean[]> = {};

  /** Máscara de meses con movimiento del grupo abierto en el detalle. */
  private monthProfitActive: boolean[] = [];

  public monthProfitDetailOptions: ChartConfiguration['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: '' },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            '$ ' + Math.round(ctx.parsed.x || 0).toLocaleString('es-CO'),
        },
      },
    },
    scales: { x: { beginAtZero: true, grace: '18%' }, y: {} },
  };
  public monthProfitDetailType: ChartType = 'bar';
  public monthProfitDetailData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Utilidad',
        backgroundColor: [],
        borderRadius: 4,
        borderSkipped: 'start',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
    ],
  };

  public monthProfitDetailPlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatProfitLabel(v)),
  ];

  /* Detalle: Utilidad por Viaje --------------------------------------------

     El gemelo del anterior para el alcance de mes: al tocar una barra se abre
     el desglose viaje a viaje del grupo, en vez de mes a mes.

     Aquí el gasto se imputa por `tripId` — es la única forma de repartirlo
     entre viajes —, y solo el registrado dentro del mes, que es el criterio de
     fecha del resto del tablero. Lo que queda fuera (mantenimiento, gastos sin
     viaje) se muestra aparte en el pie para que las cifras cuadren con la
     barra de la que se abrió el detalle. */
  public tripProfitDetailOptions: ChartConfiguration['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: true, text: '' },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            '$ ' + Math.round(ctx.parsed.x || 0).toLocaleString('es-CO'),
        },
      },
    },
    scales: { x: { beginAtZero: true, grace: '18%' }, y: {} },
  };
  public tripProfitDetailType: ChartType = 'bar';
  public tripProfitDetailData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Utilidad',
        backgroundColor: [],
        borderRadius: 4,
        borderSkipped: 'start',
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
    ],
  };

  public tripProfitDetailPlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatProfitLabel(v)),
    this.ownerAvatarTicks('viaje'),
  ];

  /** Flete facturado por los viajes del grupo en el mes. */
  public tripProfitFreight = 0;

  /** Gastos imputados a esos viajes por `tripId`. */
  public tripProfitTripExpenses = 0;

  /** Gastos del grupo en el mes que no cuelgan de ningún viaje del mes:
   *  mantenimiento, y por eso así se rotula en el pie de la tarjeta. */
  public tripProfitOtherExpenses = 0;

  /** Una fila por viaje; el alto crece con la cantidad. */
  get tripProfitDetailHeight(): number {
    const n = this.tripProfitDetailData.labels?.length ?? 0;
    return Math.max(200, n * DashboardComponent.ROW_H + 64);
  }

  /** Utilidad del mes ya con todo: coincide con la barra que se tocó. Es la
   *  resta de las tres líneas del pie, de ahí que cuadren a la vista. */
  get tripProfitMonthTotal(): number {
    return (
      this.tripProfitFreight -
      this.tripProfitTripExpenses -
      this.tripProfitOtherExpenses
    );
  }

  /** Doce filas fijas: el alto no depende de los datos, solo de los meses. */
  get monthProfitDetailHeight(): number {
    return 12 * DashboardComponent.ROW_H + 64;
  }

  /** Flete facturado por el grupo en el año. */
  public monthProfitFreight = 0;

  /** Gastos imputados a los viajes del año por `tripId`. */
  public monthProfitTripExpenses = 0;

  /** El resto de gastos del grupo en el año: sobre todo mantenimiento. */
  public monthProfitOtherExpenses = 0;

  /** Utilidad del grupo en el año. Sale de los tres componentes del pie —y no
   *  de sumar las doce barras— para que la resta se pueda verificar a ojo. Da
   *  lo mismo: las barras parten de los mismos viajes y gastos. */
  get monthProfitDetailTotal(): number {
    return (
      this.monthProfitFreight -
      this.monthProfitTripExpenses -
      this.monthProfitOtherExpenses
    );
  }

  /**
   * Utilidad máxima, mínima y promedio del grupo abierto.
   *
   * Se calculan **solo sobre los meses con movimiento**: incluir los meses en
   * que el vehículo no rodó dejaría el mínimo clavado en cero y hundiría el
   * promedio, que es justo lo contrario de lo que la cifra debe contar. Por
   * eso `max` y `min` vienen con el mes al que pertenecen.
   */
  /* Los fija el builder de cada detalle. Antes eran getters, y la plantilla
     los referencia diez veces cada uno: sin `OnPush` eso significaba veinte
     recorridos de la serie por ciclo de detección de cambios. */
  public monthProfitStats: ProfitStats = DashboardComponent.STATS_VACIO;
  public tripProfitStats: ProfitStats = DashboardComponent.STATS_VACIO;

  /**
   * Máximo, mínimo y promedio de una serie, con la etiqueta del punto extremo.
   *
   * `activos` acota el cálculo a los puntos que cuentan; en el detalle mensual
   * son los meses con movimiento, porque incluir los meses parados dejaría el
   * mínimo clavado en cero y hundiría el promedio. `null` = todos cuentan.
   */
  private computeStats(
    data: number[],
    labels: string[],
    activos: boolean[] | null,
  ): ProfitStats {
    const idx = data
      .map((_, i) => i)
      .filter((i) => !activos || activos[i] === true);

    if (!idx.length) {
      return { max: 0, min: 0, avg: 0, maxLabel: '—', minLabel: '—', n: 0 };
    }

    let iMax = idx[0];
    let iMin = idx[0];
    let suma = 0;
    idx.forEach((i) => {
      const v = data[i] || 0;
      if (v > (data[iMax] || 0)) iMax = i;
      if (v < (data[iMin] || 0)) iMin = i;
      suma += v;
    });

    return {
      max: data[iMax] || 0,
      min: data[iMin] || 0,
      avg: suma / idx.length,
      maxLabel: labels[iMax] ?? '—',
      minLabel: labels[iMin] ?? '—',
      n: idx.length,
    };
  }

  /**
   * Abre o cierra el detalle mensual al tocar una barra de utilidad. Tocar la
   * barra ya abierta la cierra: sin eso no habría forma de ocultar la tarjeta.
   */
  public onVehicleProfitClick(e: { event?: any; active?: any[] }): void {
    this.selectGroupFromClick(e, this.vehicleProfitData.labels as string[]);
  }

  /** El mismo detalle se abre desde "Ingresos vs Egresos por Vehículo": sus
   *  categorías son los mismos grupos, así que las dos gráficas son
   *  disparadores intercambiables de la misma selección. */
  public onMonthVehicleFinClick(e: { event?: any; active?: any[] }): void {
    this.selectGroupFromClick(e, this.monthVehicleFinData.labels as string[]);
  }

  private selectGroupFromClick(
    e: { event?: any; active?: any[] },
    labels: string[],
  ): void {
    const index = e?.active?.[0]?.index;
    if (index == null) return;
    const label = labels?.[index];
    if (!label) return;
    this.selectedProfitGroup =
      this.selectedProfitGroup === label ? null : label;
    this.buildMonthProfitDetail();
    /* El detalle del mes baja del mes al viaje, y eso solo lo sabe el
       servidor: se pide aquí —al tocar la barra— y repinta las dos tarjetas
       que lo usan cuando llega. */
    void this.refreshGroupDetail();
    this.updateCurrentMonthName();
  }

  /** Vuelca en la gráfica los doce meses del grupo seleccionado. */
  private buildMonthProfitDetail(): void {
    const key = this.selectedProfitGroup;
    if (key && !this.profitByGroupMonth[key]) this.selectedProfitGroup = null;

    const data = key
      ? (this.profitByGroupMonth[key] ?? new Array(12).fill(0))
      : new Array(12).fill(0);
    this.monthProfitActive = key
      ? (this.profitActiveMonths[key] ?? new Array(12).fill(false))
      : new Array(12).fill(false);

    this.monthProfitDetailData = {
      labels: [...this.MESES_CORTOS],
      datasets: [
        {
          ...this.monthProfitDetailData.datasets[0],
          data,
          backgroundColor: data.map((v: number) =>
            v >= 0
              ? DashboardComponent.PROFIT_POS
              : DashboardComponent.PROFIT_NEG,
          ),
        },
      ],
    };

    if (this.monthProfitDetailOptions?.plugins?.title) {
      this.monthProfitDetailOptions.plugins.title.text = `Utilidad por Mes (${this.selectedYear})`;
    }

    /* Los tres componentes del pie salen de la misma fuente que alimenta a las
       tarjetas del alcance de mes, así que las cifras se leen igual en los dos
       alcances y suman exactamente la utilidad del año. */
    const meses = this.monthsOf(this.selectedProfitGroup);
    this.monthProfitFreight = meses.reduce((a, m) => a + (m.freight || 0), 0);
    this.monthProfitTripExpenses = meses.reduce(
      (a, m) => a + (m.tripExpenses || 0),
      0,
    );
    this.monthProfitOtherExpenses = meses.reduce(
      (a, m) => a + this.otherExpenses(m),
      0,
    );

    this.monthProfitStats = this.computeStats(
      data,
      this.MESES_CORTOS,
      this.monthProfitActive,
    );
  }

  /**
   * Trae el detalle viaje a viaje del grupo abierto, en el mes seleccionado.
   *
   * Es la única pieza del tablero que baja del mes al viaje, y por eso viaja
   * aparte: el reporte de la carga llega agregado por mes. Se pide al tocar
   * una barra —nunca en la entrada— y se guarda en caché, así que cerrar y
   * volver a abrir la misma barra no cuesta otra petición.
   *
   * `detailToken` descarta la respuesta de una petición que ya quedó atrás:
   * tocar otra barra antes de que vuelva la anterior dejaría en pantalla las
   * filas del grupo equivocado.
   */
  private async refreshGroupDetail(): Promise<void> {
    const token = ++this.detailToken;
    const label = this.selectedProfitGroup;

    /* En el alcance de año el detalle es "Utilidad Mensual", que sale del
       propio reporte: no hay nada que pedir. */
    if (!label || this.scope !== 'mes') {
      this.applyGroupDetail([], 0);
      return;
    }

    const key = this.groupKeyByLabel[label];
    if (!key) {
      this.applyGroupDetail([], 0);
      return;
    }

    const cacheKey = `${key}|${this.selectedYear}|${this.selectedMonth}`;
    const cached = this.detailCache.get(cacheKey);
    if (cached) {
      this.applyGroupDetail(cached.trips ?? [], cached.otherExpenses ?? 0);
      return;
    }

    /* Se repinta vacío antes de salir a la red: si no, las tarjetas seguirían
       mostrando los viajes del grupo anterior mientras llega la respuesta. */
    this.applyGroupDetail([], 0);
    this.detailLoading = true;
    try {
      const detail = await lastValueFrom(
        this.reportService.getGroupTrips(
          key,
          this.selectedYear,
          this.selectedMonth,
        ),
      );
      if (token !== this.detailToken) return;
      this.detailCache.set(cacheKey, detail);
      this.applyGroupDetail(detail?.trips ?? [], detail?.otherExpenses ?? 0);
    } catch (error) {
      if (token !== this.detailToken) return;
      console.error('Error loading group detail:', error);
      this.applyGroupDetail([], 0);
    } finally {
      if (token === this.detailToken) this.detailLoading = false;
    }
  }

  /** Vacía el detalle sin pedir nada: cambió el grupo, el mes, el año o el
   *  reporte entero, y las filas que hubiera pertenecen a otro periodo. */
  private invalidateGroupDetail(): void {
    this.detailToken++;
    this.detailLoading = false;
    this.groupTripRows = [];
    this.groupTripOthers = 0;
  }

  /**
   * Vuelca las filas del Endpoint B y repinta las dos tarjetas que las usan.
   *
   * El gasto ya viene imputado por `tripId` y acotado al periodo, igual que lo
   * acota la gráfica de la que cuelga el detalle. Lo que no cae en ningún
   * viaje del periodo —mantenimiento, gastos sueltos— llega en `otherExpenses`
   * y se muestra en el pie: sin eso, el total no cuadraría con la barra que se
   * tocó y no habría forma de saber por qué.
   *
   * La placa solo entra en la etiqueta cuando el grupo es un propietario: sus
   * viajes pueden repartirse entre varios vehículos. Con el grupo siendo un
   * vehículo, la placa ya está en el título de la tarjeta y repetirla en cada
   * fila solo roba ancho al eje.
   */
  private applyGroupDetail(
    trips: DashboardGroupTrip[],
    otherExpenses: number,
  ): void {
    const porPropietario = this.groupByOwner;

    this.groupTripRows = (trips ?? []).map((t) => {
      const numero = `#${t.numberTrip ?? t.id}`;
      const placa = (t.plate || 'S/P').toUpperCase();
      return {
        label: porPropietario ? `${placa} ${numero}` : numero,
        freight: t.freight || 0,
        gasto: t.expenses || 0,
        mes: t.month ?? this.selectedMonth,
      };
    });
    this.groupTripOthers = otherExpenses || 0;
    this.detailLoading = false;

    this.buildTripProfitDetail();
    this.processFinancialData();
  }

  /**
   * Vuelca la utilidad viaje a viaje del grupo seleccionado, en el mes.
   *
   * El gemelo de "Utilidad Mensual" para el alcance de mes: al tocar una barra
   * se abre el desglose viaje a viaje del grupo, en vez de mes a mes.
   */
  private buildTripProfitDetail(): void {
    const pintar = (labels: string[], data: number[]) => {
      this.tripProfitDetailData = {
        labels,
        datasets: [
          {
            ...this.tripProfitDetailData.datasets[0],
            data,
            backgroundColor: data.map((v) =>
              v >= 0
                ? DashboardComponent.PROFIT_POS
                : DashboardComponent.PROFIT_NEG,
            ),
          },
        ],
      };
      if (this.tripProfitDetailOptions?.plugins?.title) {
        this.tripProfitDetailOptions.plugins.title.text = `Utilidad por Viaje (${this.currentMonthName})`;
      }
      // Sin máscara: cada viaje es un punto válido por sí mismo.
      this.tripProfitStats = this.computeStats(data, labels, null);
    };

    if (!this.selectedProfitGroup || this.scope !== 'mes') {
      this.tripProfitFreight = 0;
      this.tripProfitTripExpenses = 0;
      this.tripProfitOtherExpenses = 0;
      pintar([], []);
      return;
    }

    const filas = this.groupTripRows;
    this.tripProfitFreight = filas.reduce((a, f) => a + f.freight, 0);
    this.tripProfitTripExpenses = filas.reduce((a, f) => a + f.gasto, 0);
    this.tripProfitOtherExpenses = this.groupTripOthers;

    /* De mayor a menor: con `indexAxis: 'y'` la primera etiqueta va arriba, así
       que el viaje más rentable encabeza y los que perdieron quedan al pie. */
    const ordenadas = filas
      .map((f) => ({ label: f.label, valor: f.freight - f.gasto }))
      .sort((a, b) => b.valor - a.valor);

    pintar(
      ordenadas.map((f) => f.label),
      ordenadas.map((f) => f.valor),
    );
  }

  /* Chart 3: Mantenimiento por Vehículo. Barras horizontales: la placa se lee
     derecha y el ancho de la barra es el costo. Antes era una gráfica de
     líneas sobre las placas, que sugería una continuidad que no existe. */
  public maintenanceOptions: ChartConfiguration['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      // Una sola serie: el titulo ya dice que se esta pintando.
      legend: { display: false },
      title: {
        display: true,
        text: `Costo Mantenimiento (${this.currentMonthName})`,
      },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            '$ ' + Math.round(ctx.parsed.x || 0).toLocaleString('es-CO'),
        },
      },
    },
    /* `grace` reserva margen en el eje de valores para que la etiqueta de la
       punta quepa fuera de la barra en vez de salirse del área. */
    scales: { x: { beginAtZero: true, grace: '18%' }, y: {} },
  };
  public maintenanceType: ChartType = 'bar';
  public maintenanceData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Costo ($)',
        backgroundColor: '#f59e0b',
        borderRadius: 4,
        barThickness: DashboardComponent.BAR_THICKNESS,
        maxBarThickness: DashboardComponent.BAR_THICKNESS,
      },
    ],
  };

  /** El alto crece con la flota: una fila por vehiculo, nunca comprimidas. */
  get maintenanceHeight(): number {
    const n = this.maintenanceData.labels?.length ?? 0;
    return Math.max(200, n * DashboardComponent.ROW_H + 64);
  }

  /** Inversión total en mantenimiento de los vehículos que se muestran. Para
   *  el propietario en sesión son los suyos: la carga ya filtra por sus placas. */
  public maintenanceTotal = 0;

  // Chart 4: Viajes por Mes y Vehículo
  /**
   * Paleta por grupo — vehículo o propietario. Todas las gráficas que la usan
   * ordenan sus etiquetas alfabéticamente y toman el color por posición, así
   * que un mismo grupo conserva su color entre tarjetas y entre alcances.
   */
  private readonly GROUP_COLORS = [
    '#3b82f6',
    '#10b981',
    '#ef4444',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#6366f1',
  ];

  public monthlyTripsOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Viajes por Mes y Vehículo (${this.selectedYear})`,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { stepSize: 1 },
      },
    },
  };
  public monthlyTripsType: ChartType = 'bar'; // 'line' en alcance de año
  public monthlyTripsData: ChartData<'line'> = {
    labels: [
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
    ],
    datasets: [],
  };

  /* Chart 5: Utilidad Mensual. Misma mecánica que "Viajes Mensuales"; en el
     alcance de mes la barra se colorea por el signo de la utilidad. */
  public monthlyProfitOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Utilidad por Mes y Vehículo (${this.selectedYear})`,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };
  public monthlyProfitType: ChartType = 'bar'; // 'line' en alcance de año
  public monthlyProfitData: ChartData<'line'> = {
    labels: [
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
    ],
    datasets: [],
  };

  private observer: MutationObserver | null = null;

  /* Último reporte recibido (Endpoint A), ya normalizado: por cada grupo, sus
     doce meses indexados por mes. Todas las gráficas se reconstruyen desde
     aquí, así que cambiar de alcance o de mes no vuelve a pedirle nada al
     servidor — el reporte cubre el año entero. */
  private groupMonths = new Map<string, DashboardMonth[]>();

  /* Etiquetas de los grupos en orden alfabético: el eje de categorías de todas
     las gráficas. Al fijarlo una sola vez, un grupo conserva su color entre
     tarjetas y entre alcances. */
  private groupLabels: string[] = [];

  /* Etiqueta → `key` del reporte. La etiqueta es lo que se pinta y lo que
     guarda la selección; el `key` es lo que pide el Endpoint B. */
  private groupKeyByLabel: Record<string, string> = {};
  private userSub?: Subscription;
  private brands: any[] = [];
  private vehicles: ModelVehicle[] = [];
  private currentUser: any = null;

  constructor(
    private readonly tripService: TripService,
    private readonly expenseService: ExpenseService,
    private readonly vehicleService: VehicleService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly reportService: ReportService,
    private readonly commonService: CommonService,
  ) {}

  ngOnInit(): void {
    this.setupThemeObserver();
    this.loadBrands();
    this.updateCurrentMonthName();
    this.userSub = this.securityService.userData$
      .pipe(
        distinctUntilChanged((prev: any, curr: any) => prev?.id === curr?.id),
      )
      .subscribe(async (user) => {
        if (user) {
          this.currentUser = user;
          const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();
          this.userRole = role;
          /* Se espera el catálogo antes de pintar: el administrador agrupa por
             propietario y sin los nombres el eje saldría con "Propietario 12"
             hasta la siguiente recarga. */
          if (role.includes('ADMINISTRADOR')) {
            await this.loadOwners();
          }
          this.loadData(user);
        }
      });
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    this.userSub?.unsubscribe();
  }

  private updateCurrentMonthName(): void {
    const date = new Date(this.selectedYear, this.selectedMonth, 1);
    this.currentMonthName = date
      .toLocaleString('es-CO', { month: 'long' })
      .replace(/./, (c) => c.toUpperCase());

    // Update chart titles
    if (this.tripsByVehicleOptions?.plugins?.title) {
      this.tripsByVehicleOptions.plugins.title.text =
        this.scope === 'mes'
          ? `Viajes por ${this.groupDimension} (${this.currentMonthName})`
          : `Viajes por ${this.groupDimension} (${this.selectedYear})`;
    }
    if (this.financialOptions?.plugins?.title) {
      this.financialOptions.plugins.title.text = this.financialTitle();
    }
    if (this.monthVehicleFinOptions?.plugins?.title) {
      this.monthVehicleFinOptions.plugins.title.text =
        this.scope === 'mes'
          ? `Ingresos vs Gastos por ${this.groupDimension} (${this.currentMonthName})`
          : `Ingresos vs Gastos por ${this.groupDimension} (Acumulado ${this.selectedYear})`;
    }
    if (this.monthlyTripsOptions?.plugins?.title) {
      this.monthlyTripsOptions.plugins.title.text =
        this.scope === 'mes'
          ? `Total de Viajes por ${this.groupDimension} (${this.currentMonthName})`
          : `Viajes por Mes y ${this.groupDimension} (${this.selectedYear})`;
    }
    if (this.monthlyProfitOptions?.plugins?.title) {
      this.monthlyProfitOptions.plugins.title.text =
        this.scope === 'mes'
          ? `Utilidad Neta por ${this.groupDimension} (${this.currentMonthName})`
          : `Utilidad por Mes y ${this.groupDimension} (${this.selectedYear})`;
    }
    if (this.vehicleProfitOptions?.plugins?.title) {
      this.vehicleProfitOptions.plugins.title.text =
        this.scope === 'mes'
          ? `Utilidad por ${this.groupDimension} (${this.currentMonthName})`
          : `Utilidad por ${this.groupDimension} (Acumulado ${this.selectedYear})`;
    }
    if (this.maintenanceOptions?.plugins?.title) {
      this.maintenanceOptions.plugins.title.text =
        this.scope === 'mes'
          ? `Costo Mantenimiento (${this.currentMonthName})`
          : `Costo Mantenimiento (Acumulado ${this.selectedYear})`;
    }
  }

  public changeBrowsingYear(delta: number): void {
    this.browsingYear += delta;
  }

  public isMonthDisabled(month: number): boolean {
    const now = new Date();
    if (this.browsingYear < now.getFullYear()) return false;
    if (this.browsingYear > now.getFullYear()) return true;
    return month > now.getMonth();
  }

  public getMonthName(month: number): string {
    return new Date(2000, month, 1)
      .toLocaleString('es-CO', { month: 'short' })
      .replace('.', '')
      .toUpperCase();
  }

  /**
   * Alcance de todas las gráficas. Se recalcula sobre el reporte ya cargado,
   * que cubre el año entero: ninguna gráfica vuelve a pedir nada.
   *
   * La única excepción es el detalle de una barra abierta: al pasar al mes, su
   * eje es el viaje y eso solo lo sabe el servidor — ver `refreshGroupDetail`.
   *
   * Dos gráficas cambian de tipo con el alcance: con el mes en el eje X son
   * líneas, y al pasar a un eje de grupos serían una línea sobre placas, que
   * no se lee. ng2-charts vuelve a crear el canvas cuando cambia `type`.
   */
  public setScope(scope: 'mes' | 'anio'): void {
    if (this.scope === scope) return;
    this.scope = scope;
    this.monthlyTripsType = scope === 'mes' ? 'bar' : 'line';
    this.monthlyProfitType = scope === 'mes' ? 'bar' : 'line';
    this.updateCurrentMonthName();

    this.invalidateGroupDetail();
    this.rebuildCharts();
    void this.refreshGroupDetail();
  }

  /**
   * Cambia el periodo. Solo recarga cuando cambia el año: el reporte trae los
   * doce meses de una vez, así que moverse dentro del mismo año se resuelve en
   * memoria y no cuesta ninguna petición.
   */
  public setHistoryDate(month: number, year: number): void {
    const cambioAnio = year !== this.selectedYear;
    this.selectedMonth = month;
    this.selectedYear = year;
    this.updateCurrentMonthName();

    if (!this.currentUser) return;

    if (cambioAnio) {
      this.loadData(this.currentUser);
      return;
    }

    this.invalidateGroupDetail();
    this.rebuildCharts();
    void this.refreshGroupDetail();
    this.updateCharts();
  }

  /**
   * Recorta una etiqueta de categoría para móvil. Solo afecta a lo que se
   * pinta: la clave del grupo sigue siendo el nombre completo, así que no
   * mezcla acumulados ni cambia ningún cálculo.
   *
   * Con el administrador el eje lleva nombres de propietario, que en un
   * teléfono se comen el área del gráfico. Se reduce a nombre + primer
   * apellido siguiendo el orden habitual (nombres primero, luego apellidos);
   * si aun así no cabe, o si es una sola palabra, se trunca. Las placas y los
   * meses no llegan al umbral, así que quedan intactos.
   */
  /**
   * En móvil, con el eje agrupado por propietario, el nombre completo se come
   * el área de trazado incluso recortado. Ahí el eje pasa a mostrar un avatar
   * con las iniciales y el nombre queda en el tooltip. En escritorio, y para
   * los ejes de placas, no cambia nada.
   *
   * Se evalúa en cada render — no se congela al configurar —, así que girar el
   * teléfono o cambiar de rol lo activa y desactiva solo.
   */
  get avatarTicks(): boolean {
    return this.tickMode('grupo') === 'avatar';
  }

  /**
   * Cómo se dibuja el rótulo del eje de categorías. En escritorio siempre lo
   * escribe Chart.js; en móvil se dibuja a mano cuando la etiqueta es larga:
   *
   *   grupo + administrador  → nombre del propietario  → avatar de iniciales
   *   grupo + propietario/conductor → placa            → girado 90°
   *   viaje + administrador  → "HTM123 #45"            → girado 90°
   *   viaje + propietario/conductor → "#45"            → cabe, no se toca
   *
   * En el alcance de año el eje de las tarjetas de viaje son los meses, que
   * también caben.
   */
  private tickMode(modo: 'grupo' | 'viaje'): 'avatar' | 'girado' | 'normal' {
    if (window.innerWidth >= 768) return 'normal';
    if (modo === 'grupo') return this.groupByOwner ? 'avatar' : 'girado';
    return this.groupByOwner && this.scope === 'mes' ? 'girado' : 'normal';
  }

  /**
   * La otra mitad del ahorro en móvil: con el eje agrupado por vehículo, la
   * placa se gira 90° y el eje pasa de ~60 px a 22. Girada se lee de abajo
   * hacia arriba, la orientación habitual de un rótulo de eje.
   *
   * No se le aplica el avatar porque una placa de seis caracteres ya es la
   * abreviatura: recortarla a dos letras no identificaría nada.
   */
  get rotatedPlateTicks(): boolean {
    return this.tickMode('grupo') === 'girado';
  }

  /** Dos letras en mayúscula: la inicial del nombre y la del apellido. */
  private initials(label: string): string {
    const partes = (label ?? '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  /**
   * Dibuja el avatar de cada categoría en el espacio que el eje reserva.
   *
   * Va en `afterDraw` para quedar sobre la rejilla. Gris fijo para todos: el
   * color del eje no identifica nada —la identidad la dan las iniciales y el
   * tooltip—, y un tono por propietario competiría con el color de las barras.
   *
   * El gris es el mismo en ambos temas, y a propósito: es claro para que el
   * texto negro se lea sobre él, y con suficiente cuerpo para separarse del
   * fondo oscuro.
   */
  private ownerAvatarTicks(modo: 'grupo' | 'viaje' = 'grupo'): Plugin<'bar'> {
    return {
      id: 'ownerAvatarTicks',
      afterDraw: (chart) => {
        /* El eje de categorías es Y en las barras horizontales y X en las
           verticales; el rótulo se coloca a un lado o debajo según cuál sea. */
        const horizontal = (chart.options as any)?.indexAxis === 'y';
        const forma = this.tickMode(modo);
        const avatar = forma === 'avatar';
        // Girado solo en horizontal: bajo las barras costaría más alto del que ahorra.
        const girado = forma === 'girado' && horizontal;
        if (!avatar && !girado) return;

        const scale: any = (chart as any).scales?.[horizontal ? 'y' : 'x'];
        const labels = (chart.data.labels ?? []) as string[];
        if (!scale || !labels.length) return;

        const ctx = chart.ctx;
        const R = 13;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        labels.forEach((label, i) => {
          const tick = scale.getPixelForTick(i);
          if (tick == null || Number.isNaN(tick)) return;

          // Girado: el eje solo reserva 22 px, así que el texto va vertical.
          if (girado) {
            ctx.save();
            ctx.translate(scale.right - 11, tick);
            ctx.rotate(-Math.PI / 2);
            ctx.font = "600 10px 'Inter', sans-serif";
            ctx.fillStyle = this.chartTextColor;
            ctx.fillText(label, 0, 0);
            ctx.restore();
            return;
          }

          const cx = horizontal ? scale.right - R - 6 : tick;
          const cy = horizontal ? tick : scale.top + R + 6;

          ctx.beginPath();
          ctx.arc(cx, cy, R, 0, Math.PI * 2);
          ctx.fillStyle = DashboardComponent.AVATAR_BG;
          ctx.fill();

          ctx.font = "600 10px 'Inter', sans-serif";
          ctx.fillStyle = DashboardComponent.AVATAR_TEXT;
          ctx.fillText(this.initials(label), cx, cy + 0.5);
        });

        ctx.restore();
      },
    };
  }

  private shortenLabel(text: string): string {
    const full = (text ?? '').toString().trim();
    if (window.innerWidth >= 768 || full.length <= 12) return full;

    const p = full.split(/\s+/);
    let corto = full;
    if (p.length === 3) corto = `${p[0]} ${p[1]}`;
    else if (p.length >= 4) corto = `${p[0]} ${p[2]}`;

    return corto.length <= 16 ? corto : corto.slice(0, 15) + '…';
  }

  private formatMobileValue(value: number): string {
    if (window.innerWidth >= 768) return value.toLocaleString();

    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    } else if (absValue >= 1000) {
      return (value / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return value.toString();
  }

  private setupThemeObserver() {
    this.updateChartTheme();
    this.observer = new MutationObserver(() => this.updateChartTheme());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-bs-theme'],
    });
  }

  private updateChartTheme() {
    const isDark =
      document.documentElement.getAttribute('data-bs-theme') === 'dark';
    /* En oscuro el gris del texto era casi tan apagado como el fondo y la
       rejilla al 5 % apenas se adivinaba. Se sube el contraste de lo que se
       lee y de lo que orienta la vista — título del gráfico, etiquetas de los
       ejes, rejilla y borde —, nunca de los datos: los colores de barras y
       líneas viven en los datasets y no pasan por aquí. */
    const textColor = isDark ? '#cbd5e1' : '#475569';
    this.chartTextColor = textColor;
    const gridColor = isDark
      ? 'rgba(255, 255, 255, 0.14)'
      : 'rgba(0, 0, 0, 0.05)';

    const applyTheme = (options: any) => {
      if (!options.scales) options.scales = {};
      if (!options.scales.x) options.scales.x = {};
      if (!options.scales.y) options.scales.y = {};

      /* El eje de categorías se recorta en móvil. `callback` recibe el índice,
         así que la etiqueta se pide a la escala con `getLabelForValue`; por eso
         es una función normal y no una flecha: necesita su `this`. */
      const comp = this;
      const categoryTick = function (this: any, value: any) {
        return comp.shortenLabel(this.getLabelForValue(value));
      };

      options.scales.x.ticks = {
        color: textColor,
        font: { family: "'Inter', sans-serif", size: 11 },
        callback: categoryTick,
        /* Nunca inclinadas. Por defecto Chart.js gira las etiquetas hasta 50°
           cuando no caben, y una placa en diagonal cuesta leerla. Prefiere
           omitir alguna —`autoSkip` sigue activo— antes que torcerlas. */
        maxRotation: 0,
        minRotation: 0,
      };
      options.scales.y.ticks = {
        ...options.scales.y.ticks,
        color: textColor,
        font: { family: "'Inter', sans-serif", size: 11 },
        callback: (value: any) => this.formatMobileValue(value),
      };
      options.scales.x.grid = { color: gridColor, drawBorder: false };
      options.scales.y.grid = { color: gridColor, drawBorder: false };
      /* En Chart.js 4 el borde del eje ya no se controla desde `grid`. */
      options.scales.x.border = { color: gridColor };
      options.scales.y.border = { color: gridColor };
      /* Ninguna grafica declara `legend.labels`, asi que el objeto se crea
         aqui: sin el, Chart.js pinta las etiquetas de la leyenda ("Cargado",
         "Redondo", "Vacio", ...) con su color por defecto (#666), ilegible
         sobre el fondo del tema oscuro. */
      if (options.plugins?.legend) {
        options.plugins.legend.labels = {
          ...options.plugins.legend.labels,
          color: textColor,
          font: { family: "'Inter', sans-serif", size: 12 },
          /* En el alcance de año la leyenda lleva un nombre por grupo y
             desborda igual que el eje: se recorta con el mismo criterio. */
          generateLabels: (chart: any) => {
            const base = (
              Chart.defaults.plugins.legend.labels as any
            ).generateLabels(chart);
            return base.map((l: any) => ({
              ...l,
              text: this.shortenLabel(l.text),
            }));
          },
        };
      }
      if (options.plugins?.title) {
        options.plugins.title.color = textColor;
        options.plugins.title.font = {
          family: "'Inter', sans-serif",
          size: 14,
          weight: 'bold',
        };
        /* Sin `padding` Chart.js reserva 10 px arriba, que sumados al del
           cuerpo de la tarjeta separaban demasiado el título del subtítulo. */
        options.plugins.title.padding = { top: 0, bottom: 8 };
      }
    };

    applyTheme(this.tripsByVehicleOptions);
    applyTheme(this.financialOptions);
    applyTheme(this.monthVehicleFinOptions);
    applyTheme(this.maintenanceOptions);
    applyTheme(this.monthlyTripsOptions);
    applyTheme(this.monthlyProfitOptions);
    applyTheme(this.vehicleProfitOptions);
    applyTheme(this.monthProfitDetailOptions);
    applyTheme(this.tripProfitDetailOptions);

    /* Las dos gráficas de ingresos vs egresos van siempre en horizontal. Sus
       categorías son etiquetas largas —viajes, placas o nombres de
       propietario— que en vertical se apilan giradas. */
    (this.financialOptions as any).indexAxis = 'y';
    (this.monthVehicleFinOptions as any).indexAxis = 'y';

    /* Barras horizontales: los ejes van al revés que en el resto de gráficas.
       Aquí el eje de valores es X (pesos) y el de categorías es Y (placas),
       así que el formateador de moneda se mueve a X y se deja que Y use su
       propia etiqueta — si no, `formatMobileValue` destroza las placas. */
    const horizontales: any[] = [
      this.vehicleProfitOptions,
      this.maintenanceOptions,
      this.monthProfitDetailOptions,
      this.tripProfitDetailOptions,
      this.financialOptions,
      this.monthVehicleFinOptions,
    ];

    horizontales.forEach((o: any) => {
      const categoryTick = o.scales.x.ticks.callback;
      o.scales.x.ticks = {
        ...o.scales.x.ticks,
        callback: (value: any) => this.formatMobileValue(value),
      };
      o.scales.y.ticks = { ...o.scales.y.ticks, callback: categoryTick };
    });

    /* Las tres gráficas cuyo eje son los grupos. En móvil con agrupación por
       propietario, el eje deja de escribir el nombre —lo dibuja el plugin como
       avatar— y se le fija un ancho: sin eso Chart.js lo colapsa al no haber
       texto que medir. El nombre completo sigue en el tooltip. */
    const self = this;

    /* Gráficas cuyo eje de categorías son los grupos. En móvil con agrupación
       por propietario el eje deja de escribir el nombre —lo dibuja el plugin
       como avatar— y se le fija el tamaño: sin eso Chart.js lo colapsa al no
       haber texto que medir. El nombre completo sigue en el tooltip. */
    const ejeAMano = (
      o: any,
      eje: 'x' | 'y',
      modo: 'grupo' | 'viaje',
      tamano: number,
    ) => {
      /* El eje Y admite las dos formas dibujadas a mano; el X solo el avatar,
         porque un rótulo girado bajo las barras costaría más alto del que
         ahorra. */
      const forma = () => {
        const f = self.tickMode(modo);
        return f === 'girado' && eje !== 'y' ? 'normal' : f;
      };

      /* El tooltip se dispara por toda la fila —o columna—, no solo sobre la
         barra. Es lo que hace que tocar el avatar o la placa girada muestre el
         nombre completo: el rótulo se dibuja dentro del canvas pero fuera del
         área de trazado, y con `intersect` activo ahí no había nada que tocar.
         De paso, acertarle a una barra de 26 px con el dedo deja de ser
         necesario. */
      o.interaction = { mode: 'index', intersect: false, axis: eje };

      const categoryTick = o.scales[eje].ticks.callback;
      o.scales[eje].ticks = {
        ...o.scales[eje].ticks,
        // `function` y no flecha: el callback necesita el `this` de la escala.
        callback: function (this: any, value: any) {
          return forma() === 'normal' ? categoryTick.call(this, value) : '';
        },
      };
      o.scales[eje].afterFit = (scale: any) => {
        const f = forma();
        if (f === 'normal') return;
        const px = f === 'avatar' ? tamano : 22;
        if (eje === 'y') scale.width = px;
        else scale.height = px;
      };
    };
    const ejeDeGrupos = (o: any, eje: 'x' | 'y', tamano: number) =>
      ejeAMano(o, eje, 'grupo', tamano);

    // Barras horizontales: los grupos van en Y.
    ejeDeGrupos(this.vehicleProfitOptions, 'y', 46);
    ejeDeGrupos(this.maintenanceOptions, 'y', 46);
    ejeDeGrupos(this.monthVehicleFinOptions, 'y', 46);
    // Barras verticales: los grupos van en X.
    ejeDeGrupos(this.tripsByVehicleOptions, 'x', 40);

    /* Tarjetas de detalle por viaje. Su etiqueta solo es larga para el
       administrador, donde lleva la placa además del número. */
    ejeAMano(this.tripProfitDetailOptions, 'y', 'viaje', 22);
    ejeAMano(this.financialOptions, 'y', 'viaje', 22);

    /* Gráficas de líneas: aquí el grupo no está en el eje sino en la leyenda,
       una entrada por propietario. El círculo conserva el color de la serie
       —es lo que la identifica contra su línea— y el texto pasa a iniciales.
       El nombre completo sigue en el tooltip de cada punto. */
    [this.monthlyTripsOptions, this.monthlyProfitOptions].forEach((o: any) => {
      o.plugins.legend.labels = {
        ...o.plugins.legend.labels,
        usePointStyle: true,
        pointStyle: 'circle',
        boxWidth: 8,
        generateLabels: (chart: any) => {
          const base = (
            Chart.defaults.plugins.legend.labels as any
          ).generateLabels(chart);
          // Con una sola serie la leyenda no es el grupo: no se abrevia.
          const porGrupo = (chart.data.datasets?.length ?? 0) > 1;
          return base.map((l: any) => ({
            ...l,
            text:
              self.avatarTicks && porGrupo
                ? self.initials(l.text)
                : self.shortenLabel(l.text),
          }));
        },
      };
    });
  }

  async loadOwners() {
    const filter = new ModelFilterTable(
      [],
      new Pagination(500, 0),
      new Sort('name', true),
    );
    try {
      const resp = await lastValueFrom(
        this.ownerService.getOwnerFilter(filter),
      );
      this.owners = resp?.data?.content || [];
    } catch (error) {
      console.error('Error loading owners:', error);
    }
  }

  onOwnerChange() {
    if (this.currentUser) {
      this.loadData(this.currentUser);
    }
  }

  /**
   * Carga del tablero: una sola petición agregada (Endpoint A).
   *
   * Antes eran hasta ocho peticiones y ~61.000 registros —los viajes, los
   * gastos y los vehículos del año, más las resoluciones seriales de
   * propietario o conductor—, y las nueve agregaciones ocurrían en el
   * navegador. Ahora el reporte llega agregado por grupo y mes, y el alcance
   * (qué vehículos ve quién) lo resuelve el servidor con el token.
   *
   * El reporte cubre el año entero, así que cambiar de mes o de alcance no
   * vuelve a pedir nada: se reconstruye sobre lo que ya está en memoria.
   */
  async loadData(user: any) {
    this.loading = true;
    try {
      const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();
      this.userRole = role;
      /* La orientación de las gráficas financieras depende del rol, que hasta
         aquí no se conocía: el tema se reaplica ya sabiéndolo. */
      this.updateChartTheme();

      if (
        (role.includes('ADMINISTRADOR') || role.includes('PROPIETARIO')) &&
        this.activeTripsCollapsed === undefined
      ) {
        this.activeTripsCollapsed = true;
      }

      /* `ownerId` solo lo manda el administrador filtrando por un propietario;
         para los demas roles el alcance sale del token. */
      const report = await lastValueFrom(
        this.reportService.getDashboard({
          year: this.selectedYear,
          groupBy: this.groupByOwner ? 'owner' : 'vehicle',
          ownerId: this.groupByOwner ? this.selectedOwnerId : null,
        }),
      );

      this.indexReport(report?.groups ?? []);
      await this.loadActiveTrips(report?.activeTrips ?? []);

      this.rebuildCharts();
      this.updateCharts();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      this.clearChartData();
      this.updateCharts();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Normaliza el reporte: los doce meses de cada grupo indexados por mes y las
   * etiquetas en orden alfabético.
   *
   * Un mes que el backend omita queda en cero, no ausente: los builders leen
   * los doce por índice y un hueco los rompería. El detalle en caché se
   * descarta — pertenece al reporte anterior.
   */
  private indexReport(groups: DashboardGroup[]): void {
    this.groupMonths = new Map();
    this.groupKeyByLabel = {};

    groups.forEach((g) => {
      const label = g?.label?.trim();
      if (!label) return;

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

      this.groupMonths.set(label, meses);
      this.groupKeyByLabel[label] = g.key;
    });

    this.groupLabels = [...this.groupMonths.keys()].sort((a, b) =>
      a.localeCompare(b),
    );

    this.detailCache.clear();
    this.invalidateGroupDetail();
  }

  /** Los doce meses del grupo. Vacíos si la etiqueta ya no está en el reporte. */
  private monthsOf(label: string | null | undefined): DashboardMonth[] {
    return (label && this.groupMonths.get(label)) || [];
  }

  /**
   * Tarjetas de viajes activos.
   *
   * El reporte solo trae el resumen de cada viaje en curso; la tarjeta necesita
   * el viaje completo, el vehículo (foto, marca, conductor) y sus gastos. Se
   * piden por id: son un puñado de registros y no los 20.000 del lote anterior,
   * y el alcance por rol ya lo aplicó el servidor al armar el reporte.
   */
  private async loadActiveTrips(actives: DashboardActiveTrip[]): Promise<void> {
    this.activeTrips = [];
    this.vehicles = [];

    const tripIds = (actives ?? [])
      .map((a) => a?.tripId)
      .filter((id) => id != null);
    if (!tripIds.length) return;

    const ids = tripIds.join(',');
    const tripsResp: any = await lastValueFrom(
      this.tripService.getTripFilter(
        new ModelFilterTable(
          [new Filter('id', 'in', ids)],
          new Pagination(tripIds.length, 0),
          new Sort('id', false),
        ),
      ),
    );
    const trips: ModelTrip[] = tripsResp?.data?.content || [];
    if (!trips.length) return;

    const vehicleIds = [
      ...new Set(trips.map((t) => t.vehicleId).filter((id) => id != null)),
    ];

    const [expensesResp, vehiclesResp]: any[] = await Promise.all([
      lastValueFrom(
        this.expenseService.getExpenseFilter(
          new ModelFilterTable(
            [new Filter('tripId', 'in', ids)],
            new Pagination(1000, 0),
            new Sort('id', false),
          ),
        ),
      ),
      vehicleIds.length
        ? lastValueFrom(
            this.vehicleService.getVehicleFilter(
              new ModelFilterTable(
                [new Filter('id', 'in', vehicleIds.join(','))],
                new Pagination(vehicleIds.length, 0),
                new Sort('id', false),
              ),
            ),
          )
        : Promise.resolve(null),
    ]);

    const expenses: ModelExpense[] = expensesResp?.data?.content || [];
    this.vehicles = vehiclesResp?.data?.content || [];

    this.mapBrandNames(this.vehicles);
    this.mapDriverNames(this.vehicles);

    this.processActiveTrips(trips, expenses);
  }

  /**
   * Reconstruye las nueve gráficas sobre el reporte ya cargado.
   *
   * El orden es el mismo de siempre y no es indiferente:
   * `processVehicleProfit` anula la selección si su grupo desapareció del eje,
   * y `processProfitByMonth` es quien alimenta el detalle anual.
   */
  private rebuildCharts(): void {
    this.processTripsByVehicle();
    this.processFinancialData();
    this.processMonthVehicleFin();
    this.processVehicleProfit();
    this.processMaintenanceData();
    this.processTripsByMonth();
    this.processProfitByMonth();
  }

  private processActiveTrips(trips: ModelTrip[], expenses: ModelExpense[]) {
    this.activeTrips = [];
    this.vehicles.forEach((v) => {
      const activeTrip = trips.find(
        (t) =>
          (t.vehicleId === v.id || t.vehiclePlate === v.plate) &&
          t.status?.toUpperCase() === 'EN CURSO',
      );
      if (activeTrip) {
        const tripExpenses = expenses.filter((e) => e.tripId === activeTrip.id);
        this.activeTrips.push({
          vehicle: v,
          trip: activeTrip,
          expenses: tripExpenses,
        });
      }
    });
  }

  private clearChartData() {
    this.groupMonths = new Map();
    this.groupLabels = [];
    this.groupKeyByLabel = {};
    this.invalidateGroupDetail();

    this.tripsByVehicleData.labels = [];
    // Puede tener una o tres series según el rol
    this.tripsByVehicleData.datasets.forEach((d) => (d.data = []));
    this.financialData.labels = [];
    this.financialData.datasets[0].data = [];
    this.financialData.datasets[1].data = [];
    this.monthVehicleFinData.labels = [];
    this.monthVehicleFinData.datasets[0].data = [];
    this.monthVehicleFinData.datasets[1].data = [];
    this.maintenanceData.labels = [];
    this.maintenanceData.datasets[0].data = [];
    this.monthlyTripsData.datasets = [];
    this.monthlyProfitData.datasets = [];
    this.vehicleProfitData.labels = [];
    this.vehicleProfitData.datasets[0].data = [];
    this.vehicleProfitDetail = {};
    this.profitByGroupMonth = {};
    this.profitActiveMonths = {};
    this.monthProfitActive = [];
    this.selectedProfitGroup = null;
    this.monthProfitDetailData.labels = [];
    this.monthProfitDetailData.datasets[0].data = [];
    this.tripProfitDetailData.labels = [];
    this.tripProfitDetailData.datasets[0].data = [];
    this.tripProfitFreight = 0;
    this.tripProfitTripExpenses = 0;
    this.tripProfitOtherExpenses = 0;

    /* Los totales y estadísticos son campos, no getters: este es el único
       camino que vacía las gráficas sin pasar por sus builders, así que aquí
       hay que devolverlos a cero o el pie mostraría cifras del lote anterior. */
    this.tripsByVehicleTotal = 0;
    this.financialIncomeTotal = 0;
    this.financialExpenseTotal = 0;
    this.financialOtherExpenses = 0;
    this.monthVehicleFinIncomeTotal = 0;
    this.monthVehicleFinExpenseTotal = 0;
    this.vehicleProfitTotal = 0;
    this.maintenanceTotal = 0;
    this.monthProfitFreight = 0;
    this.monthProfitTripExpenses = 0;
    this.monthProfitOtherExpenses = 0;
    this.monthProfitStats = DashboardComponent.STATS_VACIO;
    this.tripProfitStats = DashboardComponent.STATS_VACIO;
  }

  /** Propietario y conductor ven una barra por tipo de viaje; el admin, el total */
  get showTripTypeBreakdown(): boolean {
    return this.userRole === 'PROPIETARIO' || this.userRole === 'CONDUCTOR';
  }

  /**
   * Los viajes sin tipo (anteriores a la funcionalidad) cuentan como cargados.
   *
   * `tripsByType` es un mapa por clave existente —para que un tipo nuevo no
   * obligue a desplegar backend—, así que puede traer un tipo que este cliente
   * todavía no conoce: se pliega también a CARGADO en vez de perderse.
   */
  private canonicalTripType(type: string): string {
    const t = (type || '').toUpperCase();
    return this.TRIP_TYPE_SERIES.some((s) => s.id === t) ? t : 'CARGADO';
  }

  /** Viajes del mes por tipo, ya canonizado. */
  private tripCountsByType(m: DashboardMonth): Record<string, number> {
    const out: Record<string, number> = {};
    Object.entries(m.tripsByType ?? {}).forEach(([type, n]) => {
      const tipo = this.canonicalTripType(type);
      out[tipo] = (out[tipo] || 0) + (n || 0);
    });
    return out;
  }

  /** Viajes del mes. Con `vacios: false` queda fuera el viaje vacio, que no
   *  factura y por eso no entra en las gráficas de rendimiento. */
  private tripCount(m: DashboardMonth, vacios = true): number {
    return Object.entries(m.tripsByType ?? {}).reduce((a, [type, n]) => {
      if (!vacios && this.canonicalTripType(type) === 'VACIO') return a;
      return a + (n || 0);
    }, 0);
  }

  /** Gastos del mes que no cuelgan de ningun viaje del mes: mantenimiento y
   *  gastos sueltos, sumando todos los tipos. */
  private otherExpenses(m: DashboardMonth): number {
    return Object.values(m.expensesByType ?? {}).reduce(
      (a, v) => a + (v || 0),
      0,
    );
  }

  /** Todo el egreso del mes: el imputado a viajes y el que no. */
  private totalExpenses(m: DashboardMonth): number {
    return (m.tripExpenses || 0) + this.otherExpenses(m);
  }

  /** Los meses que entran en el alcance vigente: el seleccionado, o los doce. */
  private scopedMonths(label: string): DashboardMonth[] {
    const meses = this.monthsOf(label);
    if (this.scope !== 'mes') return meses;
    const mes = meses[this.selectedMonth];
    return mes ? [mes] : [];
  }

  private buildTripTypeDatasets(
    labels: string[],
    countsByType: Record<string, Record<string, number>>,
  ) {
    return this.TRIP_TYPE_SERIES.map((serie) => ({
      label: serie.label,
      backgroundColor: serie.color,
      data: labels.map((l) => countsByType[l]?.[serie.id] ?? 0),
    }));
  }

  /**
   * Viajes por vehículo. En alcance "anio" cuenta los doce meses del reporte y
   * en "mes" solo el seleccionado. Propietario y conductor ven el desglose por
   * tipo de viaje.
   */
  private processTripsByVehicle() {
    const counts: Record<string, number> = {};
    const countsByType: Record<string, Record<string, number>> = {};

    /* Todo grupo del reporte aparece en el eje aunque no haya rodado: el
       backend lo devuelve con sus meses en cero, no lo omite. */
    this.groupLabels.forEach((label) => {
      counts[label] = 0;
      countsByType[label] = {};
      this.scopedMonths(label).forEach((m) => {
        Object.entries(this.tripCountsByType(m)).forEach(([tipo, n]) => {
          counts[label] += n;
          countsByType[label][tipo] = (countsByType[label][tipo] || 0) + n;
        });
      });
    });

    const labels = [...this.groupLabels];

    this.tripsByVehicleTotal = labels.reduce((a, l) => a + counts[l], 0);

    this.tripsByVehicleData = {
      labels: labels,
      datasets: this.showTripTypeBreakdown
        ? this.buildTripTypeDatasets(labels, countsByType)
        : [
            {
              data: labels.map((l) => counts[l]),
              label: 'Viajes',
              // Un color por grupo, el mismo que ese grupo tiene en las demás.
              backgroundColor: labels.map(
                (_, i) => this.GROUP_COLORS[i % this.GROUP_COLORS.length],
              ),
            },
          ],
    };
  }

  /**
   * Ingresos y gastos acumulados por grupo, dentro del alcance vigente.
   *
   * Alimenta tanto "Ingresos vs Gastos por Vehículo" como "Utilidad por
   * Vehículo": las dos parten del mismo acumulado y solo cambia cómo lo
   * pintan, así que el criterio vive en un único sitio.
   *
   * El gasto es TODO el del grupo —el imputado a viajes y el que no, como el
   * mantenimiento—, a diferencia de "Ingresos vs Egresos", que solo cuenta lo
   * que cuelga de un viaje. Todos los grupos aparecen, aunque queden en cero.
   */
  private accumulateByGroup(): Record<
    string,
    { income: number; expense: number }
  > {
    const stats: Record<string, { income: number; expense: number }> = {};

    this.groupLabels.forEach((label) => {
      const acc = { income: 0, expense: 0 };
      this.scopedMonths(label).forEach((m) => {
        acc.income += m.freight || 0;
        acc.expense += this.totalExpenses(m);
      });
      stats[label] = acc;
    });

    return stats;
  }

  private processMonthVehicleFin() {
    const stats = this.accumulateByGroup();

    const labels = [...this.groupLabels];
    const incomeData = labels.map((l) => stats[l].income);
    const expenseData = labels.map((l) => stats[l].expense);

    this.monthVehicleFinIncomeTotal = incomeData.reduce(
      (a, v) => a + (v || 0),
      0,
    );
    this.monthVehicleFinExpenseTotal = expenseData.reduce(
      (a, v) => a + (v || 0),
      0,
    );

    this.monthVehicleFinData = {
      labels: labels,
      datasets: [
        { ...this.monthVehicleFinData.datasets[0], data: incomeData },
        { ...this.monthVehicleFinData.datasets[1], data: expenseData },
      ],
    };
  }

  /**
   * Utilidad neta (flete menos gastos) por vehículo. Responde de un vistazo
   * qué camión deja dinero y cuál cuesta: el cero queda en medio y la barra
   * sale a la derecha o a la izquierda según el signo.
   *
   * El criterio de fecha del gasto ya no vive aqui: el reporte imputa cada
   * gasto a un mes en el servidor, de modo que todas las gráficas del tablero
   * cuadran entre sí por construcción.
   */
  private processVehicleProfit() {
    const stats = this.accumulateByGroup();

    /* Con `indexAxis: 'y'` Chart.js pinta la primera etiqueta arriba, así que
       ordenar de mayor a menor deja el vehículo más rentable en la cabecera. */
    const util = (k: string) => stats[k].income - stats[k].expense;
    const labels = [...this.groupLabels].sort((a, b) => util(b) - util(a));

    const detail: Record<
      string,
      { ingresos: number; gastos: number; margen: number }
    > = {};
    const data = labels.map((l) => {
      const s = stats[l];
      const neto = s.income - s.expense;
      detail[l] = {
        ingresos: s.income,
        gastos: s.expense,
        margen: s.income > 0 ? (neto / s.income) * 100 : 0,
      };
      return neto;
    });

    this.vehicleProfitDetail = detail;
    this.vehicleProfitTotal = data.reduce((a, v) => a + (v || 0), 0);
    /* La selección solo vive mientras exista su barra: al cambiar de periodo un
       grupo puede desaparecer del eje. */
    if (
      this.selectedProfitGroup &&
      !labels.includes(this.selectedProfitGroup)
    ) {
      this.selectedProfitGroup = null;
      this.invalidateGroupDetail();
    }
    this.buildTripProfitDetail();
    this.vehicleProfitData = {
      labels,
      datasets: [
        {
          ...this.vehicleProfitData.datasets[0],
          data,
          backgroundColor: data.map((v) =>
            v >= 0
              ? DashboardComponent.PROFIT_POS
              : DashboardComponent.PROFIT_NEG,
          ),
        },
      ],
    };
  }

  /** El título nombra la dimensión del eje X, que cambia con el alcance. */
  private financialTitle(): string {
    return this.scope === 'anio'
      ? `Ingresos vs Egresos por Mes (${this.selectedYear})`
      : `Ingresos vs Egresos por Viaje (${this.currentMonthName})`;
  }

  /**
   * El administrador ve la flota entera: una barra por vehículo se vuelve
   * ilegible, así que para ese rol las gráficas por vehículo se agrupan por
   * propietario. Es el mismo criterio que ya aplica "Ingresos vs Egresos".
   *
   * Se compara con `includes` y no con `===` porque es lo que decide la carga
   * de `owners`: si el nombre del rol trae sufijos, agrupar sin los nombres
   * cargados dejaría el eje lleno de "Propietario 12".
   */
  get groupByOwner(): boolean {
    return this.userRole.includes('ADMINISTRADOR');
  }

  /**
   * Pista de que las barras se pueden tocar. En escritorio va como texto en el
   * encabezado; en móvil no cabe junto al título, así que se reduce a un ícono
   * y el texto se despliega al tocarlo. Un `title` a secas no serviría: el
   * tooltip nativo depende del hover, que en una pantalla táctil no existe.
   */
  public hintCard: string | null = null;

  public readonly scopeHint = 'Toca una barra para ver el detalle';

  /** Dimensión del eje de categorías, para titular las gráficas. */
  get groupDimension(): string {
    return this.groupByOwner ? 'Propietario' : 'Vehículo';
  }

  /**
   * Ingresos (flete) contra egresos del grupo abierto en "Utilidad por
   * Vehículo/Propietario". Es un detalle de esa gráfica: sin barra tocada no
   * hay nada que pintar.
   *
   * En alcance de mes el eje es el VIAJE y en el de año, el MES. El eje de
   * meses sale del propio reporte; el de viajes, del detalle bajo demanda
   * —Endpoint B—, que es la única fuente que baja del mes al viaje. Comparte
   * esas filas con "Utilidad por Viaje", de modo que las dos tarjetas cierran
   * con la misma utilidad.
   */
  private processFinancialData() {
    const pintar = (labels: string[], ing: number[], gas: number[]) => {
      this.financialData = {
        labels,
        datasets: [
          { ...this.financialData.datasets[0], data: ing },
          { ...this.financialData.datasets[1], data: gas },
        ],
      };
      this.financialIncomeTotal = ing.reduce((a, v) => a + (v || 0), 0);
      this.financialExpenseTotal = gas.reduce((a, v) => a + (v || 0), 0);
    };

    if (!this.selectedProfitGroup) {
      this.financialOtherExpenses = 0;
      pintar([], [], []);
      return;
    }

    // --- Año: un grupo por mes. Como máximo 12 barras dobles. ---
    if (this.scope !== 'mes') {
      const meses = this.monthsOf(this.selectedProfitGroup);
      this.financialOtherExpenses = meses.reduce(
        (a, m) => a + this.otherExpenses(m),
        0,
      );
      pintar(
        [...this.MESES_CORTOS],
        this.MESES_CORTOS.map((_, m) => meses[m]?.freight || 0),
        this.MESES_CORTOS.map((_, m) => meses[m]?.tripExpenses || 0),
      );
      return;
    }

    // --- Mes: un grupo por viaje, en orden de placa y número. ---
    this.financialOtherExpenses = this.groupTripOthers;
    const ordenadas = [...this.groupTripRows].sort((a, b) =>
      a.label.localeCompare(b.label),
    );
    pintar(
      ordenadas.map((f) => f.label),
      ordenadas.map((f) => f.freight),
      ordenadas.map((f) => f.gasto),
    );
  }

  /**
   * Inversión en mantenimiento por vehículo, en el mes o en el año según el
   * alcance. Es el desglose de una categoría de los egresos que ya suma
   * "Ingresos vs Egresos por Vehículo", no una cifra aparte.
   *
   * El reporte indexa los gastos por `category.expenseTypeId`, así que el
   * mantenimiento se lee por su clave en vez de filtrar el lote entero.
   */
  private processMaintenanceData() {
    const labels = [...this.groupLabels];
    const data = labels.map((label) =>
      this.scopedMonths(label).reduce(
        (a, m) => a + (m.expensesByType?.[MAINTENANCE_EXPENSE_TYPE] || 0),
        0,
      ),
    );

    this.maintenanceTotal = data.reduce((a, v) => a + (v || 0), 0);

    this.maintenanceData = {
      labels,
      datasets: [
        {
          ...this.maintenanceData.datasets[0],
          data: data,
        },
      ],
    };
  }

  /**
   * Viajes por vehículo con eje X variable — ver el comentario de `scope`. El
   * viaje vacio queda fuera en ambos alcances, igual que en el resto de
   * gráficas de rendimiento.
   */
  private processTripsByMonth() {
    const colors = this.GROUP_COLORS;

    /* Mismo listado en los dos alcances: los grupos salen del reporte, que
       cubre el año completo, así que el eje de "mes" no pierde un grupo por no
       haber rodado ese mes. */
    const labels = [...this.groupLabels];

    const porMes: Record<string, number[]> = {};
    labels.forEach((label) => {
      const meses = this.monthsOf(label);
      porMes[label] = this.MESES_CORTOS.map((_, m) =>
        meses[m] ? this.tripCount(meses[m], false) : 0,
      );
    });

    const datasets: any[] = [];

    // --- Mes: el eje X es el grupo. Una barra por placa o propietario. ---
    if (this.scope === 'mes') {
      datasets.push({
        data: labels.map((l) => porMes[l][this.selectedMonth]),
        label: 'Viajes',
        backgroundColor: labels.map((_, i) => colors[i % colors.length]),
      });

      this.monthlyTripsData = { labels, datasets };
      return;
    }

    // --- Año: el eje X son los 12 meses. Una línea por grupo. ---
    labels.forEach((l, index) => {
      datasets.push({
        data: porMes[l],
        label: l,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '33', // 20% opacity
        fill: false,
        tension: 0.4,
      });
    });

    /* Los labels se fijan aquí y no se heredan del objeto anterior: al volver
       del alcance de mes, en `labels` estarían los grupos. */
    this.monthlyTripsData = {
      labels: [...this.MESES_CORTOS],
      datasets: datasets,
    };
  }

  /**
   * Utilidad (flete menos gastos) por grupo y mes. El grupo es la placa, o el
   * propietario si mira un administrador — ver `groupByOwner`.
   *
   * Entra TODO el gasto del mes, también el que no cuelga de un viaje: el
   * reporte ya lo imputó al mes y al grupo en el servidor.
   */
  private processProfitByMonth() {
    const colors = this.GROUP_COLORS;
    const labels = [...this.groupLabels];

    const porMes: Record<string, number[]> = {};
    const activos: Record<string, boolean[]> = {};

    labels.forEach((label) => {
      const meses = this.monthsOf(label);
      porMes[label] = this.MESES_CORTOS.map((_, m) =>
        meses[m] ? (meses[m].freight || 0) - this.totalExpenses(meses[m]) : 0,
      );
      /* Meses con movimiento. Los marca el reporte y no se deducen de un valor
         distinto de cero: un mes puede cerrar en cero exacto habiendo tenido
         actividad, y contarlo como inactivo falsearía el mínimo y el promedio. */
      activos[label] = this.MESES_CORTOS.map((_, m) => !!meses[m]?.activity);
    });

    const datasets: any[] = [];

    /* El detalle mensual se sirve de aquí en vez de recalcular: así los doce
       meses suman exactamente la barra desde la que se abrió. */
    this.profitByGroupMonth = porMes;
    this.profitActiveMonths = activos;
    this.buildMonthProfitDetail();

    // --- Mes: el eje X es el grupo. Una barra, con el color del signo. ---
    if (this.scope === 'mes') {
      const data = labels.map((l) => porMes[l][this.selectedMonth]);
      datasets.push({
        data,
        label: 'Utilidad',
        backgroundColor: data.map((v) =>
          v >= 0
            ? DashboardComponent.PROFIT_POS
            : DashboardComponent.PROFIT_NEG,
        ),
      });

      this.monthlyProfitData = { labels, datasets };
      return;
    }

    // --- Año: el eje X son los 12 meses. Una línea por grupo. ---
    labels.forEach((l, index) => {
      datasets.push({
        data: porMes[l],
        label: l,
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '33', // 20% opacity
        fill: false,
        tension: 0.4,
      });
    });

    /* Los labels se fijan aquí y no se heredan del objeto anterior: al volver
       del alcance de mes, en `labels` estarían los grupos. */
    this.monthlyProfitData = {
      labels: [...this.MESES_CORTOS],
      datasets: datasets,
    };
  }

  private updateCharts() {
    // Force chart update after data changes
  }

  private loadBrands(): void {
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.brands = response.data;
          this.mapBrandNames(this.vehicles);
        }
      },
      error: (error: any) => {
        console.error('Error loading brands:', error);
      },
    });
  }

  private mapBrandNames(vehicles: ModelVehicle[]): void {
    if (this.brands.length > 0 && vehicles.length > 0) {
      vehicles.forEach((v) => {
        const brand = this.brands.find(
          (b) => b.id.toString() === v.vehicleBrandId.toString(),
        );
        if (brand) {
          v.vehicleBrandName = brand.name;
        }
      });
    }
  }

  private mapDriverNames(vehicles: ModelVehicle[]): void {
    vehicles.forEach((v: any) => {
      if (v.driver?.name) {
        v.currentDriverName = v.driver.name;
      }
    });
  }
}
