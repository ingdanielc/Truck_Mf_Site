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

  /* Chart 1: Viajes por Vehículo. Unifica las dos gráficas que antes vivían
     separadas — la del año y la del mes — en una sola con selector. Aplica a
     todos los roles; propietario y conductor siguen viendo el desglose por
     tipo de viaje en tres series. */
  public tripsScope: 'mes' | 'anio' = 'mes';

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
  public tripsByVehicleData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ data: [], label: 'Viajes', backgroundColor: '#3b82f6' }],
  };

  // Chart 2: Utilidad vs Gastos
  /* Ingresos vs Egresos. Unifica las dos graficas que habia antes — la de los
     10 viajes mas recientes y la del mes — en una sola con selector.

     La dimension del eje X cambia con el alcance, y por eso el titulo la
     nombra siempre:
       - Mes + administrador -> un grupo por PROPIETARIO
       - Mes + propietario/conductor -> un grupo por VIAJE
       - Ano (todos los roles) -> un grupo por MES, maximo 12

     Los gastos se atribuyen por `tripId`, nunca por fecha: es lo que mantiene
     esta grafica al margen del criterio creationDate/expenseDate. */
  public financialScope: 'mes' | 'anio' = 'mes';

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
  public financialData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Ingresos (Flete)', backgroundColor: '#10b981' },
      { data: [], label: 'Egresos (Gastos)', backgroundColor: '#ef4444' },
    ],
  };

  // New Chart: Ingresos vs Gastos por Vehículo (Mes Actual)
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
  public monthVehicleFinData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Ingresos (Flete)', backgroundColor: '#10b981' },
      { data: [], label: 'Egresos (Gastos)', backgroundColor: '#f43f5e' },
    ],
  };

  /** Alcance del gráfico de utilidad: mes seleccionado o acumulado del año. */
  public profitScope: 'mes' | 'anio' = 'mes';

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
        barThickness: 22,
        maxBarThickness: 24,
      },
    ],
  };

  /** El alto crece con la flota: una fila por vehículo, nunca comprimidas. */
  get vehicleProfitHeight(): number {
    const n = this.vehicleProfitData.labels?.length ?? 0;
    return Math.max(200, n * 44 + 64);
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
  private readonly barValueLabels: Plugin<'bar'> = {
    id: 'barValueLabels',
    afterDatasetsDraw: (chart) => {
      const meta = chart.getDatasetMeta(0);
      const values = chart.data.datasets?.[0]?.data as (number | null)[];
      if (!meta?.data?.length || !values) return;

      const ctx = chart.ctx;
      const area = chart.chartArea;
      const GAP = 6;

      ctx.save();
      ctx.font = "600 11px 'Inter', sans-serif";
      ctx.textBaseline = 'middle';

      meta.data.forEach((bar: any, i: number) => {
        const v = values[i];
        if (v == null) return;

        const text = this.formatProfitLabel(v);
        const w = ctx.measureText(text).width;
        const tip = bar.x; // punta de la barra
        const base = bar.base; // el cero
        const positivo = v >= 0;
        const cabe = (px: number) => px >= area.left && px + w <= area.right;

        let dentro = false;

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

        ctx.fillStyle = dentro ? '#ffffff' : this.chartTextColor;
        ctx.fillText(text, x, bar.y);
      });

      ctx.restore();
    },
  };

  public vehicleProfitPlugins: Plugin<'bar'>[] = [this.barValueLabels];

  // Chart 3: Mantenimiento por Vehículo
  public maintenanceOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Costo Mantenimiento (${this.currentMonthName})`,
      },
    },
  };
  public maintenanceType: ChartType = 'line';
  public maintenanceData: ChartData<'line'> = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Costo ($)',
        borderColor: '#f59e0b',
        fill: false,
        tension: 0.1,
      },
    ],
  };

  // Chart 4: Viajes por Mes y Vehículo
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
  public monthlyTripsType: ChartType = 'line';
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

  // Chart 5: Utilidad por Mes y Vehículo
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
  public monthlyProfitType: ChartType = 'line';
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
      .subscribe((user) => {
        if (user) {
          this.currentUser = user;
          const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();
          this.userRole = role;
          if (role.includes('ADMINISTRADOR')) {
            this.loadOwners();
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
        this.tripsScope === 'mes'
          ? `Viajes por Vehículo (${this.currentMonthName})`
          : `Viajes por Vehículo (${this.selectedYear})`;
    }
    if (this.financialOptions?.plugins?.title) {
      this.financialOptions.plugins.title.text = this.financialTitle();
    }
    if (this.monthVehicleFinOptions?.plugins?.title) {
      this.monthVehicleFinOptions.plugins.title.text = `Ingresos vs Gastos por Vehículo (${this.currentMonthName})`;
    }
    if (this.monthlyTripsOptions?.plugins?.title) {
      this.monthlyTripsOptions.plugins.title.text = `Viajes por Mes y Vehículo (${this.selectedYear})`;
    }
    if (this.monthlyProfitOptions?.plugins?.title) {
      this.monthlyProfitOptions.plugins.title.text = `Utilidad por Mes y Vehículo (${this.selectedYear})`;
    }
    if (this.vehicleProfitOptions?.plugins?.title) {
      this.vehicleProfitOptions.plugins.title.text =
        this.profitScope === 'mes'
          ? `Utilidad por Vehículo (${this.currentMonthName})`
          : `Utilidad por Vehículo (Acumulado ${this.selectedYear})`;
    }
    if (this.maintenanceOptions?.plugins?.title) {
      this.maintenanceOptions.plugins.title.text = `Costo Mantenimiento (${this.currentMonthName})`;
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

  public setHistoryDate(month: number, year: number): void {
    this.selectedMonth = month;
    this.selectedYear = year;
    this.updateCurrentMonthName();

    if (this.currentUser) {
      this.loadData(this.currentUser);
    }
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
    const textColor = isDark ? '#94a3b8' : '#475569';
    this.chartTextColor = textColor;
    const gridColor = isDark
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(0, 0, 0, 0.05)';

    const applyTheme = (options: any) => {
      if (!options.scales) options.scales = {};
      if (!options.scales.x) options.scales.x = {};
      if (!options.scales.y) options.scales.y = {};

      options.scales.x.ticks = {
        color: textColor,
        font: { family: "'Inter', sans-serif", size: 11 },
      };
      options.scales.y.ticks = {
        ...options.scales.y.ticks,
        color: textColor,
        font: { family: "'Inter', sans-serif", size: 11 },
        callback: (value: any) => this.formatMobileValue(value),
      };
      options.scales.x.grid = { color: gridColor, drawBorder: false };
      options.scales.y.grid = { color: gridColor, drawBorder: false };
      /* Ninguna grafica declara `legend.labels`, asi que el objeto se crea
         aqui: sin el, Chart.js pinta las etiquetas de la leyenda ("Cargado",
         "Redondo", "Vacio", ...) con su color por defecto (#666), ilegible
         sobre el fondo del tema oscuro. */
      if (options.plugins?.legend) {
        options.plugins.legend.labels = {
          ...options.plugins.legend.labels,
          color: textColor,
          font: { family: "'Inter', sans-serif", size: 12 },
        };
      }
      if (options.plugins?.title) {
        options.plugins.title.color = textColor;
        options.plugins.title.font = {
          family: "'Inter', sans-serif",
          size: 14,
          weight: 'bold',
        };
      }
    };

    applyTheme(this.tripsByVehicleOptions);
    applyTheme(this.financialOptions);
    applyTheme(this.monthVehicleFinOptions);
    applyTheme(this.maintenanceOptions);
    applyTheme(this.monthlyTripsOptions);
    applyTheme(this.monthlyProfitOptions);
    applyTheme(this.vehicleProfitOptions);

    /* Barras horizontales: los ejes van al revés que en el resto de gráficas.
       Aquí el eje de valores es X (pesos) y el de categorías es Y (placas),
       así que el formateador de moneda se mueve a X y se deja que Y use su
       propia etiqueta — si no, `formatMobileValue` destroza las placas. */
    const vp: any = this.vehicleProfitOptions;
    vp.scales.x.ticks = {
      ...vp.scales.x.ticks,
      callback: (value: any) => this.formatMobileValue(value),
    };
    delete vp.scales.y.ticks.callback;
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
      this.processFinancialData(trips, expenses);
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

  /** Alterna entre el mes seleccionado y el año. Recalcula sobre los datos ya
   *  cargados: no dispara peticiones. */
  setTripsScope(scope: 'mes' | 'anio'): void {
    if (this.tripsScope === scope) return;
    this.tripsScope = scope;
    this.updateCurrentMonthName();
    this.processTripsByVehicle(this.loadedTrips, this.vehicles);
  }

  /**
   * Viajes por vehículo. En alcance "anio" cuenta todo el lote — que el
   * servidor ya acota al año seleccionado — y en "mes" filtra además por el
   * mes. Propietario y conductor ven el desglose por tipo de viaje.
   */
  private processTripsByVehicle(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const esMes = this.tripsScope === 'mes';
    const counts: Record<string, number> = {};
    const countsByType: Record<string, Record<string, number>> = {};
    vehicles.forEach((v) => {
      const plate = v.plate.toUpperCase();
      counts[plate] = 0;
      countsByType[plate] = {};
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
      const plate = (t.vehicle?.plate || t.vehiclePlate)?.toUpperCase();
      if (!plate) return;
      counts[plate] = (counts[plate] || 0) + 1;
      countsByType[plate] ??= {};
      const type = this.resolveTripType(t);
      countsByType[plate][type] = (countsByType[plate][type] || 0) + 1;
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
              backgroundColor: '#3b82f6',
            },
          ],
    };
  }

  private processMonthVehicleFin(
    trips: ModelTrip[],
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const stats: Record<string, { income: number; expense: number }> = {};
    vehicles.forEach(
      (v) => (stats[v.plate.toUpperCase()] = { income: 0, expense: 0 }),
    );

    trips.forEach((t) => {
      if (!t.startDate) return;
      const tripDate = new Date(t.startDate);
      if (
        tripDate.getMonth() === this.selectedMonth &&
        tripDate.getFullYear() === this.selectedYear
      ) {
        const plate = (t.vehicle?.plate || t.vehiclePlate)?.toUpperCase();
        if (plate && stats[plate]) {
          stats[plate].income += t.freight || 0;
        }
      }
    });

    expenses.forEach((e) => {
      const expenseDate = e.creationDate ? new Date(e.creationDate) : null;
      if (
        expenseDate?.getMonth() === this.selectedMonth &&
        expenseDate?.getFullYear() === this.selectedYear
      ) {
        const vehicle = vehicles.find((v) => v.id === e.vehicleId);
        const plate = vehicle?.plate?.toUpperCase();
        if (plate && stats[plate]) {
          stats[plate].expense += e.amount || 0;
        }
      }
    });

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
  setProfitScope(scope: 'mes' | 'anio'): void {
    if (this.profitScope === scope) return;
    this.profitScope = scope;
    this.updateCurrentMonthName();
    this.processVehicleProfit(
      this.loadedTrips,
      this.loadedExpenses,
      this.vehicles,
    );
  }

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
    const esMes = this.profitScope === 'mes';
    const stats: Record<string, { income: number; expense: number }> = {};
    vehicles.forEach(
      (v) => (stats[v.plate.toUpperCase()] = { income: 0, expense: 0 }),
    );

    trips.forEach((t) => {
      if (!t.startDate) return;
      const d = new Date(t.startDate);
      if (d.getFullYear() !== this.selectedYear) return;
      if (esMes && d.getMonth() !== this.selectedMonth) return;
      const plate = (t.vehicle?.plate || t.vehiclePlate)?.toUpperCase();
      if (plate && stats[plate]) stats[plate].income += t.freight || 0;
    });

    expenses.forEach((e) => {
      const d = e.creationDate ? new Date(e.creationDate) : null;
      if (!d || d.getFullYear() !== this.selectedYear) return;
      if (esMes && d.getMonth() !== this.selectedMonth) return;
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      const plate = vehicle?.plate?.toUpperCase();
      if (plate && stats[plate]) stats[plate].expense += e.amount || 0;
    });

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

  /** Alterna entre el mes seleccionado y el año. Recalcula sobre los datos ya
   *  cargados: no dispara peticiones. */
  setFinancialScope(scope: 'mes' | 'anio'): void {
    if (this.financialScope === scope) return;
    this.financialScope = scope;
    this.updateCurrentMonthName();
    this.processFinancialData(this.loadedTrips, this.loadedExpenses);
  }

  /** El título nombra la dimensión del eje X, que cambia con el alcance. */
  private financialTitle(): string {
    if (this.financialScope === 'anio') {
      return `Ingresos vs Egresos por Mes (${this.selectedYear})`;
    }
    const dimension =
      this.userRole === 'ADMINISTRADOR' ? 'Propietario' : 'Viaje';
    return `Ingresos vs Egresos por ${dimension} (${this.currentMonthName})`;
  }

  /** Propietario del viaje: por el conductor, o por la relación del vehículo. */
  private resolveOwnerId(trip: ModelTrip): number | undefined {
    return trip.driver?.ownerId ?? trip.vehicle?.owners?.[0]?.ownerId;
  }

  /**
   * Ingresos (flete) contra egresos (gastos). La dimensión del eje X depende
   * del alcance y del rol — ver el comentario de `financialScope`.
   *
   * El gasto de un viaje se resuelve por `tripId`, no por fecha, así que la
   * atribución no depende de `creationDate` ni de `expenseDate`. Los gastos
   * sin viaje asociado (mantenimiento, por ejemplo) quedan fuera, igual que
   * antes de unificar.
   */
  private processFinancialData(trips: ModelTrip[], expenses: ModelExpense[]) {
    const gastoDe = (t: ModelTrip) =>
      expenses
        .filter((e) => e.tripId === t.id)
        .reduce((sum, e) => sum + (e.amount || 0), 0);

    // El viaje vacío no genera flete: queda fuera, como en la versión previa.
    const utiles = trips.filter((t) => !this.isEmptyTrip(t) && !!t.startDate);

    const pintar = (labels: string[], ing: number[], gas: number[]) => {
      this.financialData = {
        labels,
        datasets: [
          { ...this.financialData.datasets[0], data: ing },
          { ...this.financialData.datasets[1], data: gas },
        ],
      };
    };

    // --- Año: un grupo por mes. Como máximo 12 barras dobles. ---
    if (this.financialScope === 'anio') {
      const ing = new Array(12).fill(0);
      const gas = new Array(12).fill(0);
      utiles.forEach((t) => {
        const d = new Date(t.startDate as string);
        if (d.getFullYear() !== this.selectedYear) return;
        ing[d.getMonth()] += t.freight || 0;
        gas[d.getMonth()] += gastoDe(t);
      });
      pintar([...this.MESES_CORTOS], ing, gas);
      return;
    }

    // --- Mes ---
    const delMes = utiles.filter((t) => {
      const d = new Date(t.startDate as string);
      return (
        d.getMonth() === this.selectedMonth &&
        d.getFullYear() === this.selectedYear
      );
    });

    // Administrador: un grupo por propietario. Con muchos vehículos en juego,
    // una barra por viaje sería ilegible.
    if (this.userRole === 'ADMINISTRADOR') {
      const porOwner: Record<string, { ing: number; gas: number }> = {};
      let sinPropietario = 0;

      delMes.forEach((t) => {
        const ownerId = this.resolveOwnerId(t);
        if (ownerId == null) {
          sinPropietario++;
          return;
        }
        const nombre =
          this.owners.find((o) => o.id === ownerId)?.name ??
          `Propietario ${ownerId}`;
        porOwner[nombre] ??= { ing: 0, gas: 0 };
        porOwner[nombre].ing += t.freight || 0;
        porOwner[nombre].gas += gastoDe(t);
      });

      /* No se pinta una barra "Sin propietario", pero tampoco se descartan en
         silencio: si aparece alguno son datos inconsistentes y conviene verlo. */
      if (sinPropietario > 0) {
        console.warn(
          `[Reportes] ${sinPropietario} viaje(s) del mes sin propietario resoluble; quedan fuera de "Ingresos vs Egresos".`,
        );
      }

      const labels = Object.keys(porOwner).sort((a, b) =>
        a.localeCompare(b, 'es'),
      );
      pintar(
        labels,
        labels.map((l) => porOwner[l].ing),
        labels.map((l) => porOwner[l].gas),
      );
      return;
    }

    // Propietario y conductor: un grupo por viaje, como antes.
    const ordenados = [...delMes].sort((a, b) => {
      const plateA = (a.vehiclePlate || a.vehicle?.plate || '').toUpperCase();
      const plateB = (b.vehiclePlate || b.vehicle?.plate || '').toUpperCase();
      if (plateA < plateB) return -1;
      if (plateA > plateB) return 1;
      return Number(a.numberTrip ?? 0) - Number(b.numberTrip ?? 0);
    });

    pintar(
      ordenados.map(
        (t) =>
          `${(t.vehiclePlate || t.vehicle?.plate || 'S/P').toUpperCase()} - #${t.numberTrip}`,
      ),
      ordenados.map((t) => t.freight || 0),
      ordenados.map((t) => gastoDe(t)),
    );
  }

  private processMaintenanceData(
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const maintCounts: Record<string, number> = {};
    vehicles.forEach((v) => (maintCounts[v.plate.toUpperCase()] = 0));

    // Type 4 is Maintenance
    const maintenanceExpenses = expenses.filter((e) => {
      if (e.category?.expenseTypeId !== 4) return false;
      const expenseDate = e.creationDate ? new Date(e.creationDate) : null;
      return (
        expenseDate?.getMonth() === this.selectedMonth &&
        expenseDate?.getFullYear() === this.selectedYear
      );
    });

    maintenanceExpenses.forEach((e) => {
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      const plate = (vehicle?.plate || 'Desconocido').toUpperCase();
      maintCounts[plate] = (maintCounts[plate] || 0) + e.amount;
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

  private processTripsByMonth(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const colors = [
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

    const datasets: any[] = [];

    vehicles.forEach((v, index) => {
      const vehicleTrips = trips.filter((t) => {
        if (this.isEmptyTrip(t)) return false;
        const plate = t.vehicle?.plate || t.vehiclePlate;
        const tripDate = t.startDate ? new Date(t.startDate) : null;
        return (
          plate?.toUpperCase() === v.plate.toUpperCase() &&
          tripDate?.getFullYear() === this.selectedYear
        );
      });

      const monthlyCounts = new Array(12).fill(0);
      vehicleTrips.forEach((t) => {
        const month = new Date(t.startDate!).getMonth();
        monthlyCounts[month]++;
      });

      datasets.push({
        data: monthlyCounts,
        label: v.plate.toUpperCase(),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '33', // 20% opacity
        fill: false,
        tension: 0.4,
      });
    });

    this.monthlyTripsData = {
      ...this.monthlyTripsData,
      datasets: datasets,
    };
  }

  private processProfitByMonth(
    trips: ModelTrip[],
    expenses: ModelExpense[],
    vehicles: ModelVehicle[],
  ) {
    const colors = [
      '#10b981',
      '#3b82f6',
      '#ef4444',
      '#f59e0b',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
      '#84cc16',
      '#f97316',
      '#6366f1',
    ];

    const datasets: any[] = [];

    vehicles.forEach((v, index) => {
      const vehicleTrips = trips.filter((t) => {
        const plate = (t.vehicle?.plate || t.vehiclePlate)?.toUpperCase();
        const tripDate = t.startDate ? new Date(t.startDate) : null;
        return (
          plate === v.plate.toUpperCase() &&
          tripDate?.getFullYear() === this.selectedYear
        );
      });

      const vehicleExpenses = expenses.filter((e) => {
        const expenseDate = e.creationDate ? new Date(e.creationDate) : null;
        return (
          e.vehicleId === v.id &&
          expenseDate?.getFullYear() === this.selectedYear
        );
      });

      const monthlyProfit = new Array(12).fill(0);

      vehicleTrips.forEach((t) => {
        if (t.startDate) {
          const month = new Date(t.startDate).getMonth();
          monthlyProfit[month] += t.freight || 0;
        }
      });

      vehicleExpenses.forEach((e) => {
        if (e.creationDate) {
          const month = new Date(e.creationDate).getMonth();
          monthlyProfit[month] -= e.amount || 0;
        }
      });

      datasets.push({
        data: monthlyProfit,
        label: v.plate.toUpperCase(),
        borderColor: colors[index % colors.length],
        backgroundColor: colors[index % colors.length] + '33', // 20% opacity
        fill: false,
        tension: 0.4,
      });
    });

    this.monthlyProfitData = {
      ...this.monthlyProfitData,
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
