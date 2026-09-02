import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, catchError, firstValueFrom, of } from 'rxjs';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelTrip } from 'src/app/models/trip-model';
import { ModelExpense } from 'src/app/models/expense-model';
import { ModelDriverLocation } from 'src/app/models/location-model';
import { ModelDocumentFile } from 'src/app/models/document-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { VehicleService } from 'src/app/services/vehicle.service';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import { TripService } from 'src/app/services/trip.service';
import { CommonService } from 'src/app/services/common.service';
import { LocationService } from 'src/app/services/location.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { Formatters } from 'src/app/utils/formatters';
import {
  DocumentValidity,
  getDocumentTypeName,
  getDocumentValidity,
} from 'src/app/utils/document-utils';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';
import { GVehicleTripCardComponent } from 'src/app/components/g-vehicle-trip-card/g-vehicle-trip-card.component';
import { GVehicleDocumentsComponent } from 'src/app/components/g-vehicle-documents/g-vehicle-documents.component';

/** Documento con nombre y vigencia resueltos, listo para pintar en la tarjeta. */
interface DocumentRow {
  document: ModelDocumentFile;
  name: string;
  validity: DocumentValidity;
}

/**
 * Ficha completa de un vehículo. Es el lugar donde viven los documentos: la
 * creación quedó deliberadamente sin ellos para no cargar el alta, así que
 * cargarlos es un paso posterior y opcional que se hace desde aquí.
 */
@Component({
  selector: 'app-vehicle-detail',
  standalone: true,
  imports: [
    CommonModule,
    GCameraComponent,
    GVehicleTripCardComponent,
    GVehicleDocumentsComponent,
  ],
  templateUrl: './vehicle-detail.component.html',
  styleUrls: ['./vehicle-detail.component.scss'],
})
export class VehicleDetailComponent implements OnInit, OnDestroy {
  vehicleId: number | null = null;
  vehicle: ModelVehicle | null = null;

  trips: ModelTrip[] = [];
  expenses: ModelExpense[] = [];
  documentRows: DocumentRow[] = [];
  lastLocation: ModelDriverLocation | null = null;
  cities: any[] = [];
  brands: any[] = [];

  loading: boolean = true;
  loadingTrips: boolean = true;
  loadingExpenses: boolean = true;
  loadingLocation: boolean = true;
  tripCount: number = 0;

  userRole: string = '';
  isAdmin: boolean = false;
  isConductor: boolean = false;
  fromSource: string | null = null;

  showCamera: boolean = false;
  isMenuOpen: boolean = false;
  isDocumentsOpen: boolean = false;

