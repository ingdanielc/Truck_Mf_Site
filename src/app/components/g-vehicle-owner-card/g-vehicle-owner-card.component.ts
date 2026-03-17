import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  OnInit,
} from '@angular/core';
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
export class GVehicleOwnerCardComponent implements OnInit {
  @Input() owner!: ModelOwner;
  @Input() itemCount: number = 0;
  @Input() itemLabel: string = 'Vehículos';
  @Input() disableClick: boolean = false;
  @Input() from: string = 'trips';

  @Output() viewProfile = new EventEmitter<ModelOwner>();
  isMobile: boolean = false;

  @HostListener('window:resize', ['$event'])
  onResize(): void {
    this.checkIsMobile();
  }

  ngOnInit(): void {
    this.checkIsMobile();
  }

  private checkIsMobile(): void {
    this.isMobile = window.innerWidth < 768; // Standard Bootstrap md breakpoint
  }

  get displayName(): string {
    const name = this.owner?.name ?? '';
    if (this.isMobile && name.length > 19) {
      return name.substring(0, 16) + '...';
    }
    return name;
  }

  constructor(
    private readonly router: Router,
    private readonly securityService: SecurityService,
  ) {}

  goToDetail(): void {
    if (this.disableClick) return;
    const user = this.securityService.getUserData();
    const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    // Administrador can see any owner
    if (role === 'ADMINISTRADOR' && this.owner.id) {
      this.router.navigate(['/site/owners', this.owner.id], {
        queryParams: { from: this.from },
      });
      return;
    }

    // Propietario or Conductor can see the owner profile (redirected/filtered)
    if ((role === 'PROPIETARIO' || role === 'CONDUCTOR') && this.owner.id) {
      this.router.navigate(['/site/owners', this.owner.id], {
        queryParams: { from: this.from },
      });
    }
  }

  onHeaderClick(event: Event): void {
    if (!this.disableClick) return;
    const user = this.securityService.getUserData();
    const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    if (role === 'ADMINISTRADOR' && this.owner.id) {
      event.stopPropagation();
      this.router.navigate(['/site/owners', this.owner.id], {
        queryParams: { from: this.from },
      });
    }
  }

  formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
