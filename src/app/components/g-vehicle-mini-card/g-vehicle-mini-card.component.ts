import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from '../../models/vehicle-model';

@Component({
  selector: 'g-vehicle-mini-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-mini-card.component.html',
  styleUrls: ['./g-vehicle-mini-card.component.scss'],
})
export class GVehicleMiniCardComponent {
  @Input({ required: true }) vehicle!: ModelVehicle;
  @Input() showDriver: boolean = true;

  getStatusColorClass(): string {
    const status = (this.vehicle.status || '').toLowerCase();
    if (status === 'activo' || status === 'active') return 'status-active';
    if (status === 'inactivo' || status === 'inactive')
      return 'status-inactive';
    return 'status-other';
  }

  get statusColorClass(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    if (status === 'EN CURSO') return 'status-in-progress';
    if (status === 'COMPLETADO' || status === 'PENDIENTE')
      return 'status-available';
    return 'status-other';
  }

  get displayTripStatus(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    if (status === 'COMPLETADO' || status === 'PENDIENTE') return 'Disponible';
    return this.vehicle.lastTripStatus || 'Sin Viajes';
  }

  get statusBadgeClass(): string {
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    switch (status) {
      case 'COMPLETADO':
      case 'PENDIENTE':
        return 'bg-success bg-opacity-10 text-success border border-success border-opacity-25';
      case 'EN CURSO':
        return 'bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25';
      case 'CANCELADO':
        return 'bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25';
      default:
        return 'bg-secondary bg-opacity-10 text-secondary border border-secondary border-opacity-25';
    }
  }
}
