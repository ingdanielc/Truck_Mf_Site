import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModelTrip } from '../../models/trip-model';
import { Router } from '@angular/router';
import { PlatePipe } from '../../pipes/plate.pipe';
import {
  TRIP_STATUSES,
  canChangeTripStatus,
  canSetTripStatus,
  isCancelledTrip,
} from '../../utils/trip-status';

@Component({
  selector: 'g-trip-card',
  standalone: true,
  imports: [CommonModule, PlatePipe],
  templateUrl: './g-trip-card.component.html',
  styleUrls: ['./g-trip-card.component.scss'],
})
export class GTripCardComponent {
  @Input({ required: true }) trip!: ModelTrip;
  @Input() cities: any[] = [];
  @Input() userRole: string = 'ROL';
  /** Solo se usa en viajes vacíos: reemplaza al flete en la tarjeta */
  @Input() tripExpenses: number = 0;
  @Output() edit = new EventEmitter<ModelTrip>();
  /** Estado elegido en la etiqueta. Quien la escuche confirma y guarda. */
  @Output() statusChange = new EventEmitter<{
    trip: ModelTrip;
    status: string;
  }>();

  isStatusMenuOpen = false;

  /**
   * La etiqueta de estado abre un menú para cambiarlo sin entrar al detalle.
   * Un viaje completado solo lo reabre el administrador, igual que en el
   * detalle; para el resto la etiqueta se queda como estaba.
   */
  get canChangeStatus(): boolean {
    return canChangeTripStatus(this.trip.status, this.userRole);
  }

  /**
   * Los estados que este rol puede elegir. "Cancelado" no se le ofrece al
   * conductor; si el viaje ya lo está, la opción se deja a la vista —marcada
   * como la actual— para que el menú no mienta sobre en qué estado está.
   */
  get statusOptions(): readonly string[] {
    return TRIP_STATUSES.filter(
      (status) =>
        canSetTripStatus(status, this.userRole) || status === this.trip.status,
    );
  }

  /**
   * El viaje vacío no puede quedar Pendiente —no hay saldo que cobrar—, salvo
   * que ya lo esté. La opción se deja a la vista pero sin efecto, como en el
   * selector del detalle.
   */
  isStatusOptionDisabled(status: string): boolean {
    if (status === this.trip.status) return true;
    if (!canSetTripStatus(status, this.userRole)) return true;
    return this.isEmptyTrip && status === 'Pendiente';
  }

  /** El viaje vacío no tiene flete, manifiesto ni anticipo */
  get isEmptyTrip(): boolean {
    return this.trip.tripType === 'VACIO';
  }

  /** El viaje redondo suma un destino de regreso a la ruta */
  get isRoundTrip(): boolean {
    return this.trip.tripType === 'REDONDO';
  }

  constructor(private readonly router: Router) {}

  navigateToDetail(): void {
    if (this.isStatusMenuOpen) return;
    if (this.trip.id) {
      this.router.navigate(['/site/trips', this.trip.id]);
    }
  }

  toggleStatusMenu(event: Event): void {
    /* El clic no debe llegar a la tarjeta, que navega al detalle. */
    event.stopPropagation();
    if (!this.canChangeStatus) return;

    /* Por eso mismo tampoco llega al `document`, que es quien cierra los
       menús: sin esto, abrir el de una tarjeta dejaba abierto el de la
       anterior. Se cierran todos antes de decidir el propio. */
    const estabaAbierto = this.isStatusMenuOpen;
    document.dispatchEvent(new Event('click'));
    this.isStatusMenuOpen = !estabaAbierto;
  }

  onStatusOptionClick(event: Event, status: string): void {
    event.stopPropagation();
    this.isStatusMenuOpen = false;
    if (this.isStatusOptionDisabled(status)) return;
    /* Defensa de fondo: la opción ni siquiera se ofrece, pero el estado que
       sale de aquí acaba en una petición de guardado. */
    if (!canSetTripStatus(status, this.userRole)) return;
    this.statusChange.emit({ trip: this.trip, status });
  }

  /* El menú vive dentro de una tarjeta que navega al hacer clic: sin esto se
     quedaba abierto al pulsar en cualquier otro sitio de la pantalla. */
  @HostListener('document:click')
  closeStatusMenu(): void {
    this.isStatusMenuOpen = false;
  }

  onEditClick(event: Event): void {
    event.stopPropagation();
    this.edit.emit(this.trip);
  }

  onExpensesClick(event: Event): void {
    event.stopPropagation();
    if (this.trip.id) {
      const vehicleId = this.trip.vehicle?.id || this.trip.vehicleId;
      this.router.navigate(['/site/expenses'], {
        queryParams: {
          tripId: this.trip.id,
          vehicleId: vehicleId,
          origin: 'list',
        },
      });
    }
  }

  get progressPercentage(): number {
    if (this.trip.paidBalance) return 100;
    const total = this.trip.freight || 0;
    const paid = this.trip.advancePayment || 0;
    if (total === 0) return 0;
    return (paid / total) * 100;
  }

  get displayFreight(): number {
    return this.trip.freight ?? this.trip.freight ?? 0;
  }

  get displayAdvance(): number {
    return this.trip.advancePayment ?? this.trip.advancePayment ?? 0;
  }

  get displayBalance(): number {
    return this.trip.balance ?? this.displayFreight - this.displayAdvance;
  }

  get originName(): string {
    if (!this.trip.originId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip.originId),
    );
    return city ? city.name + ' (' + city.state + ')' : this.trip.originId;
  }

  get destinationName(): string {
    if (!this.trip.destinationId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip.destinationId),
    );
    return city ? city.name + ' (' + city.state + ')' : this.trip.destinationId;
  }
  get returnDestinationName(): string {
    if (!this.trip.returnDestinationId) return 'N/A';
    const city = this.cities.find(
      (c) => String(c.id) === String(this.trip.returnDestinationId),
    );
    return city
      ? city.name + ' (' + city.state + ')'
      : this.trip.returnDestinationId;
  }

  get isCancelled(): boolean {
    return isCancelledTrip(this.trip.status);
  }

  getStatusClass(status: string): string {
    if (isCancelledTrip(status)) return 'badge-cancelled';
    switch ((status || '').toUpperCase()) {
      case 'COMPLETADO':
        return 'badge-completed';
      case 'PENDIENTE':
        return 'badge-pending';
      default:
        return 'badge-in-progress';
    }
  }

  /**
   * Tema de la tarjeta: fija el color del estado, con el que se pintan los
   * iconos de vehículo y conductor, la ruta y las acciones del pie. Así la
   * tarjeta se lee de un vistazo sin tener que buscar la etiqueta de estado.
   */
  get statusTheme(): string {
    if (this.isCancelled) return 'status-cancelled';
    switch ((this.trip.status || '').toUpperCase()) {
      case 'COMPLETADO':
        return 'status-completed';
      case 'PENDIENTE':
        return 'status-pending';
      default:
        return 'status-in-progress';
    }
  }

  get tripDuration(): number {
    if (!this.trip.startDate || !this.trip.endDate) return 0;
    const start = new Date(this.trip.startDate);
    const end = new Date(this.trip.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}
