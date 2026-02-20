import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
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
  @Input() vehicleCount: number = 0;

  @Output() viewProfile = new EventEmitter<ModelOwner>();

  onViewProfile(): void {
    this.viewProfile.emit(this.owner);
  }
}
