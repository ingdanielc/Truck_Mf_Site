import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ModelOwner } from 'src/app/models/owner-model';
import { SecurityService } from 'src/app/services/security/security.service';

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

  constructor(
    private readonly router: Router,
    private readonly securityService: SecurityService,
  ) {}

  goToDetail(): void {
    const user = this.securityService.getUserData();
    const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    // Administrador can see any owner
    if (role === 'ADMINISTRADOR' && this.owner.id) {
      this.router.navigate(['/site/owners', this.owner.id]);
      return;
    }

    // Propietario or Conductor can see the owner profile (redirected/filtered)
    if ((role === 'PROPIETARIO' || role === 'CONDUCTOR') && this.owner.id) {
      this.router.navigate(['/site/owners', this.owner.id]);
    }
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
