import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GExpenseCardComponent } from '../g-expense-card/g-expense-card.component';
import { ModelExpense } from '../../models/expense-model';

@Component({
  selector: 'g-expenses-trip',
  standalone: true,
  imports: [CommonModule, GExpenseCardComponent],
  templateUrl: './g-expenses-trip.component.html',
  styleUrls: ['./g-expenses-trip.component.scss'],
})
export class GExpensesTripComponent implements OnInit {
  @Input({ required: true }) tripId!: number;

  // Hardcoded mockup data until an API is available
  expenses: ModelExpense[] = [
    {
      id: 1,
      tripId: this.tripId,
      vehicleId: 1,
      categoryId: 1, // COMBUSTIBLE
      description: '3 Tanqueos realizados',
      amount: 2800000,
      expenseDate: '2023-10-12',
    },
    {
      id: 2,
      tripId: this.tripId,
      vehicleId: 1,
      categoryId: 2, // PEAJES
      description: 'Ruta Bogotá - Cali (10 peajes)',
      amount: 450000,
      expenseDate: '2023-10-12',
    },
    {
      id: 3,
      tripId: this.tripId,
      vehicleId: 1,
      categoryId: 3, // ALIMENTACIÓN
      description: 'Viáticos diarios asignados',
      amount: 250000,
      expenseDate: '2023-10-13',
    },
    {
      id: 4,
      tripId: this.tripId,
      vehicleId: 1,
      categoryId: 4, // REPARACIONES
      description: 'Cambio de correa en ruta',
      amount: 600000,
      expenseDate: '2023-10-14',
    },
    {
      id: 5,
      tripId: this.tripId,
      vehicleId: 1,
      categoryId: 5, // MANTENIMIENTO
      description: 'Revisión de frenos y niveles',
      amount: 150000,
      expenseDate: '2023-10-15',
    },
  ];

  budget: number = 5000000;

  ngOnInit(): void {
    // Here we would typically fetch the expenses for this.tripId from a service
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
    const vehicleCategoryIds = [4, 5, 6]; // REPARACIONES, MANTENIMIENTO, LAVADO
    return this.expenses.filter(
      (e) => !vehicleCategoryIds.includes(e.categoryId),
    );
  }

  get vehicleExpenses(): ModelExpense[] {
    const vehicleCategoryIds = [4, 5, 6];
    return this.expenses.filter((e) =>
      vehicleCategoryIds.includes(e.categoryId),
    );
  }
}
