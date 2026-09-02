import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { LocationService } from 'src/app/services/location.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ModelDriverLocation } from 'src/app/models/location-model';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ModelDocumentFile } from 'src/app/models/document-model';
import {
  DocumentValidity,
  getDocumentTypeName,
  getDocumentValidity,
} from 'src/app/utils/document-utils';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

/** Documento ya listo para pintar: nombre resuelto y vigencia calculada. */
export interface VehicleDocumentRow {
  document: ModelDocumentFile;
  name: string;
  validity: DocumentValidity;
}

@Component({
  selector: 'app-g-vehicle-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-vehicle-card.component.html',
  styleUrls: ['./g-vehicle-card.component.scss'],
})
export class GVehicleCardComponent implements OnInit {
  @Input() vehicle!: ModelVehicle;
  @Input() canEdit: boolean = true;
  @Output() edit = new EventEmitter<ModelVehicle>();
  @Output() viewDetails = new EventEmitter<ModelVehicle>();
  @Output() maintenance = new EventEmitter<ModelVehicle>();
  @Output() sell = new EventEmitter<ModelVehicle>();

  lastLocation: ModelDriverLocation | null = null;
  loadingLocation: boolean = true;
  userRole: string = '';

  /**
   * Documentos vigentes del vehículo con su vigencia ya resuelta. Se cargan
   * aparte porque el filtro de vehículos no los trae, y solo sirven para el
   * botón y la vista de reverso: mientras no lleguen, la tarjeta se ve y
   * funciona igual que siempre. La vigencia se calcula al recibirlos y no en
   * la plantilla, que la volvería a calcular en cada detección de cambios.
   */
  documentRows: VehicleDocumentRow[] = [];
  loadingDocuments: boolean = false;
  /** userData$ puede emitir de nuevo; los documentos se piden una sola vez. */
  private documentsRequested: boolean = false;
  /** Reverso de la tarjeta: misma foto, lista de documentos en lugar de datos. */
  showDocuments: boolean = false;

  constructor(
    private readonly router: Router,
    private readonly locationService: LocationService,
    private readonly securityService: SecurityService,
    private readonly vehicleService: VehicleService,
  ) {}

