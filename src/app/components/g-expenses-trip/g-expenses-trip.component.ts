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

  expenses: ModelExpense[] = [];
  loading = false;
  @Input() budget: number = 0;

  constructor(private readonly expenseService: ExpenseService) {}

  ngOnInit(): void {
    this.loadExpenses();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['tripId'] && !changes['tripId'].firstChange) ||
      (changes['vehicleId'] && !changes['vehicleId'].firstChange)
    ) {
      this.loadExpenses();
    }
  }

  loadExpenses(): void {
    if (!this.tripId || !this.vehicleId) return;

    this.loading = true;
    const filters = [
      new Filter('vehicleId', '=', this.vehicleId.toString()),
      new Filter('tripId', '=', this.tripId.toString()),
    ];

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

  get lastUpdateText(): string {
    if (this.expenses.length === 0) return 'Sin registros';

    const lastExpense = this.expenses.reduce((latest, current) => {
      const latestDate = new Date(latest.creationDate || 0).getTime();
      const currentDate = new Date(current.creationDate || 0).getTime();
      return currentDate > latestDate ? current : latest;
    }, this.expenses[0]);

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
}
