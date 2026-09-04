import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { LocationService } from 'src/app/services/location.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ModelDriverLocation } from 'src/app/models/location-model';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ModelDocumentFile } from 'src/app/models/document-model';
import { Formatters } from 'src/app/utils/formatters';
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
import { GDocumentViewerComponent } from 'src/app/components/g-document-viewer/g-document-viewer.component';
import { GVehicleDocumentsComponent } from 'src/app/components/g-vehicle-documents/g-vehicle-documents.component';
import { PlatePipe } from '../../pipes/plate.pipe';

/** Documento ya listo para pintar: nombre resuelto y vigencia calculada. */
export interface VehicleDocumentRow {
  document: ModelDocumentFile;
  name: string;
  validity: DocumentValidity;
}

@Component({
  selector: 'app-g-vehicle-card',
  standalone: true,
  imports: [
    CommonModule,
    GDocumentViewerComponent,
    GVehicleDocumentsComponent,
    PlatePipe,
  ],
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
  /** Abre el offcanvas de gestion de documentos, que vive en la vista padre. */
  @Output() manageDocuments = new EventEmitter<ModelVehicle>();

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
  /** Reverso de la tarjeta: misma foto, lista de documentos en lugar de datos. */
  showDocuments: boolean = false;
  /** Panel lateral para cargar o gestionar los documentos del vehículo. */
  isDocumentsOpen: boolean = false;

  /** Documento abierto en el visor; null cuando no hay ninguno. */
  viewerUrl: string | null = null;
  viewerName: string = '';

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
        }
      },
    });

    // Los documentos los ve cualquier rol, así que se piden sin esperar al
    // usuario: la tarjeta muestra la lista o el aviso de que no hay ninguno.
    if (this.vehicle.id) {
      this.loadDocuments();
    }

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

  get hasDocuments(): boolean {
    return this.documentRows.length > 0;
  }

  /**
   * El conductor consulta los documentos pero no los modifica, y un vehiculo
   * vendido ya no recibe ninguno: en ambos casos el reverso solo muestra.
   */
  get canEditDocuments(): boolean {
    return this.userRole !== 'CONDUCTOR' && !this.isSold;
  }

  /** El boton lleva al reverso: a la lista, o al aviso de que no hay nada. */
  get documentsButtonTitle(): string {
    if (this.showDocuments) return 'Ver información';
    return this.hasDocuments ? 'Ver documentos' : 'Cargar documentos';
  }

  /** El reverso se abre siempre: sin documentos muestra cómo cargarlos. */
  toggleDocuments(event?: Event): void {
    event?.stopPropagation();
    this.showDocuments = !this.showDocuments;
  }

  /**
   * Abre el panel de carga. Sale del reverso al cerrarlo solo si sigue sin
   * documentos: si se cargó alguno, la lista es lo que interesa ver.
   */
  openDocuments(event?: Event): void {
    event?.stopPropagation();
    if (!this.vehicle.id || !this.canEditDocuments) return;
    this.isDocumentsOpen = true;
  }

  closeDocuments(): void {
    this.isDocumentsOpen = false;
    if (!this.hasDocuments) this.showDocuments = false;
  }

  /** Lista que devuelve el panel tras cada cambio, ya sin los inactivos. */
  setDocuments(documents: ModelDocumentFile[]): void {
    this.documentRows = documents
      .filter((item) => item.isActive !== false)
      .map((item) => ({
        document: item,
        name: getDocumentTypeName(item),
        validity: getDocumentValidity(item),
      }));
  }

  /**
   * Muestra el escaneo en el visor de la app; sin archivo no hay nada que ver.
   * Se corta la propagación para que la tarjeta no navegue al detalle.
   */
  openDocumentFile(row: VehicleDocumentRow, event: Event): void {
    event.stopPropagation();
    if (!row.document.fileUrl) return;
    this.viewerUrl = row.document.fileUrl;
    this.viewerName = row.name;
  }

  closeViewer(): void {
    this.viewerUrl = null;
    this.viewerName = '';
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
   * Cuerpo de la tarjeta: abre la ficha del vehículo, esté a la vista la cara
   * de información o el reverso de documentos. Los botones del pie, el volver
   * del reverso y los atajos de estado, ubicación y archivo cortan la
   * propagación para conservar su comportamiento actual.
   */
  onCardClick(): void {
    if (!this.vehicle.id) return;
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

  /** Gestionar documentos es de administrador y propietario; el conductor solo lee. */
  get canManageDocuments(): boolean {
    return this.userRole === 'ADMINISTRADOR' || this.userRole === 'PROPIETARIO';
  }

  onManageDocumentsClick(event: Event): void {
    event.stopPropagation();
    this.manageDocuments.emit(this.vehicle);
  }

  get odometerKm(): string {
    return Formatters.formatOdometer(this.vehicle.totalKm);
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
