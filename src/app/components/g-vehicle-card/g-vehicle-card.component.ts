import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from 'src/app/models/vehicle-model';

@Component({
  selector: 'app-g-vehicle-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-card.component.html',
  styleUrls: ['./g-vehicle-card.component.scss'],
})
export class GVehicleCardComponent {
  @Input() vehicle!: ModelVehicle;
  @Output() edit = new EventEmitter<ModelVehicle>();
  @Output() viewDetails = new EventEmitter<ModelVehicle>();

  onEditClick(): void {
    this.edit.emit(this.vehicle);
  }

  onViewDetails(): void {
    this.viewDetails.emit(this.vehicle);
  }

  get statusClass(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    switch (status) {
      case 'COMPLETADO':
      case 'PENDIENTE':
        return 'badge-completed';
      case 'EN CURSO':
        return 'badge-in-progress';
      case 'CANCELADO':
        return 'badge-cancelled';
      default:
        return 'badge-default';
    }
  }

  get displayTripStatus(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    if (status === 'COMPLETADO' || status === 'PENDIENTE') return 'Disponible';
    return this.vehicle.lastTripStatus || 'Sin Viajes';
  }

  get statusDotClass(): string {
    switch (this.vehicle.status?.toLowerCase()) {
      case 'activo':
        return 'dot-available';
      case 'inactivo':
        return 'dot-busy';
      default:
        return 'dot-default';
    }
  }
}
