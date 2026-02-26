import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ModelOwner } from 'src/app/models/owner-model';

@Component({
  selector: 'g-vehicle-owner-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-owner-card.component.html',
  styleUrls: ['./g-vehicle-owner-card.component.scss'],
})
export class GVehicleOwnerCardComponent {
  @Input() owner!: ModelOwner;
  @Input() itemCount: number = 0;
  @Input() itemLabel: string = 'Vehículos';

  @Output() viewProfile = new EventEmitter<ModelOwner>();

  constructor(private readonly router: Router) {}

  onViewProfile(): void {
    this.viewProfile.emit(this.owner);
  }

  goToDetail(): void {
    if (this.owner.id) {
      this.router.navigate(['/site/owners', this.owner.id]);
    }
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
