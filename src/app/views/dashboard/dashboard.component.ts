import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TripService } from '../../services/trip.service';
import { VehicleService as ExpenseService } from '../../services/expense.service';
import { VehicleService } from '../../services/vehicle.service';
import { SecurityService } from '../../services/security/security.service';
import { OwnerService } from '../../services/owner.service';
import { DriverService } from '../../services/driver.service';
import { CommonService } from '../../services/common.service';
import { TokenService } from '../../services/token.service';
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

  // Chart 3: Mantenimiento por Vehículo
  public maintenanceOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: { display: true, text: 'Costo Mantenimiento' },
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
      title: { display: true, text: 'Viajes por Mes y Vehículo (Año Actual)' },
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
        text: 'Utilidad por Mes y Vehículo (Año Actual)',
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

  constructor(
    private readonly tripService: TripService,
    private readonly expenseService: ExpenseService,
    private readonly vehicleService: VehicleService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly commonService: CommonService,
    private readonly tokenService: TokenService,
  ) {}

  ngOnInit(): void {
    this.setupThemeObserver();
    this.loadBrands();
    this.userSub = this.securityService.userData$.subscribe((user) => {
      if (user) {
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
    applyTheme(this.financialOptions);
    applyTheme(this.maintenanceOptions);
    applyTheme(this.monthlyTripsOptions);
    applyTheme(this.monthlyProfitOptions);
  }

  async loadData(user: any) {
    this.loading = true;
    try {
      const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();

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
            new Pagination(9999, 0),
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
            new Pagination(9999, 0),
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
        new Pagination(1000, 0),
        new Sort('id', false),
      );
      const tripFilterPayload = new ModelFilterTable(
        tripFilters,
        new Pagination(1000, 0),
        new Sort('id', false),
      );
      const expenseFilterPayload = new ModelFilterTable(
        expenseFilters,
        new Pagination(1000, 0),
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

      this.activeTrips = [];
      this.vehicles.forEach((v) => {
        const activeTrip = trips.find(
          (t) =>
            (t.vehicleId === v.id || t.vehiclePlate === v.plate) &&
            (t.status?.toUpperCase() === 'EN CURSO' ||
              t.status?.toUpperCase() === 'PENDIENTE'),
        );
        if (activeTrip) {
          const tripExpenses = expenses.filter(
            (e) => e.tripId === activeTrip.id,
          );
          this.activeTrips.push({
            vehicle: v,
            trip: activeTrip,
            expenses: tripExpenses,
          });
        }
      });

      this.processTripsByVehicle(trips, this.vehicles);
      this.processFinancialData(trips, expenses);
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

  private clearChartData() {
    this.tripsByVehicleData.labels = [];
    this.tripsByVehicleData.datasets[0].data = [];
    this.financialData.labels = [];
    this.financialData.datasets[0].data = [];
    this.financialData.datasets[1].data = [];
    this.maintenanceData.labels = [];
    this.maintenanceData.datasets[0].data = [];
    this.monthlyTripsData.datasets = [];
    this.monthlyProfitData.datasets = [];
  }

  private processTripsByVehicle(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const counts: Record<string, number> = {};
    vehicles.forEach((v) => (counts[v.plate.toUpperCase()] = 0));
    trips.forEach((t) => {
      const plate = t.vehicle?.plate || t.vehiclePlate;
      if (plate)
        counts[plate.toUpperCase()] = (counts[plate.toUpperCase()] || 0) + 1;
    });

    this.tripsByVehicleData = {
      labels: Object.keys(counts),
      datasets: [
        { ...this.tripsByVehicleData.datasets[0], data: Object.values(counts) },
      ],
    };
  }

  private processFinancialData(trips: ModelTrip[], expenses: ModelExpense[]) {
    // Top 10 most recent trips
    const recentTrips = trips.slice(0, 10).reverse();
    const labels = recentTrips.map(
      (t) => `#${t.numberTrip || t.manifestNumber}`,
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
    const maintenanceExpenses = expenses.filter(
      (e) => e.category?.expenseTypeId === 4,
    );
    maintenanceExpenses.forEach((e) => {
      const vehicle = vehicles.find((v) => v.id === e.vehicleId);
      const plate = (vehicle?.plate || 'Desconocido').toUpperCase();
      maintCounts[plate] = (maintCounts[plate] || 0) + e.amount;
    });

    this.maintenanceData = {
      labels: Object.keys(maintCounts),
      datasets: [
        {
          ...this.maintenanceData.datasets[0],
          data: Object.values(maintCounts),
        },
      ],
    };
  }

  private processTripsByMonth(trips: ModelTrip[], vehicles: ModelVehicle[]) {
    const currentYear = new Date().getFullYear();
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
          tripDate?.getFullYear() === currentYear
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
    const currentYear = new Date().getFullYear();
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
        const plate = t.vehicle?.plate || t.vehiclePlate;
        const tripDate = t.startDate ? new Date(t.startDate) : null;
        return plate === v.plate && tripDate?.getFullYear() === currentYear;
      });

      const monthlyProfit = new Array(12).fill(0);
      vehicleTrips.forEach((t) => {
        const month = new Date(t.startDate!).getMonth();
        const freight = t.freight || 0;

        const tripExp = expenses.filter((e) => e.tripId === t.id);
        const totalExpenses = tripExp.reduce((sum, e) => sum + e.amount, 0);

        monthlyProfit[month] += freight - totalExpenses;
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
