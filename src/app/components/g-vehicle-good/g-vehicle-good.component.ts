import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from '../../models/vehicle-model';

@Component({
  selector: 'g-vehicle-good',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-good.component.html',
  styleUrls: ['./g-vehicle-good.component.scss'],
})
export class GVehicleGoodComponent {
  @Input({ required: true }) vehicle!: ModelVehicle;

  get displayTitle(): string {
    const brand = this.vehicle.vehicleBrandName ?? '';
    const year = this.vehicle.year ?? '';
    return [brand, year].filter(Boolean).join(' ');
  }

  get location(): string {
    // currentDriverName used as location placeholder; adapt when a city field is available
    return this.vehicle.currentDriverName
      ? `Conductor: ${this.vehicle.currentDriverName}`
      : 'Sin conductor asignado';
  }
}