  ngOnInit(): void {
    this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          // Los documentos son, por ahora, solo del administrador: ni se piden
          // para los demás roles, así que la tarjeta no gasta la consulta.
          if (this.isAdmin && this.vehicle.id && !this.documentsRequested) {
            this.documentsRequested = true;
            this.loadDocuments();
          }
        }
      },
    });

    if (this.vehicle.id && this.vehicle.currentDriverId) {
      this.loadLastLocation();
    } else {
      this.loadingLocation = false;
    }
  }

  private loadDocuments(): void {
    const filter = new ModelFilterTable(
      [new Filter('vehicleId', '=', this.vehicle.id!.toString())],
      new Pagination(50, 0),
      new Sort('expiryDate', true),
    );

    this.loadingDocuments = true;
    this.vehicleService.getVehicleDocuments(filter).subscribe({
      next: (resp: any) => {
        // `isActive` se descarta aquí y no en el filtro: la comparación del
        // backend castea a texto y un booleano no sobrevive ese casteo.
        const actives: ModelDocumentFile[] = (resp?.data?.content || []).filter(
          (item: ModelDocumentFile) => item.isActive !== false,
        );
        this.documentRows = actives.map((item) => ({
          document: item,
          name: getDocumentTypeName(item),
          validity: getDocumentValidity(item),
        }));
        this.loadingDocuments = false;
      },
      error: (err) => {
        console.error('Error loading vehicle documents:', err);
        this.documentRows = [];
        this.loadingDocuments = false;
      },
    });
  }

  get isAdmin(): boolean {
    return this.userRole === 'ADMINISTRADOR';
  }

  get hasDocuments(): boolean {
    return this.isAdmin && this.documentRows.length > 0;
  }

  toggleDocuments(event?: Event): void {
    event?.stopPropagation();
    if (!this.hasDocuments) return;
    this.showDocuments = !this.showDocuments;
  }

  /** Abre el escaneo en otra pestaña; sin archivo el documento no es un enlace. */
  openDocumentFile(row: VehicleDocumentRow, event: Event): void {
    event.stopPropagation();
    if (!row.document.fileUrl) return;
    window.open(row.document.fileUrl, '_blank', 'noopener');
  }

  private loadLastLocation(): void {
    const filter = new ModelFilterTable(
      [
        new Filter('vehicleId', '=', this.vehicle.id!.toString()),
        new Filter('driverId', '=', this.vehicle.currentDriverId!.toString()),
      ],
      new Pagination(1, 0),
      new Sort('id', false),
    );

    this.locationService.getLocationService(filter).subscribe({
      next: (resp: any) => {
        this.lastLocation = resp?.data?.content?.[0] || null;
        this.loadingLocation = false;
      },
      error: (err) => {
        console.error('Error loading last location:', err);
        this.loadingLocation = false;
      },
    });
  }

  onLocationClick(event: Event): void {
    event.stopPropagation();
    if (this.vehicle.id) {
      this.router.navigate(['/site/map'], {
        queryParams: { vehicleId: this.vehicle.id, from: 'vehicles' },
      });
    }
  }

  onEditClick(): void {
    this.edit.emit(this.vehicle);
  }

  onViewDetails(): void {
    this.viewDetails.emit(this.vehicle);
  }

  /**
   * Cuerpo de la tarjeta: abre la ficha del vehículo. Los botones del pie y los
   * atajos de estado y ubicación cortan la propagación para conservar su
   * comportamiento actual.
   */
  onCardClick(): void {
    if (this.showDocuments || !this.vehicle.id) return;
    this.router.navigate(['/site/vehicles', this.vehicle.id], {
      queryParams: { from: 'vehicles' },
    });
  }
  onMaintenanceClick(): void {
    this.maintenance.emit(this.vehicle);
  }

  onTripsClick(): void {
    const queryParams: any = {};
    if (this.userRole === 'ADMINISTRADOR') {
      queryParams.vehicleId = this.vehicle.id;
      const ownerId = this.vehicle.ownerId || this.vehicle.owners?.[0]?.ownerId;
      if (ownerId) queryParams.ownerId = ownerId;
    } else if (
      this.userRole === 'PROPIETARIO' ||
      this.userRole === 'CONDUCTOR'
    ) {
      queryParams.vehicleId = this.vehicle.id;
    }
    this.router.navigate(['/site/trips'], { queryParams });
  }

  onStatusClick(event?: Event): void {
    event?.stopPropagation();
    if (
      this.vehicle.lastTripStatus?.toUpperCase() === 'EN CURSO' &&
      this.vehicle.lastTripId
    ) {
      this.router.navigate(['/site/trips', this.vehicle.lastTripId], {
        queryParams: { from: 'vehicles' },
      });
    }
  }

  onSellClick(): void {
    if (this.canSell) {
      this.sell.emit(this.vehicle);
    }
  }

  get canSell(): boolean {
    return (
      (this.userRole === 'ADMINISTRADOR' || this.userRole === 'PROPIETARIO') &&
      this.displayTripStatus === 'Disponible' &&
      this.vehicle.status !== 'Vendido'
    );
  }

  get isSold(): boolean {
    return this.vehicle.status === 'Vendido';
  }

  get statusClass(): string {
    if (this.vehicle.status === 'Vendido') return 'badge-sold';
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    switch (status) {
      case 'DISPONIBLE':
        return 'badge-completed';
      case 'EN CURSO':
        return 'badge-in-progress';
      default:
        return 'badge-default';
    }
  }

  get displayTripStatus(): string {
    if (this.vehicle.status === 'Vendido') return 'Vendido';
    const status = (this.vehicle.lastTripStatus || '').toUpperCase();
    if (status === 'DISPONIBLE') return 'Disponible';
    return this.vehicle.lastTripStatus || 'Sin Viajes';
  }

  get statusDotClass(): string {
    switch (this.vehicle.status?.toLowerCase()) {
      case 'activo':
        return 'dot-available';
      case 'inactivo':
        return 'dot-busy';
      default:
        return 'dot-default';
    }
  }
}
