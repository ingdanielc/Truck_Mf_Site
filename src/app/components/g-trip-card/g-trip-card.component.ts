import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelTrip } from '../../models/trip-model';

@Component({
  selector: 'g-trip-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-trip-card.component.html',
  styleUrls: ['./g-trip-card.component.scss'],
})
export class GTripCardComponent {
  @Input({ required: true }) trip!: ModelTrip;

  get progressPercentage(): number {
    const total = this.trip.freight || this.trip.totalFreight || 0;
    const paid = this.trip.advancePayment || this.trip.advance || 0;
    if (total === 0) return 0;
    return (paid / total) * 100;
  }

  get displayFreight(): number {
    return this.trip.freight ?? this.trip.totalFreight ?? 0;
  }

  get displayAdvance(): number {
    return this.trip.advancePayment ?? this.trip.advance ?? 0;
  }

  get displayBalance(): number {
    return this.trip.balance ?? this.displayFreight - this.displayAdvance;
  }
}
