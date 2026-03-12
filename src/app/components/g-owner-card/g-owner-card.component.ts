import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
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
  @Output() changePassword = new EventEmitter<ModelOwner>();
  @Output() toggleStatus = new EventEmitter<ModelOwner>();

  @Input() isMenuOpen = false;
  @Output() menuToggle = new EventEmitter<number | null>();

  constructor(private readonly router: Router) {}

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuToggle.emit(this.isMenuOpen ? null : this.owner.id);
  }

  onChangePasswordClick(event?: Event): void {
    event?.stopPropagation();
    this.menuToggle.emit(null);
    this.changePassword.emit(this.owner);
  }

  onToggleStatusClick(event?: Event): void {
    event?.stopPropagation();
    this.menuToggle.emit(null);
    this.toggleStatus.emit(this.owner);
  }

  onEditClick(event?: Event): void {
    event?.stopPropagation();
    this.menuToggle.emit(null);
    this.edit.emit(this.owner);
  }

  goToVehicles(): void {
    this.router.navigate(['site', 'vehicles'], {
      queryParams: { ownerId: this.owner.id },
    });
  }

  goToDrivers(): void {
    this.router.navigate(['site', 'drivers'], {
      queryParams: { ownerId: this.owner.id },
    });
  }

  goToDetail(): void {
    if (this.owner.id) {
      this.router.navigate(['/site/owners', this.owner.id]);
    }
  }

  get badgeClass(): string {
    return 'badge-primary';
  }

  get statusClass(): string {
    return this.owner.user?.status === 'Activo' ? 'bg-success' : 'bg-secondary';
  }

  get formattedCellPhone(): string {
    if (!this.owner.cellPhone) return '';
    const phone = this.owner.cellPhone.replaceAll(/\D/g, '');
    if (phone.length === 10) {
      return `${phone.substring(0, 3)} ${phone.substring(3, 6)} ${phone.substring(6, 8)} ${phone.substring(8, 10)}`;
    }
    return this.owner.cellPhone || '';
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
