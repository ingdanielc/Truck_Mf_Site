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
  @Input() salaryTypes: any[] = [];
  @Output() edit = new EventEmitter<ModelDriver>();
  @Output() changePassword = new EventEmitter<ModelDriver>();
  @Output() viewDetail = new EventEmitter<ModelDriver>();

  isMenuOpen = false;

  get salaryInfo(): string {
    if (!this.driver.salaryTypeId || !this.driver.salary) return '';
    const type = this.salaryTypes.find(
      (t) => t.id === this.driver.salaryTypeId,
    );
    if (!type) return '';

    const isPercentage = type.name.toUpperCase().includes('PORCENTAJE');
    const formattedValue = isPercentage
      ? `${this.driver.salary}%`
      : new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(this.driver.salary);

    return `${type.name}: ${formattedValue}`;
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  onEditClick(event?: Event): void {
    event?.stopPropagation();
    this.isMenuOpen = false;
    this.edit.emit(this.driver);
  }

  onChangePasswordClick(event?: Event): void {
    event?.stopPropagation();
    this.isMenuOpen = false;
    this.changePassword.emit(this.driver);
  }

  onViewProfile(): void {
    if (this.isMenuOpen) return;
    this.viewDetail.emit(this.driver);
  }

  get statusClass(): string {
    const status = this.driver.user?.status;
    const isActive = !this.driver.user || status === 'Activo';
    return isActive ? 'bg-success' : 'bg-secondary';
  }

  get statusName(): string {
    const status = this.driver.user?.status;
    const isActive = !this.driver.user || status === 'Activo';
    return isActive ? 'Activo' : 'Inactivo';
  }

  get formattedCellPhone(): string {
    if (!this.driver.cellPhone) return '';
    const phone = this.driver.cellPhone.replaceAll(/\D/g, '');
    if (phone.length === 10) {
      return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6, 8)} ${phone.substring(8, 10)}`;
    }
    return this.driver.cellPhone || '';
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
