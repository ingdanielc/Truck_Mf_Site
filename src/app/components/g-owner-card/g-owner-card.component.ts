import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelOwner } from 'src/app/models/owner-model';

@Component({
  selector: 'app-g-owner-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-owner-card.component.html',
  styleUrls: ['./g-owner-card.component.scss'],
})
export class GOwnerCardComponent {
  @Input() owner!: ModelOwner;
  @Output() edit = new EventEmitter<ModelOwner>();

  onEditClick(): void {
    this.edit.emit(this.owner);
  }

  get badgeClass(): string {
    // Mock logic for badge class based on some property, e.g., membership type
    // Since membership type isn't clearly defined in the model provided, using a placeholder logic
    // You might want to adjust this based on actual data
    return 'badge-primary';
  }

  get statusClass(): string {
    return this.owner.status === 'Active' ? 'bg-success' : 'bg-secondary';
  }

  get formattedCellPhone(): string {
    if (!this.owner.cellPhone) return '';
    const phone = this.owner.cellPhone.replace(/\D/g, '');
    if (phone.length === 10) {
      return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6, 8)} ${phone.substring(8, 10)}`;
    }
    return this.owner.cellPhone || '';
  }
}
