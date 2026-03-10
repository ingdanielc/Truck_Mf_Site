import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelExpense } from '../../models/expense-model';
import {
  CategoryConfig,
  getCategoryConfigById,
  getCategoryConfigByName,
} from '../../utils/category-config';

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
  @Output() edit = new EventEmitter<ModelExpense>();

  ngOnInit(): void {}

  get config(): CategoryConfig {
    const name = this.expense.category?.name || this.expense.categoryName;
    if (name) {
      return getCategoryConfigByName(name);
    }
    return getCategoryConfigById(this.expense.categoryId);
  }

  get percentage(): number {
    if (!this.totalAmount || this.totalAmount <= 0) return 0;
    return Math.round((this.expense.amount / this.totalAmount) * 100);
  }

  get mobileDisplayName(): string {
    const name = this.config.name || '';
    return name.length > 23 ? name.slice(0, 23) + '…' : name;
  }
}
