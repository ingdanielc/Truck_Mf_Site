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
    switch (this.vehicle.status?.toLowerCase()) {
      case 'disponible':
        return 'status-available';
      case 'ocupado':
        return 'status-busy';
      default:
        return 'status-default';
    }
  }

  get statusDotClass(): string {
    switch (this.vehicle.status?.toLowerCase()) {
      case 'disponible':
        return 'dot-available';
      case 'ocupado':
        return 'dot-busy';
      default:
        return 'dot-default';
    }
  }
}
