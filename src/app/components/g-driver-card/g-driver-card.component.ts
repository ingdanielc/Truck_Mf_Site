import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelDriver } from 'src/app/models/driver-model';
import { Formatters } from '../../utils/formatters';
import { SubscriptionUtils } from '../../utils/subscription';

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
  @Input() canEdit: boolean = true;
  /** Botón de documentos. El propietario no lo ve en su propio registro de
   *  conductor: sus documentos se cargan desde su ficha de propietario. */
  @Input() showDocuments: boolean = true;
  @Output() edit = new EventEmitter<ModelDriver>();
  @Output() changePassword = new EventEmitter<ModelDriver>();
  @Output() toggleStatus = new EventEmitter<ModelDriver>();
  @Output() viewDetail = new EventEmitter<ModelDriver>();
  /** Abre el offcanvas de documentos, que vive en la vista padre. */
  @Output() manageDocuments = new EventEmitter<ModelDriver>();

  isMenuOpen = false;

  /** Tipo de salario del conductor, si tiene salario registrado. */
  private get salaryType(): any | null {
    if (!this.driver.salaryTypeId || !this.driver.salary) return null;
    return (
      this.salaryTypes.find((t) => t.id === this.driver.salaryTypeId) ?? null
    );
  }

  /** El tipo de salario tal como viene del catálogo. */
  get salaryTypeName(): string {
    return this.salaryType?.name ?? '';
  }

  /**
   * El tipo sin la palabra "mensual", para el teléfono: con el botón de
   * documentos al lado el texto se partía en dos líneas. "Salario mensual"
   * queda en "Salario"; "Porcentaje" no cambia.
   */
  get salaryTypeShortName(): string {
    return this.salaryTypeName.replace(/\s*\bmensual\b\s*/gi, ' ').trim();
  }

  /** El valor ya formateado: "$ 2.000.000" o "15%". */
  get salaryAmount(): string {
    const type = this.salaryType;
    if (!type || !this.driver.salary) return '';

    const isPercentage = type.name.toUpperCase().includes('PORCENTAJE');
    return isPercentage
      ? `${this.driver.salary}%`
      : new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          maximumFractionDigits: 0,
        }).format(this.driver.salary);
  }

  get salaryInfo(): string {
    if (!this.salaryType) return '';
    return `${this.salaryTypeName}: ${this.salaryAmount}`;
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  closeMenu(): void {
    this.isMenuOpen = false;
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

  onToggleStatusClick(event?: Event): void {
    event?.stopPropagation();
    this.isMenuOpen = false;
    this.toggleStatus.emit(this.driver);
  }

  onManageDocumentsClick(event: Event): void {
    event.stopPropagation();
    this.isMenuOpen = false;
    this.manageDocuments.emit(this.driver);
  }

  onViewProfile(): void {
    if (this.isMenuOpen) return;
    this.viewDetail.emit(this.driver);
  }

  /**
   * La licencia ya vencio: pinta el vencimiento en rojo.
   *
   * La misma regla que el detalle del conductor —solo el dia, en hora de
   * Bogota, y el propio dia del vencimiento todavia cuenta como vigente—, para
   * que la tarjeta y la ficha no digan cosas distintas del mismo conductor.
   */
  get isLicenseExpired(): boolean {
    return SubscriptionUtils.isExpired(this.driver?.licenseExpiry);
  }

  get isActive(): boolean {
    const status = this.driver.user?.status;
    return !this.driver.user || status === 'Activo';
  }

  get statusClass(): string {
    return this.isActive ? 'bg-success' : 'bg-secondary';
  }

  get statusName(): string {
    return this.isActive ? 'Activo' : 'Inactivo';
  }

  get isAssignedToVehicle(): boolean {
    return !!this.driver.currentVehicleId || !!this.driver.currentVehiclePlate;
  }

  get assignmentClass(): string {
    return this.isAssignedToVehicle ? 'badge-assigned' : 'badge-available';
  }

  get assignmentLabel(): string {
    if (!this.isAssignedToVehicle) return 'Disponible';
    return (
      Formatters.formatPlate(this.driver.currentVehiclePlate) || 'Asignado'
    );
  }

  get formattedCellPhone(): string {
    return Formatters.formatPhone(this.driver.cellPhone);
  }

  formatDocNumber(value: any): string {
    return Formatters.formatDocNumber(value);
  }
}
