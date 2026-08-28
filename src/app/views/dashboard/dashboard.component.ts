import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TripService } from '../../services/trip.service';
import { VehicleService as ExpenseService } from '../../services/expense.service';
import { VehicleService } from '../../services/vehicle.service';
import { SecurityService } from '../../services/security/security.service';
import { OwnerService } from '../../services/owner.service';
import { DriverService } from '../../services/driver.service';
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

  /** Total de viajes pintados. Suma las tres series del desglose por tipo
   *  (cargado, redondo, vacío) o la única del administrador, según el rol. */
  get tripsByVehicleTotal(): number {
    return this.tripsByVehicleData.datasets.reduce(
      (acc, _, i) => acc + this.sumSerie(this.tripsByVehicleData, i),
      0,
    );
  }

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
  ];

  /** Totales de las dos series, tal como están pintadas. */
  get financialIncomeTotal(): number {
    return this.sumSerie(this.financialData, 0);
  }

  get financialExpenseTotal(): number {
    return this.sumSerie(this.financialData, 1);
  }

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
  ];

  get monthVehicleFinIncomeTotal(): number {
    return this.sumSerie(this.monthVehicleFinData, 0);
  }

  get monthVehicleFinExpenseTotal(): number {
    return this.sumSerie(this.monthVehicleFinData, 1);
  }

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
  get vehicleProfitTotal(): number {
    const data = (this.vehicleProfitData.datasets[0]?.data ?? []) as number[];
    return data.reduce((acc, v) => acc + (v || 0), 0);
  }

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
  ];

  /** Monto sin signo. El cero no se rotula: con media flota sin taller en el
   *  mes, o sin gastos en un viaje, una fila de "$0" sería solo ruido. */
  private formatMoneyLabel(v: number): string {
    if (Math.round(v) === 0) return '';
    return '$' + this.formatMobileValue(v);
  }

  public maintenancePlugins: Plugin<'bar'>[] = [
    this.barValueLabels((v) => this.formatMoneyLabel(v)),
  ];

  /* Detalle: Utilidad Mensual del grupo seleccionado ------------------------

     Se despliega bajo "Utilidad por Vehículo/Propietario" al tocar una de sus
     barras, y solo en el alcance de año: en el de mes no hay nada que
     desglosar, la barra ya ES el mes.

     Los datos no se recalculan: salen de `profitByGroupMonth`, que arma
     `processProfitByMonth` con el mismo criterio, así que los doce meses
     suman exactamente la barra de la que se abrió. */
  public selectedProfitGroup: string | null = null;

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

  /** Suma de la utilidad de los viajes, sin los gastos que no son de viaje. */
  get tripProfitTripsTotal(): number {
    const data = (this.tripProfitDetailData.datasets[0]?.data ??
      []) as number[];
    return data.reduce((acc, v) => acc + (v || 0), 0);
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
  get monthProfitStats(): ProfitStats {
    const data = (this.monthProfitDetailData.datasets[0]?.data ??
      []) as number[];
    return this.computeStats(data, this.MESES_CORTOS, this.monthProfitActive);
  }

  /** Los viajes son todos puntos válidos: no hay máscara que aplicar. */
  get tripProfitStats(): ProfitStats {
    const data = (this.tripProfitDetailData.datasets[0]?.data ??
      []) as number[];
    const labels = (this.tripProfitDetailData.labels ?? []) as string[];
    return this.computeStats(data, labels, null);
  }

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
    this.buildTripProfitDetail();
    this.processFinancialData();
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
    const { filas, otros } = this.selectedProfitGroup
      ? this.selectedGroupRows(false)
      : { filas: [], otros: 0 };
    this.monthProfitFreight = filas.reduce((a, f) => a + f.freight, 0);
    this.monthProfitTripExpenses = filas.reduce((a, f) => a + f.gasto, 0);
    this.monthProfitOtherExpenses = otros;
  }

  /**
   * Vuelca la utilidad viaje a viaje del grupo seleccionado, en el mes.
   *
   * El gasto de un viaje se resuelve por `tripId` y acotado al mes, igual que
   * lo acota la gráfica de la que cuelga. Lo que no cae en ningún viaje del mes
   * — mantenimiento, gastos sueltos, o gastos de un viaje de otro mes — se
   * acumula en `tripProfitOtherExpenses` y se muestra en el pie: sin eso, el
   * total no cuadraría con la barra que se tocó y no habría forma de saber por
   * qué.
   */
  /**
   * Filas viaje a viaje del grupo abierto, dentro del mes o del año.
   *
   * Es la fuente común de las dos tarjetas de detalle — "Utilidad por Viaje" e
   * "Ingresos vs Egresos por Viaje" —, y por eso sus totales cuadran por
   * construcción y no por coincidencia.
   *
   * El gasto se imputa por `tripId` y acotado al periodo; lo que no cae en
   * ningún viaje del periodo (mantenimiento, gastos sueltos, o gastos de un
   * viaje de otro periodo) se devuelve aparte en `otros`.
   *
   * No se excluye el viaje vacío: no factura, pero sí puede generar gasto, y
   * dejarlo fuera descuadraría el total contra la barra de origen.
   */
  private selectedGroupRows(esMes: boolean): {
    filas: { label: string; freight: number; gasto: number; mes: number }[];
    otros: number;
  } {
    const key = this.selectedProfitGroup;
    if (!key) return { filas: [], otros: 0 };

    const porPropietario = this.groupByOwner;
    const enRango = (d: Date) =>
      d.getFullYear() === this.selectedYear &&
      (!esMes || d.getMonth() === this.selectedMonth);

    const viajes = this.loadedTrips.filter((t) => {
      if (!t.startDate) return false;
      if (!enRango(new Date(t.startDate))) return false;
      return this.tripGroupKey(t, porPropietario) === key;
    });

    const ids = new Set(viajes.map((t) => t.id));
    const gastoPorViaje: Record<string, number> = {};
    let otros = 0;

    this.loadedExpenses.forEach((e) => {
      const d = e.creationDate ? new Date(e.creationDate) : null;
      if (!d || !enRango(d)) return;
      const vehicle = this.vehicles.find((v) => v.id === e.vehicleId);
      if (this.vehicleGroupKey(vehicle, porPropietario) !== key) return;

      if (e.tripId != null && ids.has(e.tripId)) {
        gastoPorViaje[e.tripId] =
          (gastoPorViaje[e.tripId] || 0) + (e.amount || 0);
      } else {
        otros += e.amount || 0;
      }
    });

    const filas = viajes.map((t) => ({
      label: `${(t.vehiclePlate || t.vehicle?.plate || 'S/P').toUpperCase()} #${t.numberTrip ?? t.id}`,
      freight: t.freight || 0,
      gasto: gastoPorViaje[String(t.id)] || 0,
      mes: new Date(t.startDate as string).getMonth(),
    }));

    return { filas, otros };
  }

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
    };

    if (!this.selectedProfitGroup || this.scope !== 'mes') {
      this.tripProfitFreight = 0;
      this.tripProfitTripExpenses = 0;
      this.tripProfitOtherExpenses = 0;
      pintar([], []);
      return;
    }

    const { filas, otros } = this.selectedGroupRows(true);
    this.tripProfitFreight = filas.reduce((a, f) => a + f.freight, 0);
    this.tripProfitTripExpenses = filas.reduce((a, f) => a + f.gasto, 0);
    this.tripProfitOtherExpenses = otros;

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
  get maintenanceTotal(): number {
    const data = (this.maintenanceData.datasets[0]?.data ?? []) as number[];
    return data.reduce((acc, v) => acc + (v || 0), 0);
  }

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

  /* Último lote recibido. Permite recalcular el alcance del gráfico de
     utilidad (Mes/Año) sin volver a pedirle nada al servidor. */
  private loadedTrips: ModelTrip[] = [];
  private loadedExpenses: ModelExpense[] = [];
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
    private readonly driverService: DriverService,
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
   * Alcance de todas las gráficas. Recalcula sobre el lote ya cargado — que el
   * servidor acota al año seleccionado —, así que no dispara peticiones.
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

    const trips = this.loadedTrips;
    const expenses = this.loadedExpenses;
    this.processTripsByVehicle(trips, this.vehicles);
    this.processFinancialData();
    this.processMonthVehicleFin(trips, expenses, this.vehicles);
    this.processVehicleProfit(trips, expenses, this.vehicles);
    this.processMaintenanceData(expenses, this.vehicles);
    this.processTripsByMonth(trips, this.vehicles);
    this.processProfitByMonth(trips, expenses, this.vehicles);
  }

  public setHistoryDate(month: number, year: number): void {
    this.selectedMonth = month;
    this.selectedYear = year;
    this.updateCurrentMonthName();

    if (this.currentUser) {
      this.loadData(this.currentUser);
    }
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
  private shortenLabel(text: string): string {
    const full = (text ?? '').toString().trim();
    if (window.innerWidth >= 768 || full.length <= 12) return full;

    const p = full.split(/\s+/);
    let corto = full;
    if (p.length === 3) corto = `${p[0]} ${p[1]}`;
    else if (p.length >= 4) corto = `${p[0]} ${p[2]}`;

    return corto.length <= 16 ? corto : corto.slice(0, 15) + '…';
  }

  /** Suma de una serie ya pintada: los totales del pie siempre cuadran con las
   *  barras porque salen de los mismos datos, no de un recálculo. */
  private sumSerie(data: ChartData<'bar'>, index: number): number {
    const serie = (data.datasets[index]?.data ?? []) as number[];
    return serie.reduce((acc, v) => acc + (v || 0), 0);
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

      let vehicleFilters: Filter[] = [];
      let tripFilters: Filter[] = [];
      let expenseFilters: Filter[] = [];

      let ownerId: string | undefined;

      if (role.includes('PROPIETARIO') && user?.id) {
        const ownerFilter = new ModelFilterTable(
          [new Filter('user.id', '=', user.id.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        );
        const ownerResp: any = await lastValueFrom(
          this.ownerService.getOwnerFilter(ownerFilter),
        );
        ownerId = ownerResp?.data?.content?.[0]?.id?.toString();
      } else if (role.includes('ADMINISTRADOR') && this.selectedOwnerId) {
        ownerId = this.selectedOwnerId.toString();
      }

      if (ownerId) {
        // 2. Get Vehicle IDs for this owner
        const vehicleOwnerFilter = new ModelFilterTable(
          [new Filter('owner.id', '=', ownerId)],
          new Pagination(3000, 0),
          new Sort('id', true),
        );
        const vehiclesResp: any = await lastValueFrom(
          this.vehicleService.getVehicleOwnerFilter(vehicleOwnerFilter),
        );
        const vehiclesContext: ModelVehicle[] =
          vehiclesResp?.data?.content ?? [];
        const vehicleIds = vehiclesContext
          .map((v) => v.id)
          .filter((id) => id != null)
          .join(',');

        if (vehicleIds) {
          tripFilters.push(new Filter('vehicle.id', 'in', vehicleIds));
          expenseFilters.push(new Filter('vehicleId', 'in', vehicleIds));
          vehicleFilters.push(new Filter('id', 'in', vehicleIds));
        } else {
          // No vehicles found for owner, data will be empty
          this.clearChartData();
          this.updateCharts();
          this.loading = false;
          return;
        }
      } else if (role.includes('CONDUCTOR') && user?.id) {
        // 1. Get Driver linked to this User
        const driverFilter = new ModelFilterTable(
          [new Filter('user.id', '=', user.id.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        );
        const driverResp: any = await lastValueFrom(
          this.driverService.getDriverFilter(driverFilter),
        );
        const driverId = driverResp?.data?.content?.[0]?.id;

        if (driverId) {
          // 2. Filter vehicles by currentDriverId
          const vehicleDriverFilter = new ModelFilterTable(
            [new Filter('currentDriverId', '=', driverId.toString())],
            new Pagination(3000, 0),
            new Sort('id', true),
          );
          const vehiclesResp: any = await lastValueFrom(
            this.vehicleService.getVehicleFilter(vehicleDriverFilter),
          );
          const vehiclesContext: ModelVehicle[] =
            vehiclesResp?.data?.content ?? [];
          const vehicleIds = vehiclesContext
            .map((v) => v.id)
            .filter((id) => id != null)
            .join(',');

          if (vehicleIds) {
            tripFilters.push(new Filter('vehicle.id', 'in', vehicleIds));
            expenseFilters.push(new Filter('vehicleId', 'in', vehicleIds));
            vehicleFilters.push(new Filter('id', 'in', vehicleIds));
          } else {
            // No vehicles assigned to driver, data will be empty
            this.clearChartData();
            this.updateCharts();
            this.loading = false;
            return;
          }
        }
      }

      // Filtros por año seleccionado para optimizar carga en servidor
      const yearStart = `${this.selectedYear}-01-01T00:00:00`;
      const yearEnd = `${this.selectedYear}-12-31T23:59:59`;

      tripFilters.push(
        new Filter('startDate', '>=', yearStart),
        new Filter('startDate', '<=', yearEnd),
      );

      expenseFilters.push(
        new Filter('expenseDate', '>=', yearStart),
        new Filter('expenseDate', '<=', yearEnd),
      );

      const vehicleFilterPayload = new ModelFilterTable(
        vehicleFilters,
        new Pagination(20000, 0),
        new Sort('id', false),
      );
      const tripFilterPayload = new ModelFilterTable(
        tripFilters,
        new Pagination(20000, 0),
        new Sort('id', false),
      );
      const expenseFilterPayload = new ModelFilterTable(
        expenseFilters,
        new Pagination(20000, 0),
        new Sort('id', false),
      );

      // Petición específica para viajes activos (evita que se filtren por fecha si vienen de otro año)
      const activeTripFilters = tripFilters.filter(
        (f) => f.fieldFilter !== 'startDate',
      );
      activeTripFilters.push(new Filter('status', '=', 'En Curso'));
      const activeTripPayload = new ModelFilterTable(
        activeTripFilters,
        new Pagination(1000, 0),
        new Sort('id', false),
      );

      const [tripsResp, expensesResp, vehiclesResp, activeTripsResp]: any[] =
        await Promise.all([
          lastValueFrom(this.tripService.getTripFilter(tripFilterPayload)),
          lastValueFrom(
            this.expenseService.getExpenseFilter(expenseFilterPayload),
          ),
          lastValueFrom(
            this.vehicleService.getVehicleFilter(vehicleFilterPayload),
          ),
          lastValueFrom(this.tripService.getTripFilter(activeTripPayload)),
        ]);

      const yearTrips: ModelTrip[] = tripsResp?.data?.content || [];
      const currentActiveTrips: ModelTrip[] =
        activeTripsResp?.data?.content || [];

      // Combinar viajes del año y viajes activos sin duplicados
      const tripsMap = new Map<string, ModelTrip>();
      [...yearTrips, ...currentActiveTrips].forEach((t) => {
        if (t.id) tripsMap.set(t.id.toString(), t);
      });
      const trips = Array.from(tripsMap.values());

      const expenses: ModelExpense[] = expensesResp?.data?.content || [];
      this.vehicles = vehiclesResp?.data?.content || [];

      this.mapBrandNames(this.vehicles);
      this.mapDriverNames(this.vehicles);

      this.processActiveTrips(trips, expenses);

      this.processTripsByVehicle(trips, this.vehicles);
      this.processFinancialData();
      this.processMonthVehicleFin(trips, expenses, this.vehicles);
      this.loadedTrips = trips;
      this.loadedExpenses = expenses;
      this.processVehicleProfit(trips, expenses, this.vehicles);
      this.processMaintenanceData(expenses, this.vehicles);
      this.processTripsByMonth(trips, this.vehicles);
      this.processProfitByMonth(trips, expenses, this.vehicles);

      this.updateCharts();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      this.loading = false;
    }
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
  }

  /** Propietario y conductor ven una barra por tipo de viaje; el admin, el total */
  get showTripTypeBreakdown(): boolean {
    return this.userRole === 'PROPIETARIO' || this.userRole === 'CONDUCTOR';
  }

  /** Los viajes sin tipo (anteriores a la funcionalidad) cuentan como cargados */
  private resolveTripType(trip: ModelTrip): string {
    const type = (trip.tripType || '').toUpperCase();
    return this.TRIP_TYPE_SERIES.some((s) => s.id === type) ? type : 'CARGADO';
  }

  /** El viaje vacío no genera flete: se excluye de rendimiento y finanzas */
  private isEmptyTrip(trip: ModelTrip): boolean {
    return this.resolveTripType(trip) === 'VACIO';
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
   * Viajes por vehículo. En alcance "anio" cuenta todo el lote — que el
   * servidor ya acota al año seleccionado — y en "mes" filtra además por el
   * mes. Propietario y conductor ven el desglose por tipo de viaje.
   */
  private processTripsByVehicle(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const esMes = this.scope === 'mes';
    const porPropietario = this.groupByOwner;
    const counts: Record<string, number> = {};
    const countsByType: Record<string, Record<string, number>> = {};
    vehicles.forEach((v) => {
      const key = this.vehicleGroupKey(v, porPropietario);
      if (!key) return;
      counts[key] ??= 0;
      countsByType[key] ??= {};
    });
    trips.forEach((t) => {
      if (esMes) {
        if (!t.startDate) return;
        const d = new Date(t.startDate);
        if (
          d.getMonth() !== this.selectedMonth ||
          d.getFullYear() !== this.selectedYear
        ) {
          return;
        }
      }
      /* El administrador agrupa por propietario — ver `groupByOwner` —, que se
         resuelve por el conductor y, si no, por el vehículo del viaje. */
      const key = this.tripGroupKey(t, porPropietario);
      if (!key) return;
      counts[key] = (counts[key] || 0) + 1;
      countsByType[key] ??= {};
      const type = this.resolveTripType(t);
      countsByType[key][type] = (countsByType[key][type] || 0) + 1;
    });

    const labels = Object.keys(counts).sort((a, b) => a.localeCompare(b));

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
   * Ingresos y gastos acumulados por placa, dentro del año seleccionado y —
   * si `esMes` — del mes seleccionado. Alimenta tanto esta gráfica como la de
   * utilidad por vehículo: las dos parten del mismo acumulado y solo cambia
   * cómo lo pintan, así que el criterio vive en un único sitio.
   *
   * El ingreso se atribuye por la placa del viaje y el gasto por `vehicleId`,
   * de modo que aquí sí entra el gasto sin viaje asociado (mantenimiento, por
   * ejemplo), a diferencia de "Ingresos vs Egresos", que lo resuelve por
   * `tripId`. Todos los vehículos visibles aparecen, aunque queden en cero.
   */
  private accumulateByGroup(
    trips: ModelTrip[],
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
    esMes: boolean,
    porPropietario: boolean,
  ): Record<string, { income: number; expense: number }> {
    const stats: Record<string, { income: number; expense: number }> = {};
    const bucket = (k: string) => (stats[k] ??= { income: 0, expense: 0 });

    // Todo grupo con vehículos aparece, aunque no haya tenido movimiento.
    vehicles.forEach((v) => {
      const key = this.vehicleGroupKey(v, porPropietario);
      if (key) bucket(key);
    });

    trips.forEach((t) => {
      if (!t.startDate) return;
      const d = new Date(t.startDate);
      if (d.getFullYear() !== this.selectedYear) return;
      if (esMes && d.getMonth() !== this.selectedMonth) return;

      if (porPropietario) {
        /* El propietario se resuelve por el conductor y, si no, por el
           vehículo — igual que en "Ingresos vs Egresos". El grupo se crea si
           no existía: un propietario puede tener viajes con un vehículo que
           no está en el lote, y descartar el flete lo escondería. */
        const key = this.ownerLabel(this.resolveOwnerId(t));
        if (key) bucket(key).income += t.freight || 0;
        return;
      }

      const plate = (t.vehicle?.plate || t.vehiclePlate)?.toUpperCase();
      if (plate && stats[plate]) stats[plate].income += t.freight || 0;
    });

    expenses.forEach((e) => {
      const d = e.creationDate ? new Date(e.creationDate) : null;
      if (!d || d.getFullYear() !== this.selectedYear) return;
      if (esMes && d.getMonth() !== this.selectedMonth) return;
      /* El gasto solo trae `vehicleId`: sin el vehículo en el lote no hay
         forma de saber de quién es, así que se descarta. */
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      const key = this.vehicleGroupKey(vehicle, porPropietario);
      if (key && stats[key]) stats[key].expense += e.amount || 0;
    });

    return stats;
  }

  private processMonthVehicleFin(
    trips: ModelTrip[],
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const stats = this.accumulateByGroup(
      trips,
      expenses,
      vehicles,
      this.scope === 'mes',
      this.groupByOwner,
    );

    const labels = Object.keys(stats).sort((a, b) => a.localeCompare(b));
    const incomeData = labels.map((l) => stats[l].income);
    const expenseData = labels.map((l) => stats[l].expense);

    this.monthVehicleFinData = {
      labels: labels,
      datasets: [
        { ...this.monthVehicleFinData.datasets[0], data: incomeData },
        { ...this.monthVehicleFinData.datasets[1], data: expenseData },
      ],
    };
  }

  /** Cambia entre el mes seleccionado y el acumulado del año. Recalcula
   *  sobre los datos que ya están en memoria: no dispara peticiones. */
  /**
   * Utilidad neta (flete menos gastos) por vehículo. Responde de un vistazo
   * qué camión deja dinero y cuál cuesta: el cero queda en medio y la barra
   * sale a la derecha o a la izquierda según el signo.
   *
   * NOTA: los gastos se agrupan por `creationDate`, igual que el resto de las
   * gráficas de este componente, para que las cifras cuadren entre ellas. El
   * criterio correcto es `expenseDate` (que es por donde filtra el servidor,
   * ver `expenseFilters` en la carga) — al unificarlo hay que cambiarlo en
   * TODAS a la vez, no solo aquí.
   */
  private processVehicleProfit(
    trips: ModelTrip[],
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const stats = this.accumulateByGroup(
      trips,
      expenses,
      vehicles,
      this.scope === 'mes',
      this.groupByOwner,
    );

    /* Con `indexAxis: 'y'` Chart.js pinta la primera etiqueta arriba, así que
       ordenar de mayor a menor deja el vehículo más rentable en la cabecera. */
    const util = (k: string) => stats[k].income - stats[k].expense;
    const labels = Object.keys(stats).sort((a, b) => util(b) - util(a));

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
    /* La selección solo vive mientras exista su barra: al cambiar de periodo un
       grupo puede desaparecer del eje. */
    if (
      this.selectedProfitGroup &&
      !labels.includes(this.selectedProfitGroup)
    ) {
      this.selectedProfitGroup = null;
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

  /** Propietario del viaje: por el conductor, o por la relación del vehículo. */
  private resolveOwnerId(trip: ModelTrip): number | undefined {
    return trip.driver?.ownerId ?? trip.vehicle?.owners?.[0]?.ownerId;
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

  /** Nombre del propietario, o un marcador si aún no cargó el catálogo. */
  private ownerLabel(ownerId?: number): string | undefined {
    if (ownerId == null) return undefined;
    return (
      this.owners.find((o) => o.id === ownerId)?.name ??
      `Propietario ${ownerId}`
    );
  }

  /** Etiqueta con la que agrupar un viaje: la placa, o su propietario. */
  private tripGroupKey(
    trip: ModelTrip,
    porPropietario: boolean,
  ): string | undefined {
    return porPropietario
      ? this.ownerLabel(this.resolveOwnerId(trip))
      : (trip.vehicle?.plate || trip.vehiclePlate)?.toUpperCase();
  }

  /** Etiqueta con la que agrupar un vehículo: su placa, o su propietario. */
  private vehicleGroupKey(
    vehicle: ModelVehicle | undefined,
    porPropietario: boolean,
  ): string | undefined {
    if (!vehicle) return undefined;
    if (!porPropietario) return vehicle.plate?.toUpperCase();
    return this.ownerLabel(vehicle.owners?.[0]?.ownerId ?? vehicle.ownerId);
  }

  /**
   * Ingresos (flete) contra egresos del grupo abierto en "Utilidad por
   * Vehículo/Propietario". Es un detalle de esa gráfica: sin barra tocada no
   * hay nada que pintar.
   *
   * En alcance de mes el eje es el VIAJE y en el de año, el MES. Comparte la
   * fuente con "Utilidad por Viaje" — ver `selectedGroupRows` —, de modo que
   * las dos tarjetas cierran con la misma utilidad.
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
    };

    if (!this.selectedProfitGroup) {
      this.financialOtherExpenses = 0;
      pintar([], [], []);
      return;
    }

    const esMes = this.scope === 'mes';
    const { filas, otros } = this.selectedGroupRows(esMes);
    this.financialOtherExpenses = otros;

    // --- Año: un grupo por mes. Como máximo 12 barras dobles. ---
    if (!esMes) {
      const ing = new Array(12).fill(0);
      const gas = new Array(12).fill(0);
      filas.forEach((f) => {
        ing[f.mes] += f.freight;
        gas[f.mes] += f.gasto;
      });
      pintar([...this.MESES_CORTOS], ing, gas);
      return;
    }

    // --- Mes: un grupo por viaje, en orden de placa y número. ---
    const ordenadas = [...filas].sort((a, b) => a.label.localeCompare(b.label));
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
   */
  private processMaintenanceData(
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const esMes = this.scope === 'mes';
    const porPropietario = this.groupByOwner;
    const maintCounts: Record<string, number> = {};
    vehicles.forEach((v) => {
      const key = this.vehicleGroupKey(v, porPropietario);
      if (key) maintCounts[key] ??= 0;
    });

    // Type 4 is Maintenance
    const maintenanceExpenses = expenses.filter((e) => {
      if (e.category?.expenseTypeId !== 4) return false;
      const d = e.creationDate ? new Date(e.creationDate) : null;
      if (!d || d.getFullYear() !== this.selectedYear) return false;
      return !esMes || d.getMonth() === this.selectedMonth;
    });

    maintenanceExpenses.forEach((e) => {
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      const key = this.vehicleGroupKey(vehicle, porPropietario);
      /* El gasto de un vehículo fuera de la lista visible se descarta, igual
         que en el resto de gráficas: antes caía en una barra "Desconocido".
         `amount` puede venir nulo y sin el `|| 0` el acumulado se vuelve NaN,
         que Chart.js no pinta — el grupo desaparecía del eje. */
      if (!key || maintCounts[key] === undefined) return;
      maintCounts[key] += e.amount || 0;
    });

    const labels = Object.keys(maintCounts).sort((a, b) => a.localeCompare(b));
    const data = labels.map((l) => maintCounts[l]);

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
   * Viajes por vehículo con eje X variable — ver el comentario de
   * `scope`. El viaje vacío queda fuera en ambos alcances, igual
   * que en el resto de gráficas de rendimiento.
   */
  private processTripsByMonth(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const colors = this.GROUP_COLORS;
    const porPropietario = this.groupByOwner;

    /* Grupos del eje — placas, o propietarios si mira un administrador — en
       orden alfabético. Al fijar el orden una sola vez, el color de un grupo
       es el mismo en los dos alcances: su línea en "año" y su barra en "mes". */
    const grupos = [
      ...new Set(
        vehicles
          .map((v) => this.vehicleGroupKey(v, porPropietario))
          .filter((k): k is string => !!k),
      ),
    ].sort((a, b) => a.localeCompare(b));

    /* Una sola pasada sobre los viajes: cuenta por grupo y mes. El grupo se
       crea si no venía sembrado — un viaje puede traer un vehículo fuera del
       lote — para no esconder actividad. */
    const porMes: Record<string, number[]> = {};
    grupos.forEach((g) => (porMes[g] = new Array(12).fill(0)));

    trips.forEach((t) => {
      if (this.isEmptyTrip(t) || !t.startDate) return;
      const d = new Date(t.startDate);
      if (d.getFullYear() !== this.selectedYear) return;
      const key = this.tripGroupKey(t, porPropietario);
      if (!key) return;
      porMes[key] ??= new Array(12).fill(0);
      porMes[key][d.getMonth()]++;
    });

    /* Mismo listado en los dos alcances: se arma sobre el año completo, así el
       eje de "mes" no pierde un grupo por no haber rodado ese mes. */
    const labels = Object.keys(porMes).sort((a, b) => a.localeCompare(b));
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
   * El gasto se imputa al mes de su `creationDate` y al vehículo por
   * `vehicleId`, así que aquí entra también lo que no cuelga de un viaje.
   */
  private processProfitByMonth(
    trips: ModelTrip[],
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const colors = this.GROUP_COLORS;
    const porPropietario = this.groupByOwner;

    /* Grupos del eje en orden alfabético, fijado una sola vez: el color de un
       grupo es el mismo en los dos alcances. */
    const grupos = [
      ...new Set(
        vehicles
          .map((v) => this.vehicleGroupKey(v, porPropietario))
          .filter((k): k is string => !!k),
      ),
    ].sort((a, b) => a.localeCompare(b));

    const porMes: Record<string, number[]> = {};
    grupos.forEach((g) => (porMes[g] = new Array(12).fill(0)));
    const bucket = (k: string) => (porMes[k] ??= new Array(12).fill(0));

    /* Meses con movimiento. Se registra aparte y no se deduce de un valor
       distinto de cero: un mes puede cerrar en cero exacto habiendo tenido
       actividad, y contarlo como inactivo falsearía el mínimo y el promedio. */
    const activos: Record<string, boolean[]> = {};
    const marcar = (k: string, mes: number) => {
      (activos[k] ??= new Array(12).fill(false))[mes] = true;
    };

    trips.forEach((t) => {
      if (!t.startDate) return;
      const d = new Date(t.startDate);
      if (d.getFullYear() !== this.selectedYear) return;
      const key = this.tripGroupKey(t, porPropietario);
      if (!key) return;
      bucket(key)[d.getMonth()] += t.freight || 0;
      marcar(key, d.getMonth());
    });

    expenses.forEach((e) => {
      const d = e.creationDate ? new Date(e.creationDate) : null;
      if (!d || d.getFullYear() !== this.selectedYear) return;
      /* El gasto solo trae `vehicleId`: sin el vehículo en el lote no hay
         forma de saber a qué grupo va, así que se descarta. */
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      const key = this.vehicleGroupKey(vehicle, porPropietario);
      if (!key || !porMes[key]) return;
      porMes[key][d.getMonth()] -= e.amount || 0;
      marcar(key, d.getMonth());
    });

    /* Mismo listado en los dos alcances: se arma sobre el año completo, así el
       eje de "mes" no pierde un grupo por no haber facturado ese mes. */
    const labels = Object.keys(porMes).sort((a, b) => a.localeCompare(b));
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
