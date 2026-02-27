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
      category: 'COMBUSTIBLE',
      description: '3 Tanqueos realizados',
      amount: 2800000,
      date: '2023-10-12',
    },
    {
      id: 2,
      tripId: this.tripId,
      category: 'PEAJES',
      description: 'Ruta Bogotá - Cali (10 peajes)',
      amount: 450000,
      date: '2023-10-12',
    },
    {
      id: 3,
      tripId: this.tripId,
      category: 'ALIMENTACIÓN',
      description: 'Viáticos diarios asignados',
      amount: 250000,
      date: '2023-10-13',
    },
    {
      id: 4,
      tripId: this.tripId,
      category: 'REPARACIONES',
      description: 'Cambio de correa en ruta',
      amount: 600000,
      date: '2023-10-14',
    },
    {
      id: 5,
      tripId: this.tripId,
      category: 'MANTENIMIENTO',
      description: 'Revisión de frenos y niveles',
      amount: 150000,
      date: '2023-10-15',
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
    const vehicleCategories = ['REPARACIONES', 'MANTENIMIENTO', 'LAVADO'];
    return this.expenses.filter(
      (e) => !vehicleCategories.includes(e.category.toUpperCase()),
    );
  }

  get vehicleExpenses(): ModelExpense[] {
    const vehicleCategories = ['REPARACIONES', 'MANTENIMIENTO', 'LAVADO'];
    return this.expenses.filter((e) =>
      vehicleCategories.includes(e.category.toUpperCase()),
    );
  }
}
