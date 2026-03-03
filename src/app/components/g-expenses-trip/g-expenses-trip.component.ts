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

  expenses: ModelExpense[] = [];
  loading = false;
  budget: number = 5000000;

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
    return this.expenses.reduce((sum, e) => sum + e.amount, 0);
  }

  get remainingBudget(): number {
    return Math.max(0, this.budget - this.totalAmount);
  }

  get budgetPercentage(): number {
    if (this.budget <= 0) return 0;
    return Math.min(100, Math.round((this.totalAmount / this.budget) * 100));
  }

  get tripExpenses(): ModelExpense[] {
    // Type 3 is and 2 are usually for trip/driver, 1 for vehicle.
    // If not present, we fallback to the old logic or show all in trip.
    return this.expenses.filter((e) => {
      const type = e.category?.expenseTypeId || 0;
      return type === 3 || type === 2 || type === 0;
    });
  }

  get vehicleExpenses(): ModelExpense[] {
    return this.expenses.filter((e) => e.category?.expenseTypeId === 1);
  }
}
