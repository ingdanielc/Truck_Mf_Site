import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { isCancelledTrip } from '../../utils/trip-status';

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
  /** Solo se informa en viajes redondos: convierte la ruta en tres puntos */
  @Input() returnDestination: string = '';
  @Input() status: string = 'En ruta';

  get isRoundTrip(): boolean {
    return !!this.returnDestination;
  }
  @Input() numberTrip: string | number = '';
  @Input() isSelected: boolean = false;

  get statusClass(): string {
    const s = (this.status || '').toUpperCase();
    if (isCancelledTrip(this.status)) return 'badge-cancelled';
    if (s.includes('COMPLETADO')) return 'badge-completed';
    if (s.includes('PENDIENTE')) return 'badge-pending';
    return 'badge-in-progress';
  }

  get containerClass(): string {
    const s = (this.status || '').toLowerCase();
    if (s.includes('curso') || s.includes('ruta')) return 'total-card';
    return 'bg-body-tertiary';
  }
}
