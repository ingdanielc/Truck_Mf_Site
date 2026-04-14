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
import { lastValueFrom, Subscription } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartConfiguration,
  ChartData,
  ChartType,
  registerables,
} from 'chart.js';
import { ModelVehicle } from '../../models/vehicle-model';
import { ModelTrip } from '../../models/trip-model';
import { ModelExpense } from '../../models/expense-model';
import { GVehicleTripExpCardComponent } from '../../components/g-vehicle-trip-exp-card/g-vehicle-trip-exp-card.component';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, GVehicleTripExpCardComponent],
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

  showHistoryPanel: boolean = false;

  public currentMonthName: string = '';
  public selectedMonth: number = new Date().getMonth();
  public selectedYear: number = new Date().getFullYear();
  public browsingYear: number = new Date().getFullYear();
  public readonly systemMonth: number = new Date().getMonth();
  public readonly systemYear: number = new Date().getFullYear();

  // Chart 1: Trips por Vehículo
  public tripsByVehicleOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: { display: true, text: 'Viajes por Vehículo' },
    },
  };
  public tripsByVehicleType: ChartType = 'bar';
  public tripsByVehicleData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Cantidad de Viajes', backgroundColor: '#3b82f6' },
    ],
  };

  // New Chart: Trips por Vehículo (Mes Actual)
  public currentMonthTripsOptions: ChartConfiguration['options'] = {
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
  public currentMonthTripsType: ChartType = 'bar';
  public currentMonthTripsData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Viajes este Mes', backgroundColor: '#8b5cf6' },
    ],
  };

  // Chart 2: Utilidad vs Gastos
  public financialOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: { display: true, text: 'Utilidad vs Gastos' },
    },
  };
  public financialType: ChartType = 'bar';
  public financialData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Flete', backgroundColor: '#10b981' },
      { data: [], label: 'Gastos', backgroundColor: '#ef4444' },
    ],
  };

  // New Chart: Ingresos vs Egresos por Viaje (Mes Actual)
  public monthTripFinOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: `Ingresos vs Egresos por Viaje (${this.currentMonthName})`,
      },
    },
  };
  public monthTripFinType: ChartType = 'bar';
  public monthTripFinData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Ingresos (Flete)', backgroundColor: '#10b981' },
      { data: [], label: 'Egresos (Gastos)', backgroundColor: '#f43f5e' },
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
    this.userSub = this.securityService.userData$.subscribe((user) => {
      if (user) {
        this.currentUser = user;
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
    if (this.currentMonthTripsOptions?.plugins?.title) {
      this.currentMonthTripsOptions.plugins.title.text = `Viajes por Vehículo (${this.currentMonthName})`;
    }
    if (this.monthTripFinOptions?.plugins?.title) {
      this.monthTripFinOptions.plugins.title.text = `Ingresos vs Egresos por Viaje (${this.currentMonthName})`;
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
      if (options.plugins?.legend?.labels) {
        options.plugins.legend.labels.color = textColor;
        options.plugins.legend.labels.font = {
          family: "'Inter', sans-serif",
          size: 12,
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
    applyTheme(this.currentMonthTripsOptions);
    applyTheme(this.financialOptions);
    applyTheme(this.monthTripFinOptions);
    applyTheme(this.monthVehicleFinOptions);
    applyTheme(this.maintenanceOptions);
    applyTheme(this.monthlyTripsOptions);
    applyTheme(this.monthlyProfitOptions);
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

      if (role.includes('PROPIETARIO') && user?.id) {
        // 1. Get Owner ID linked to this User
        const ownerFilter = new ModelFilterTable(
          [new Filter('user.id', '=', user.id.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        );
        const ownerResp: any = await lastValueFrom(
          this.ownerService.getOwnerFilter(ownerFilter),
        );
        const owner = ownerResp?.data?.content?.[0];

        if (owner?.id) {
          // 2. Get Vehicle IDs for this owner
          const vehicleOwnerFilter = new ModelFilterTable(
            [new Filter('owner.id', '=', owner.id.toString())],
            new Pagination(20000, 0),
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
            new Pagination(20000, 0),
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

      const [tripsResp, expensesResp, vehiclesResp]: any[] = await Promise.all([
        lastValueFrom(this.tripService.getTripFilter(tripFilterPayload)),
        lastValueFrom(
          this.expenseService.getExpenseFilter(expenseFilterPayload),
        ),
        lastValueFrom(
          this.vehicleService.getVehicleFilter(vehicleFilterPayload),
        ),
      ]);

      const trips: ModelTrip[] = tripsResp?.data?.content || [];
      const expenses: ModelExpense[] = expensesResp?.data?.content || [];
      this.vehicles = vehiclesResp?.data?.content || [];

      this.mapBrandNames(this.vehicles);
      this.mapDriverNames(this.vehicles);

      this.processActiveTrips(trips, expenses);

      this.processTripsByVehicle(trips, this.vehicles);
      this.processCurrentMonthTrips(trips, this.vehicles);
      this.processFinancialData(trips, expenses);
      this.processMonthTripFin(trips, expenses);
      this.processMonthVehicleFin(trips, expenses, this.vehicles);
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
    this.tripsByVehicleData.datasets[0].data = [];
    this.financialData.labels = [];
    this.financialData.datasets[0].data = [];
    this.financialData.datasets[1].data = [];
    this.currentMonthTripsData.datasets[0].data = [];
    this.monthTripFinData.labels = [];
    this.monthTripFinData.datasets[0].data = [];
    this.monthTripFinData.datasets[1].data = [];
    this.monthVehicleFinData.labels = [];
    this.monthVehicleFinData.datasets[0].data = [];
    this.monthVehicleFinData.datasets[1].data = [];
    this.maintenanceData.labels = [];
    this.maintenanceData.datasets[0].data = [];
    this.monthlyTripsData.datasets = [];
    this.monthlyProfitData.datasets = [];
  }

  private processMonthTripFin(trips: ModelTrip[], expenses: ModelExpense[]) {
    const monthTrips = trips
      .filter((t) => {
        if (!t.startDate) return false;
        const d = new Date(t.startDate);
        return (
          d.getMonth() === this.selectedMonth &&
          d.getFullYear() === this.selectedYear
        );
      })
      .sort((a, b) => {
        const plateA = (a.vehiclePlate || a.vehicle?.plate || '').toUpperCase();
        const plateB = (b.vehiclePlate || b.vehicle?.plate || '').toUpperCase();
        if (plateA < plateB) return -1;
        if (plateA > plateB) return 1;
        return Number(a.numberTrip ?? 0) - Number(b.numberTrip ?? 0);
      });

    const labels = monthTrips.map(
      (t) =>
        `${(t.vehiclePlate || t.vehicle?.plate || 'S/P').toUpperCase()} - #${t.numberTrip}`,
    );
    const incomeData = monthTrips.map((t) => t.freight || 0);
    const expenseData = monthTrips.map((t) => {
      const tripExp = expenses.filter((e) => e.tripId === t.id);
      return tripExp.reduce((sum, e) => sum + e.amount, 0);
    });

    this.monthTripFinData = {
      labels,
      datasets: [
        { ...this.monthTripFinData.datasets[0], data: incomeData },
        { ...this.monthTripFinData.datasets[1], data: expenseData },
      ],
    };
  }

  private processTripsByVehicle(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const counts: Record<string, number> = {};
    vehicles.forEach((v) => (counts[v.plate.toUpperCase()] = 0));
    trips.forEach((t) => {
      const plate = t.vehicle?.plate || t.vehiclePlate;
      if (plate)
        counts[plate.toUpperCase()] = (counts[plate.toUpperCase()] || 0) + 1;
    });

    const labels = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    const data = labels.map((l) => counts[l]);

    this.tripsByVehicleData = {
      labels: labels,
      datasets: [{ ...this.tripsByVehicleData.datasets[0], data: data }],
    };
  }

  private processCurrentMonthTrips(
    trips: ModelTrip[],
    vehicles: ModelVehicle[],
  ) {
    const counts: Record<string, number> = {};
    vehicles.forEach((v) => (counts[v.plate.toUpperCase()] = 0));

    trips.forEach((t) => {
      if (!t.startDate) return;
      const tripDate = new Date(t.startDate);
      if (
        tripDate.getMonth() === this.selectedMonth &&
        tripDate.getFullYear() === this.selectedYear
      ) {
        const plate = t.vehicle?.plate || t.vehiclePlate;
        if (plate) {
          counts[plate.toUpperCase()] = (counts[plate.toUpperCase()] || 0) + 1;
        }
      }
    });

    const labels = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    const data = labels.map((l) => counts[l]);

    this.currentMonthTripsData = {
      labels: labels,
      datasets: [
        {
          ...this.currentMonthTripsData.datasets[0],
          data: data,
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

  private processFinancialData(trips: ModelTrip[], expenses: ModelExpense[]) {
    // Top 10 most recent trips
    // Top 10 most recent trips, grouped by vehicle for visualization
    const recentTrips = trips.slice(0, 10).sort((a, b) => {
      const plateA = (a.vehiclePlate || a.vehicle?.plate || '').toUpperCase();
      const plateB = (b.vehiclePlate || b.vehicle?.plate || '').toUpperCase();
      if (plateA < plateB) return -1;
      if (plateA > plateB) return 1;
      return Number(a.numberTrip ?? 0) - Number(b.numberTrip ?? 0);
    });
    const labels = recentTrips.map(
      (t) =>
        `${(t.vehiclePlate || t.vehicle?.plate || 'S/P').toUpperCase()} - #${t.numberTrip}`,
    );
    const freights = recentTrips.map((t) => t.freight || 0);
    const tripExpenses = recentTrips.map((t) => {
      const tripExp = expenses.filter((e) => e.tripId === t.id);
      return tripExp.reduce((sum, e) => sum + e.amount, 0);
    });

    this.financialData = {
      labels,
      datasets: [
        { ...this.financialData.datasets[0], data: freights },
        { ...this.financialData.datasets[1], data: tripExpenses },
      ],
    };
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
    if (vehicles.length === 0) return;

    const missingIds = [
      ...new Set(
        vehicles
          .filter((v) => v.currentDriverId != null && !v.currentDriverName)
          .map((v) => v.currentDriverId as number),
      ),
    ];

    missingIds.forEach((id) => this.fetchDriverDetail(id, vehicles));
  }

  private fetchDriverDetail(driverId: number, vehicles: ModelVehicle[]): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', driverId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        const driver = response?.data?.content?.[0];
        if (driver) {
          vehicles.forEach((v) => {
            if (v.currentDriverId === driverId) {
              v.currentDriverName = driver.name;
            }
          });
        }
      },
      error: (err: any) =>
        console.error(`Error fetching driver ${driverId} details:`, err),
    });
  }
}
