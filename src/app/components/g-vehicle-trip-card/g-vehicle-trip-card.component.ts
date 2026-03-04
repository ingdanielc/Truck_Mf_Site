import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from '../../models/vehicle-model';
import { ModelTrip } from '../../models/trip-model';
import { CommonService } from '../../services/common.service';

@Component({
  selector: 'g-vehicle-trip-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-trip-card.component.html',
  styleUrls: ['./g-vehicle-trip-card.component.scss'],
})
export class GVehicleTripCardComponent implements OnInit {
  @Input({ required: true }) vehicle!: ModelVehicle;
  @Input({ required: true }) trip!: ModelTrip;
  @Input() cities: any[] = [];

  constructor(private readonly commonService: CommonService) {}

  ngOnInit(): void {
    if (this.cities.length === 0) {
      this.loadCities();
    }
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data;
        }
      },
    });
  }

  get vehicleBrand(): string {
    return this.vehicle?.vehicleBrandName || '';
  }

  get originName(): string {
    return this.getCityName(this.trip?.originId);
  }

  get destinationName(): string {
    return this.getCityName(this.trip?.destinationId);
  }

  private getCityName(cityId: any): string {
    if (!cityId) return 'N/A';
    const city = this.cities.find((c) => String(c.id) === String(cityId));
    return city ? city.name : String(cityId);
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
}
