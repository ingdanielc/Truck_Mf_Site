import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from '../../models/vehicle-model';
import { ModelTrip } from '../../models/trip-model';
import { ModelExpense } from '../../models/expense-model';
import { CommonService } from '../../services/common.service';

@Component({
  selector: 'g-vehicle-trip-exp-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-trip-exp-card.component.html',
  styleUrls: ['./g-vehicle-trip-exp-card.component.scss'],
})
export class GVehicleTripExpCardComponent implements OnInit {
  @Input({ required: true }) vehicle!: ModelVehicle;
  @Input({ required: true }) trip!: ModelTrip;
  @Input({ required: true }) expenses: ModelExpense[] = [];
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
      error: (err) => console.error('Error loading cities:', err),
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

  // Financial calculations
  get totalIncome(): number {
    return this.trip?.freight || 0;
  }

  get tripExpenses(): ModelExpense[] {
    if (!this.trip?.id) return [];
    return this.expenses.filter((e) => e.tripId === this.trip.id);
  }

  get totalExpenses(): number {
    return this.tripExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  }

  get profit(): number {
    return this.totalIncome - this.totalExpenses;
  }

  get profitMargin(): number {
    if (this.totalIncome === 0) return 0;
    return this.profit / this.totalIncome;
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
