import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelTrip } from '../../models/trip-model';
import { Router } from '@angular/router';

@Component({
  selector: 'g-trip-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-trip-card.component.html',
  styleUrls: ['./g-trip-card.component.scss'],
})
export class GTripCardComponent {
  @Input({ required: true }) trip!: ModelTrip;
  @Input() cities: any[] = [];
  @Output() edit = new EventEmitter<ModelTrip>();

  constructor(private readonly router: Router) {}

  navigateToDetail(): void {
    if (this.trip.id) {
      this.router.navigate(['/site/trips', this.trip.id]);
    }
  }

  onEditClick(event: Event): void {
    event.stopPropagation();
    this.edit.emit(this.trip);
  }

  get progressPercentage(): number {
    if (this.trip.paidBalance) return 100;
    const total = this.trip.freight || 0;
    const paid = this.trip.advancePayment || 0;
    if (total === 0) return 0;
    return (paid / total) * 100;
  }

  get displayFreight(): number {
    return this.trip.freight ?? this.trip.freight ?? 0;
  }

  get displayAdvance(): number {
    return this.trip.advancePayment ?? this.trip.advancePayment ?? 0;
  }

  get displayBalance(): number {
    return this.trip.balance ?? this.displayFreight - this.displayAdvance;
  }

  get originName(): string {
    if (!this.trip.originId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip.originId),
    );
    return city
      ? (city.state ? city.state + ' - ' : '') + city.name
      : this.trip.originId;
  }

  get destinationName(): string {
    if (!this.trip.destinationId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip.destinationId),
    );
    return city
      ? (city.state ? city.state + ' - ' : '') + city.name
      : this.trip.destinationId;
  }
  getStatusClass(status: string): string {
    switch ((status || '').toUpperCase()) {
      case 'COMPLETADO':
        return 'badge-completed';
      case 'PENDIENTE':
        return 'badge-pending';
      default:
        return 'badge-in-progress';
    }
  }

  get tripDuration(): number {
    if (!this.trip.startDate || !this.trip.endDate) return 0;
    const start = new Date(this.trip.startDate);
    const end = new Date(this.trip.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}
