import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'g-trip-mini-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-trip-mini-card.component.html',
  styleUrls: ['./g-trip-mini-card.component.scss'],
})
export class GTripMiniCardComponent {
  @Input() origin: string = 'Bogotá';
  @Input() destination: string = 'Medellín';
  @Input() status: string = 'En ruta';
  @Input() isSelected: boolean = false;

  get statusClass(): string {
    const s = (this.status || '').toUpperCase();
    if (s.includes('COMPLETADO')) return 'badge-completed';
    if (s.includes('PENDIENTE')) return 'badge-pending';
    if (s.includes('CANCELADO')) return 'badge-cancelled';
    return 'badge-in-progress';
  }

  get containerClass(): string {
    const s = (this.status || '').toLowerCase();
    if (s.includes('curso') || s.includes('ruta')) return 'container-active';
    return 'container-previous';
  }
}
