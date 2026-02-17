import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelPartner } from 'src/app/models/partner-model';

@Component({
  selector: 'app-g-owner-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-owner-card.component.html',
  styleUrls: ['./g-owner-card.component.scss'],
})
export class GOwnerCardComponent {
  @Input() partner!: ModelPartner;
  @Output() edit = new EventEmitter<ModelPartner>();

  onEditClick(): void {
    this.edit.emit(this.partner);
  }

  get badgeClass(): string {
    // Mock logic for badge class based on some property, e.g., membership type
    // Since membership type isn't clearly defined in the model provided, using a placeholder logic
    // You might want to adjust this based on actual data
    return 'badge-primary';
  }

  get statusClass(): string {
    return this.partner.status === 'Active' ? 'bg-success' : 'bg-secondary';
  }
}
