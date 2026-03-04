import { Component, Input } from '@angular/core';

import { ModelVehicle } from '../../models/vehicle-model';

@Component({
  selector: 'g-vehicle-good-card',
  standalone: true,
  imports: [],
  templateUrl: './g-vehicle-good-card.component.html',
  styleUrls: ['./g-vehicle-good-card.component.scss'],
})
export class GVehicleGoodCardComponent {
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
