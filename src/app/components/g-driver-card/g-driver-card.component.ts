import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelDriver } from 'src/app/models/driver-model';

@Component({
  selector: 'app-g-driver-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-driver-card.component.html',
  styleUrls: ['./g-driver-card.component.scss'],
})
export class GDriverCardComponent {
  @Input() driver!: ModelDriver;
  @Output() edit = new EventEmitter<ModelDriver>();

  onEditClick(): void {
    this.edit.emit(this.driver);
  }

  get statusClass(): string {
    return this.driver.status === 'Active' ? 'bg-success' : 'bg-secondary';
  }

  get formattedCellPhone(): string {
    if (!this.driver.cellPhone) return '';
    const phone = this.driver.cellPhone.replace(/\D/g, '');
    if (phone.length === 10) {
      return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6, 8)} ${phone.substring(8, 10)}`;
    }
    return this.driver.cellPhone || '';
  }
}
