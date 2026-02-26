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

  getStatusColorClass(): string {
    const status = (this.vehicle.status || '').toLowerCase();
    if (status === 'activo' || status === 'active') return 'status-active';
    if (status === 'inactivo' || status === 'inactive')
      return 'status-inactive';
    return 'status-other';
  }

  getStatusLabel(): string {
    const status = (this.vehicle.status || '').toLowerCase();
    if (status === 'activo' || status === 'active') return 'Activo';
    if (status === 'inactivo' || status === 'inactive') return 'Inactivo';
    return this.vehicle.status || 'En Ruta';
  }

  get statusClass(): string {
    switch (this.vehicle.status?.toLowerCase()) {
      case 'activo':
        return 'status-available';
      case 'inactivo':
        return 'status-busy';
      default:
        return 'status-default';
    }
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
