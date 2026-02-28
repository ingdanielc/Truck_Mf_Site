import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'g-expense-category-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-expense-category-card.component.html',
  styleUrls: ['./g-expense-category-card.component.scss'],
})
export class GExpenseCategoryCardComponent {
  @Input() icon: string = '';
  @Input() name: string = '';
  @Input() colorClass: string = 'text-success bg-success';
  @Input() selected: boolean = false;
  @Input() isNew: boolean = false; // Styling for the "Nueva" category card

  @Output() cardClick = new EventEmitter<void>();

  onClick(): void {
    this.cardClick.emit();
  }
}
