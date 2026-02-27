import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelExpense } from '../../models/expense-model';

interface CategoryConfig {
  name: string;
  icon: string;
  colorClass: string;
}

@Component({
  selector: 'g-expense-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-expense-card.component.html',
  styleUrls: ['./g-expense-card.component.scss'],
})
export class GExpenseCardComponent implements OnInit {
  @Input({ required: true }) expense!: ModelExpense;
  @Input() totalAmount: number = 0; // Total expenses amount to calculate the %

  categoryMap: Record<number, CategoryConfig> = {
    // Gastos del viaje
    1: {
      name: 'COMBUSTIBLE',
      icon: 'fa-solid fa-gas-pump',
      colorClass: 'text-warning bg-warning',
    },
    2: {
      name: 'PEAJES',
      icon: 'fa-solid fa-circle-dot',
      colorClass: 'text-indigo bg-indigo',
    },
    3: {
      name: 'ALIMENTACIÓN',
      icon: 'fa-solid fa-utensils',
      colorClass: 'text-success bg-success',
    },
    // Gastos del vehículo
    4: {
      name: 'REPARACIONES',
      icon: 'fa-solid fa-toolbox',
      colorClass: 'text-danger bg-danger',
    },
    5: {
      name: 'MANTENIMIENTO',
      icon: 'fa-solid fa-gear',
      colorClass: 'text-info bg-info',
    },
    6: {
      name: 'LAVADO',
      icon: 'fa-solid fa-car-wash',
      colorClass: 'text-success bg-success',
    },
  };

  defaultConfig: CategoryConfig = {
    name: 'OTRO',
    icon: 'fa-solid fa-receipt',
    colorClass: 'text-secondary bg-secondary',
  };

  ngOnInit(): void {}

  get config(): CategoryConfig {
    return this.categoryMap[this.expense.categoryId] || this.defaultConfig;
  }

  get percentage(): number {
    if (!this.totalAmount || this.totalAmount <= 0) return 0;
    return Math.round((this.expense.amount / this.totalAmount) * 100);
  }
}
