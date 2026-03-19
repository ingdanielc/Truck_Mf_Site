import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GExpenseCardComponent } from '../g-expense-card/g-expense-card.component';
import { ModelExpense } from '../../models/expense-model';
import { VehicleService as ExpenseService } from '../../services/expense.service';
import { TripService } from '../../services/trip.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';

@Component({
  selector: 'g-expenses-trip',
  standalone: true,
  imports: [CommonModule, GExpenseCardComponent],
  templateUrl: './g-expenses-trip.component.html',
  styleUrls: ['./g-expenses-trip.component.scss'],
})
export class GExpensesTripComponent implements OnInit, OnChanges {
  @Input({ required: true }) tripId!: number;
  @Input({ required: true }) vehicleId!: number;
  @Output() editExpense = new EventEmitter<ModelExpense>();
  @Output() addExpenseType = new EventEmitter<number>();
  @Input() isMaintenance = false;
  @Input() monthsToQuery = 2;

  expenses: ModelExpense[] = [];
  loading = false;
  totalPreviousTrip: number = 0;
  @Input() budget: number = 0;

  constructor(
    private readonly expenseService: ExpenseService,
    private readonly tripService: TripService,
  ) {}

  ngOnInit(): void {
    this.loadExpenses();
    this.loadPreviousTripTotal();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['tripId'] && !changes['tripId'].firstChange) ||
      (changes['vehicleId'] && !changes['vehicleId'].firstChange) ||
      (changes['isMaintenance'] && !changes['isMaintenance'].firstChange)
    ) {
      this.loadExpenses();
      this.loadPreviousTripTotal();
    }
  }

  loadExpenses(): void {
    if (!this.vehicleId) return;
    if (!this.isMaintenance && !this.tripId) return;

    this.loading = true;
    const filters = [new Filter('vehicleId', '=', this.vehicleId.toString())];

    if (!this.isMaintenance) {
      filters.push(new Filter('tripId', '=', this.tripId.toString()));
    } else {
      // For maintenance, filter by expenseDate based on monthsToQuery (from the 1st of the month)
      const startDate = new Date();
      // Adjust to the desired month
      startDate.setMonth(startDate.getMonth() - (this.monthsToQuery - 1));
      // Snap to the 1st of that month
      startDate.setDate(1);

      // Format dates to ISO string or a format accepted by the backend (assuming YYYY-MM-DD)
      const startDateStr = startDate.toISOString().split('T')[0];
      filters.push(new Filter('expenseDate', '>=', startDateStr));
    }

    const filterPayload = new ModelFilterTable(
      filters,
      new Pagination(100, 0),
      new Sort('id', false),
    );

    this.expenseService.getExpenseFilter(filterPayload).subscribe({
      next: (resp: any) => {
        this.expenses = resp?.data?.content || [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading expenses:', err);
        this.loading = false;
      },
    });
  }

  loadPreviousTripTotal(): void {
    if (this.isMaintenance || !this.vehicleId || !this.tripId) {
      this.totalPreviousTrip = 0;
      return;
    }

    const tripFilters = [
      new Filter('vehicleId', '=', this.vehicleId.toString()),
      new Filter('id', '<', this.tripId.toString()),
    ];

    const filterPayload = new ModelFilterTable(
      tripFilters,
      new Pagination(1, 0),
      new Sort('id', false),
    );

    this.tripService.getTripFilter(filterPayload).subscribe({
      next: (resp: any) => {
        const previousTrip = resp?.data?.content?.[0];
        if (previousTrip) {
          const expenseFilters = [
            new Filter('tripId', '=', previousTrip.id.toString()),
          ];
          const expensePayload = new ModelFilterTable(
            expenseFilters,
            new Pagination(100, 0),
            new Sort('id', false),
          );
          this.expenseService.getExpenseFilter(expensePayload).subscribe({
            next: (expResp: any) => {
              const prevExpenses: ModelExpense[] = expResp?.data?.content || [];
              this.totalPreviousTrip = prevExpenses.reduce(
                (sum, e) => sum + e.amount,
                0,
              );
            },
          });
        } else {
          this.totalPreviousTrip = 0;
        }
      },
    });
  }

  get totalAmount(): number {
    const filtered = this.isMaintenance
      ? this.maintenanceExpenses
      : this.expenses;
    return filtered.reduce((sum, e) => sum + e.amount, 0);
  }

  get remainingBudget(): number {
    return Math.max(0, this.budget - this.totalAmount);
  }

  get budgetPercentage(): number {
    if (this.budget <= 0) return 0;
    return Math.min(100, Math.round((this.totalAmount / this.budget) * 100));
  }

  get tripExpenses(): ModelExpense[] {
    // Type 3 is Trip, Type 0 is General/Other
    return this.expenses.filter((e) => {
      const type = e.category?.expenseTypeId || 0;
      return type === 3 || type === 0;
    });
  }

  get driverExpenses(): ModelExpense[] {
    // Type 2 is Driver
    return this.expenses.filter((e) => e.category?.expenseTypeId === 2);
  }

  get vehicleExpenses(): ModelExpense[] {
    // Type 1 is Vehicle
    return this.expenses.filter((e) => e.category?.expenseTypeId === 1);
  }

  get maintenanceExpenses(): ModelExpense[] {
    // Type 4 is Maintenance
    return this.expenses.filter((e) => e.category?.expenseTypeId === 4);
  }

  get totalCurrentMonth(): number {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return this.maintenanceExpenses
      .filter((e) => {
        const d = new Date(e.expenseDate);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }

  get totalPreviousMonth(): number {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const prevMonth = now.getMonth();
    const prevYear = now.getFullYear();

    return this.maintenanceExpenses
      .filter((e) => {
        const d = new Date(e.expenseDate);
        return d.getMonth() === prevMonth && d.getFullYear() === prevYear;
      })
      .reduce((sum, e) => sum + e.amount, 0);
  }

  get maintenanceDifferential(): { percentage: number; isIncrease: boolean } {
    const current = this.totalCurrentMonth;
    const previous = this.totalPreviousMonth;

    if (previous === 0) {
      return { percentage: current > 0 ? 100 : 0, isIncrease: current > 0 };
    }

    const diff = current - previous;
    const percentage = Math.abs(Math.round((diff / previous) * 100));
    return { percentage, isIncrease: diff > 0 };
  }

  get tripDifferential(): { percentage: number; isIncrease: boolean } {
    if (this.totalPreviousTrip === 0) {
      return { percentage: 0, isIncrease: false };
    }

    const current = this.totalAmount;
    const previous = this.totalPreviousTrip;
    const diff = current - previous;
    const percentage = Math.abs(Math.round((diff / previous) * 100));
    return { percentage, isIncrease: diff > 0 };
  }

  get lastUpdateText(): string {
    const relevantExpenses = this.isMaintenance
      ? this.maintenanceExpenses
      : this.expenses.filter((e) => e.category?.expenseTypeId !== 4);

    if (relevantExpenses.length === 0) return 'Sin registros';

    const lastExpense = relevantExpenses.reduce((latest, current) => {
      const latestDate = new Date(latest.creationDate || 0).getTime();
      const currentDate = new Date(current.creationDate || 0).getTime();
      return currentDate > latestDate ? current : latest;
    }, relevantExpenses[0]);

    if (!lastExpense.creationDate) return 'Sin registros';

    const diffMs =
      new Date().getTime() - new Date(lastExpense.creationDate).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60)
      return `Hace ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
    if (diffHours < 24)
      return `Hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    return `Hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
  }

  get currentMonthName(): string {
    const months = [
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
    return months[new Date().getMonth()];
  }
}
