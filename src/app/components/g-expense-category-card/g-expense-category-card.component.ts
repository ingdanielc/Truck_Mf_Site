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
  @Input() disabled: boolean = false;
  /**
   * Apaga a gris el circulo del icono, dejando el resto de la tarjeta igual.
   *
   */
  @Input() iconMuted: boolean = false;

  @Output() cardClick = new EventEmitter<void>();

  /**
   * Las clases del circulo del icono, ya resueltas.
   *
   */
  get iconClasses(): string {
    if (this.selected && !this.isNew) return 'bg-white text-primary';

    return this.iconMuted
      ? 'bg-secondary bg-opacity-10 text-secondary'
      : 'bg-primary bg-opacity-10 text-primary';
  }

  onClick(): void {
    if (!this.disabled) {
      this.cardClick.emit();
    }
  }
}