  showSellConfirm: boolean = false;
  isSelling: boolean = false;

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly vehicleService: VehicleService,
    private readonly tripService: TripService,
    private readonly expenseService: ExpenseService,
    private readonly commonService: CommonService,
    private readonly locationService: LocationService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly location: Location,
  ) {}

  ngOnInit(): void {
    this.fromSource = this.route.snapshot.queryParamMap.get('from');

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (!id) return;

      this.vehicleId = Number(id);
      this.vehicle = null;
      this.loadBrands();
      this.loadCities();

      this.securityService.userData$.subscribe({
        next: (user) => {
          if (user && this.vehicleId) {
            this.validateAccess(this.vehicleId, user);
          }
        },
      });
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  /**
   * El propietario solo entra a sus vehículos y el conductor solo al que tiene
   * asignado, y de este último en modo lectura. La comprobación se hace contra
   * el vehículo ya cargado para no repetir consultas.
   */
  private validateAccess(vehicleId: number, user: any): void {
    this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
    this.isAdmin = this.userRole === 'ADMINISTRADOR';
    this.isConductor = this.userRole === 'CONDUCTOR';

    this.loadVehicle(vehicleId, user);
  }

  private loadVehicle(vehicleId: number, user: any): void {
    this.loading = true;
    const filter = new ModelFilterTable(
      [new Filter('id', '=', vehicleId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.vehicleService.getVehicleFilter(filter).subscribe({
      next: async (response: any) => {
        const found = response?.data?.content?.[0];
        if (!found) {
          this.toastService.showError('Error', 'No se encontró el vehículo');
          this.loading = false;
          this.goBack();
          return;
        }

        const allowed = await this.isAllowed(found, user);
        if (!allowed) {
          this.toastService.showError(
            'Acceso Denegado',
            'No tiene permiso para ver este vehículo',
          );
          this.loading = false;
          this.goBack();
          return;
        }

        this.vehicle = found;
        this.vehicle!.lastTripStatus = found.occupied
          ? 'En Curso'
          : 'Disponible';
        if (found.driver?.name) {
          this.vehicle!.currentDriverName = found.driver.name;
        }
        if (this.vehicle?.photo) {
          this.vehicle.photo = `${this.vehicle.photo.split('?')[0]}?t=${Date.now()}`;
        }
        this.mapBrandName();
        this.loading = false;

        this.loadTrips(vehicleId);
        this.loadExpenses(vehicleId);
        // Los documentos son, por ahora, solo del administrador.
        if (this.isAdmin) {
          this.loadDocuments(vehicleId);
        }
        this.loadLastLocation();
        this.resolveDriverName();
      },
      error: (err) => {
        console.error('Error loading vehicle:', err);
        this.toastService.showError('Error', 'Error al cargar el vehículo');
        this.loading = false;
        this.goBack();
      },
    });
  }

  private async isAllowed(vehicle: ModelVehicle, user: any): Promise<boolean> {
    if (this.isAdmin) return true;

    if (this.userRole === 'PROPIETARIO') {
      const response = await firstValueFrom(
        this.ownerService
          .getOwnerFilter(
            new ModelFilterTable(
              [new Filter('user.id', '=', user.id.toString())],
              new Pagination(1, 0),
              new Sort('id', true),
            ),
          )
          .pipe(catchError(() => of(null))),
      );
      const ownerId = (response as any)?.data?.content?.[0]?.id;
      if (ownerId == null) return false;
      return (vehicle.owners || []).some((rel) => rel.ownerId === ownerId);
    }

    if (this.isConductor) {
      const response = await firstValueFrom(
        this.driverService
          .getDriverFilter(
            new ModelFilterTable(
              [new Filter('user.id', '=', user.id.toString())],
              new Pagination(1, 0),
              new Sort('id', true),
            ),
          )
          .pipe(catchError(() => of(null))),
      );
      const driverId = (response as any)?.data?.content?.[0]?.id;
      return driverId != null && vehicle.currentDriverId === driverId;
    }

    return false;
  }

  private loadTrips(vehicleId: number): void {
    this.loadingTrips = true;
    const filter = new ModelFilterTable(
      [new Filter('vehicle.id', '=', vehicleId.toString())],
      new Pagination(5, 0),
      new Sort('id', false),
    );
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.trips = response?.data?.content ?? [];
        this.tripCount = response?.data?.totalElements ?? this.trips.length;
        this.loadingTrips = false;
      },
      error: (err) => {
        console.error('Error loading trips:', err);
        this.loadingTrips = false;
      },
    });
  }

  private loadExpenses(vehicleId: number): void {
    this.loadingExpenses = true;
    const filter = new ModelFilterTable(
      [new Filter('vehicleId', '=', vehicleId.toString())],
      new Pagination(1000, 0),
      new Sort('id', false),
    );
    this.expenseService.getExpenseFilter(filter).subscribe({
      next: (response: any) => {
        this.expenses = response?.data?.content ?? [];
        this.loadingExpenses = false;
      },
      error: (err) => {
        console.error('Error loading expenses:', err);
        this.loadingExpenses = false;
      },
    });
  }

  private loadDocuments(vehicleId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('vehicleId', '=', vehicleId.toString())],
      new Pagination(50, 0),
      new Sort('expiryDate', true),
    );
    this.vehicleService.getVehicleDocuments(filter).subscribe({
      next: (response: any) => {
        // `isActive` se descarta aquí y no en el filtro: la comparación del
        // backend castea a texto y un booleano no sobrevive ese casteo.
        const actives: ModelDocumentFile[] = (
          response?.data?.content || []
        ).filter((item: ModelDocumentFile) => item.isActive !== false);
        this.setDocuments(actives);
      },
      error: (err) => {
        console.error('Error loading vehicle documents:', err);
        this.documentRows = [];
      },
    });
  }

  /** El panel devuelve la lista ya vigente tras cada cambio; se reusa tal cual. */
  setDocuments(documents: ModelDocumentFile[]): void {
    this.documentRows = documents.map((item) => ({
      document: item,
      name: getDocumentTypeName(item),
      validity: getDocumentValidity(item),
    }));
  }

  private loadLastLocation(): void {
    if (!this.vehicle?.id || !this.vehicle.currentDriverId) {
      this.loadingLocation = false;
      return;
    }
    const filter = new ModelFilterTable(
      [
        new Filter('vehicleId', '=', this.vehicle.id.toString()),
        new Filter('driverId', '=', this.vehicle.currentDriverId.toString()),
      ],
      new Pagination(1, 0),
      new Sort('id', false),
    );
    this.locationService.getLocationService(filter).subscribe({
      next: (response: any) => {
        this.lastLocation = response?.data?.content?.[0] || null;
        this.loadingLocation = false;
      },
      error: () => {
        this.loadingLocation = false;
      },
    });
  }

  /** El filtro no siempre trae el nombre del conductor asignado. */
  private resolveDriverName(): void {
    if (!this.vehicle?.currentDriverId || this.vehicle.currentDriverName) {
      return;
    }
    this.driverService
      .getDriverFilter(
        new ModelFilterTable(
          [new Filter('id', '=', this.vehicle.currentDriverId.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      )
      .subscribe({
        next: (response: any) => {
          const driver = response?.data?.content?.[0];
          if (driver && this.vehicle) {
            this.vehicle.currentDriverName = driver.name;
          }
        },
        error: () => undefined,
      });
  }

  private loadBrands(): void {
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        this.brands = response?.data ?? [];
        this.mapBrandName();
      },
      error: (err) => console.error('Error loading brands:', err),
    });
  }

  private loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        this.cities = response?.data ?? [];
      },
      error: (err) => console.error('Error loading cities:', err),
    });
  }

  private mapBrandName(): void {
    if (!this.vehicle || this.vehicle.vehicleBrandName || !this.brands.length) {
      return;
    }
    const brand = this.brands.find(
      (b) => String(b.id) === String(this.vehicle?.vehicleBrandId),
    );
    if (brand) this.vehicle.vehicleBrandName = brand.name;
  }

  // --- Derivados de presentación ---

  get isSold(): boolean {
    return this.vehicle?.status === 'Vendido';
  }

  get canEdit(): boolean {
    return !this.isConductor && !this.isSold;
  }

  get canSell(): boolean {
    return (
      (this.isAdmin || this.userRole === 'PROPIETARIO') &&
      this.displayTripStatus === 'Disponible' &&
      !this.isSold
    );
  }

  get displayTripStatus(): string {
    if (this.isSold) return 'Vendido';
    const status = (this.vehicle?.lastTripStatus || '').toUpperCase();
    if (status === 'DISPONIBLE') return 'Disponible';
    return this.vehicle?.lastTripStatus || 'Sin Viajes';
  }

  get statusTextClass(): string {
    if (this.isSold) return 'text-danger';
    return this.displayTripStatus === 'En Curso' ? 'text-info' : 'text-success';
  }

  /**
   * Mantenimientos del vehículo: los gastos que no cuelgan de ningún viaje.
   * El resto son gastos de viaje y se ven en la ficha del viaje, no aquí.
   */
  get maintenanceExpenses(): ModelExpense[] {
    return this.expenses.filter((expense) => !expense.tripId);
  }

  get totalMaintenance(): number {
    return this.maintenanceExpenses.reduce(
      (total, expense) => total + (Number(expense.amount) || 0),
      0,
    );
  }

  /** Documentos vencidos o a menos de un mes de vencer: lo que hay que atender. */
  get documentsToRenew(): number {
    return this.documentRows.filter(
      (row) =>
        row.validity.state === 'vencido' || row.validity.state === 'por-vencer',
    ).length;
  }

  get ownerRelations() {
    return this.vehicle?.owners ?? [];
  }

  formatDocNumber(value: any): string {
    return Formatters.formatDocNumber(value);
  }

  // --- Navegación ---

  goBack(): void {
    if (this.fromSource === 'owners') {
      this.router.navigate(['/site/owners']);
    } else if (this.fromSource) {
      this.location.back();
    } else {
      this.router.navigate(['/site/vehicles']);
    }
  }

  goToOwner(ownerId: number | undefined): void {
    if (!ownerId || this.isConductor) return;
    this.router.navigate(['/site/owners', ownerId], {
      queryParams: { from: 'vehicles' },
    });
  }

  goToDriver(): void {
    const driverId = this.vehicle?.currentDriverId;
    if (!driverId) return;
    this.router.navigate(['/site/drivers', driverId], {
      queryParams: { from: 'vehicles' },
    });
  }

  goToTrips(): void {
    this.router.navigate(['/site/trips'], {
      queryParams: { vehicleId: this.vehicleId },
    });
  }

  goToExpenses(): void {
    this.router.navigate(['/site/expenses'], {
      queryParams: { vehicleId: this.vehicleId },
    });
  }

  goToMaintenance(): void {
    this.router.navigate(['/site/maintenance'], {
      queryParams: { vehicleId: this.vehicleId },
    });
  }

  goToMap(): void {
    if (!this.vehicleId) return;
    this.router.navigate(['/site/map'], {
      queryParams: { vehicleId: this.vehicleId, from: 'vehicles' },
    });
  }

  /**
   * El formulario de creación y edición vive en el listado. Se navega hasta
   * allí pidiendo que abra el offcanvas de este vehículo, en vez de duplicar
   * aquí un formulario que ya existe.
   */
  goToEdit(): void {
    this.isMenuOpen = false;
    if (!this.vehicleId) return;
    this.router.navigate(['/site/vehicles'], {
      queryParams: { editVehicleId: this.vehicleId },
    });
  }

  // --- Documentos ---

  openDocuments(): void {
    this.isMenuOpen = false;
    if (!this.isAdmin) return;
    this.isDocumentsOpen = true;
  }

  closeDocuments(): void {
    this.isDocumentsOpen = false;
  }

  /**
   * Comparte los documentos por WhatsApp. WhatsApp no admite adjuntar archivos
   * desde un enlace, así que el mensaje lleva los datos de cada documento y la
   * URL de su escaneo, que el destinatario abre desde el chat.
   */
  shareDocumentsByWhatsApp(): void {
    if (this.documentRows.length === 0) return;

    const header = [
      `*Documentos ${this.vehicle?.plate ?? ''}*`,
      [
        this.vehicle?.vehicleBrandName || '',
        this.vehicle?.model || '',
        this.vehicle?.year ? `(${this.vehicle.year})` : '',
      ]
        .filter(Boolean)
        .join(' '),
    ].filter(Boolean);

    const body = this.documentRows.map((row) => {
      const lines = [`• *${row.name}* — ${row.validity.label}`];
      if (row.document.documentNumber) {
        lines.push(`  N° ${row.document.documentNumber}`);
      }
      if (row.document.issuer) {
        lines.push(`  Expedido por ${row.document.issuer}`);
      }
      lines.push(
        row.document.fileUrl
          ? `  ${row.document.fileUrl}`
          : '  (sin archivo adjunto)',
      );
      return lines.join('\n');
    });

    const text = [...header, '', ...body].join('\n');
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener',
    );
  }

  openDocumentFile(row: DocumentRow, event: Event): void {
    event.stopPropagation();
    if (!row.document.fileUrl) return;
    window.open(row.document.fileUrl, '_blank', 'noopener');
  }

  // --- Foto ---

  toggleMenu(event?: Event): void {
    event?.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.[0] || !this.vehicle?.id) return;

    try {
      const processed = await CustomValidators.readPhotoFile(event);
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto(
          'vehicle',
          this.vehicle.id,
          processed.blob,
        ),
      );
      if (uploadRes?.data) {
        this.updateVehiclePhoto(uploadRes.data);
      }
    } catch (err) {
      console.error('Error uploading vehicle photo:', err);
      this.toastService.showError('Error', 'No se pudo subir la foto');
    }
  }

  async onCameraCapture(dataUrl: string): Promise<void> {
    this.showCamera = false;
    if (!this.vehicle?.id) return;

    const byteString = atob(dataUrl.split(',')[1]);
    const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const buffer = new ArrayBuffer(byteString.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.codePointAt(i) ?? 0;
    }

    try {
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto(
          'vehicle',
          this.vehicle.id,
          new Blob([buffer], { type: mimeType }),
        ),
      );
      if (uploadRes?.data) {
        this.updateVehiclePhoto(uploadRes.data);
      }
    } catch (err) {
      console.error('Error uploading vehicle photo:', err);
      this.toastService.showError('Error', 'No se pudo subir la foto');
    }
  }

  onCameraClose(): void {
    this.showCamera = false;
  }

  removePhoto(): void {
    if (this.vehicle) this.updateVehiclePhoto('');
  }

  private updateVehiclePhoto(photoUrl: string): void {
    if (!this.vehicle) return;

    const toSave: ModelVehicle = { ...this.vehicle, photo: photoUrl };
    delete (toSave as any).vehicleBrandName;
    delete (toSave as any).currentDriverName;
    delete (toSave as any).lastTripStatus;

    this.vehicleService.createVehicle(toSave).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Gestión de Vehículos',
          'Foto actualizada exitosamente!',
        );
        if (this.vehicle) {
          this.vehicle.photo = photoUrl
            ? `${photoUrl.split('?')[0]}?t=${Date.now()}`
            : '';
        }
      },
      error: (err) => {
        console.error('Error updating vehicle photo:', err);
        this.toastService.showError('Error', 'No se pudo actualizar la foto');
      },
    });
  }

  // --- Venta ---

  openSellConfirm(): void {
    this.isMenuOpen = false;
    this.showSellConfirm = true;
  }

  cancelSell(): void {
    this.showSellConfirm = false;
  }

  confirmSell(): void {
    if (!this.vehicle?.id) return;

    this.isSelling = true;
    this.vehicleService.sellVehicle(this.vehicle.id).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Venta de Vehículo',
          'Vehículo vendido exitosamente!',
        );
        if (this.vehicle) this.vehicle.status = 'Vendido';
        this.showSellConfirm = false;
        this.isSelling = false;
      },
      error: (err) => {
        console.error('Error selling vehicle:', err);
        this.toastService.showError(
          'Error',
          err?.error?.message || 'No se pudo procesar la venta del vehículo',
        );
        this.isSelling = false;
      },
    });
  }

  trackByDocument(_index: number, row: DocumentRow): number {
    return row.document.id ?? _index;
  }
}
