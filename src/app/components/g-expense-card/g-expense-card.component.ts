import {
  Component,
  EventEmitter,
  Inject,
  Input,
  LOCALE_ID,
  Output,
} from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { ModelExpense } from '../../models/expense-model';
import {
  CategoryConfig,
  getCategoryConfigById,
  getCategoryConfigByName,
} from '../../utils/category-config';

/**
 * Gastos de una misma categoría dentro de un viaje (o del rango consultado en
 * mantenimiento). Una categoría sin repeticiones es un grupo de un solo gasto:
 * la tarjeta se dibuja igual que antes, sin contador ni chevron y con el botón
 * "Editar" a la derecha.
 */
export interface ExpenseGroup {
  /** Clave estable para `@for ... track` */
  key: string;
  categoryId: number;
  categoryName: string;
  /** Suma de `items`, calculada por quien arma el grupo */
  total: number;
  /** Ordenados por fecha ascendente */
  items: ModelExpense[];
}

@Component({
  selector: 'g-expense-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-expense-card.component.html',
  styleUrls: ['./g-expense-card.component.scss'],
})
export class GExpenseCardComponent {
  @Input({ required: true }) group!: ExpenseGroup;
  /** Total de la vista, para calcular el % que representa el grupo */
  @Input() totalAmount: number = 0;
  @Output() edit = new EventEmitter<ModelExpense>();

  expanded = false;

  /** Fecha con anio, tal como se muestra en el detalle del grupo */
  static readonly DATE_FORMAT = 'd MMM, y';

  constructor(@Inject(LOCALE_ID) private readonly locale: string) {}

  get isGroup(): boolean {
    return this.group.items.length > 1;
  }

  /** Único gasto de la categoría cuando no hay repeticiones */
  get single(): ModelExpense {
    return this.group.items[0];
  }

  get config(): CategoryConfig {
    return this.group.categoryName
      ? getCategoryConfigByName(this.group.categoryName)
      : getCategoryConfigById(this.group.categoryId);
  }

  get percentage(): number {
    if (!this.totalAmount || this.totalAmount <= 0) return 0;
    return Math.round((this.group.total / this.totalAmount) * 100);
  }

  get mobileDisplayName(): string {
    const name = this.config.name || '';
    return name.length > 21 ? name.slice(0, 21) + '…' : name;
  }

  /**
   * Subtítulo de la tarjeta: la descripción del gasto suelto o, si la
   * categoría se repite, "3 registros · 12 ago – 18 ago".
   */
  get detailText(): string {
    if (!this.isGroup) return this.single?.description ?? '';

    const count = `${this.group.items.length} registros`;
    const range = this.dateRange;
    return range ? `${count} · ${range}` : count;
  }

  private get dateRange(): string {
    const times = this.group.items
      .map((e) => new Date(e.expenseDate).getTime())
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return '';

    const first = Math.min(...times);
    const last = Math.max(...times);
    const from = formatDate(
      first,
      GExpenseCardComponent.DATE_FORMAT,
      this.locale,
    );
    const to = formatDate(last, GExpenseCardComponent.DATE_FORMAT, this.locale);
    if (from === to) return from;

    /* Dentro del mismo anio el rango lo lleva una sola vez al final:
       "12 ago – 18 ago, 2026" en lugar de repetirlo en los dos extremos. */
    const sameYear =
      formatDate(first, 'y', this.locale) ===
      formatDate(last, 'y', this.locale);
    const start = sameYear ? formatDate(first, 'd MMM', this.locale) : from;
    return `${start} – ${to}`;
  }

  toggle(): void {
    if (this.isGroup) this.expanded = !this.expanded;
  }

  /** Enter/espacio sobre la cabecera; el espacio no debe desplazar la página */
  onHeaderKeydown(event: Event): void {
    if (!this.isGroup) return;
    event.preventDefault();
    this.toggle();
  }
}
