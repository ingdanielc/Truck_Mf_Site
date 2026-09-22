import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, of, catchError, firstValueFrom } from 'rxjs';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import { CommonService } from 'src/app/services/common.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { DriverService } from 'src/app/services/driver.service';
import { TripService } from 'src/app/services/trip.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { GVehicleMiniCardComponent } from 'src/app/components/g-vehicle-mini-card/g-vehicle-mini-card.component';
import { Formatters } from '../../../utils/formatters';
import { SubscriptionUtils } from '../../../utils/subscription';
import { GPasswordCardComponent } from 'src/app/components/g-password-card/g-password-card.component';
import { GOwnerFormComponent } from 'src/app/components/g-owner-form/g-owner-form.component';
import { excludeCancelledFilter } from 'src/app/utils/trip-status';
import { switchMap } from 'rxjs/operators';
import {
  DocumentRow,
  GVehicleDocumentsComponent,
} from 'src/app/components/g-vehicle-documents/g-vehicle-documents.component';
import { GDocumentViewerComponent } from 'src/app/components/g-document-viewer/g-document-viewer.component';
import { ModelDocumentFile } from 'src/app/models/document-model';
import { ModelDriver } from 'src/app/models/driver-model';
import {
  getDocumentTypeName,
  getDocumentValidity,
} from 'src/app/utils/document-utils';
import { shareDocumentFiles } from 'src/app/utils/document-share';
import {
  findLinkedDriver,
  loadHolderDocuments,
} from 'src/app/utils/holder-documents';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-owner-detail',
  standalone: true,
  imports: [
    CommonModule,
    GVehicleMiniCardComponent,
    GCameraComponent,
    GPasswordCardComponent,
    GOwnerFormComponent,
    GVehicleDocumentsComponent,
    GDocumentViewerComponent,
  ],
  templateUrl: './owner-detail.component.html',
  styleUrls: ['./owner-detail.component.scss'],
})
export class OwnerDetailComponent implements OnInit, OnDestroy {
  @ViewChild(GPasswordCardComponent) passwordCard?: GPasswordCardComponent;
  ownerId: number | null = null;
  owner: ModelOwner | null = null;
  vehicles: ModelVehicle[] = [];

  cities: any[] = [];
  brands: any[] = [];
  loading: boolean = true;
  loadingVehicles: boolean = true;

  loadingCities: boolean = true;
  loadingBrands: boolean = true;
  tripCount: number = 0;
  fromSource: string | null = null;
  /** Ficha de vehículo desde la que se llegó, si se llegó desde una. */
  fromVehicleId: string | null = null;
  fromTrips: boolean = false; // Kept for backward compatibility if needed elsewhere but updated logic
  showCamera: boolean = false;
  isAdmin: boolean = false;
  isConductor: boolean = false;
  userRole: string = '';
  /**
   * La licencia ya vencio: pinta su fecha en rojo.
   *
   * Antes se comparaba `licenseExpiry < now` en la plantilla, pero la API
   * manda la fecha como texto y `now` era un `Date`: esa comparacion en
   * JavaScript da siempre `false`, asi que el rojo no salia nunca. Se usa la
   * misma regla que la suscripcion: solo el dia, en hora de Bogota, y el
   * propio dia del vencimiento todavia cuenta como vigente.
   */
  get isLicenseExpired(): boolean {
    return SubscriptionUtils.isExpired(this.owner?.licenseExpiry);
  }

  // Offcanvas variables
  isOffcanvasOpen: boolean = false;
  isPasswordOffcanvasOpen: boolean = false;
  isSavingPassword: boolean = false;
  isMenuOpen: boolean = false;

  // Documentos
  documentRows: DocumentRow[] = [];
  isDocumentsOpen: boolean = false;
  /** Ya se sabe si también conduce: el panel puede pedir los documentos. */
  documentsReady: boolean = false;
  /** Su registro de conductor, si también conduce. */
  linkedDriver: ModelDriver | null = null;
  /** Descarga de los archivos previa a compartirlos por WhatsApp. */
  sharingDocuments: boolean = false;
  /** Documento abierto en el visor; null cuando no hay ninguno. */
  viewerUrl: string | null = null;
  viewerName: string = '';

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly tripService: TripService,
    private readonly toastService: ToastService,
    private readonly commonService: CommonService,
    private readonly securityService: SecurityService,
    private readonly location: Location,
  ) {}

  ngOnInit(): void {
    this.fromSource = this.route.snapshot.queryParamMap.get('from');
    this.fromVehicleId = this.route.snapshot.queryParamMap.get('vehicleId');
    this.fromTrips = this.fromSource === 'trips';

    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.ownerId = Number(id);
        this.owner = null; // Reset to avoid showing previous/incorrect data
        this.loadBrands();
        this.loadCities();
        // Wait for user data to be available before validating access
        this.securityService.userData$.subscribe({
          next: (user) => {
            if (user && this.ownerId) {
              this.validateAccess(this.ownerId, user);
            }
          },
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadOwner(id: number): void {
    this.loading = true;
    const filter = new ModelFilterTable(
      [new Filter('id', '=', id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.owner = response.data.content[0];
          if (this.owner?.photo) {
            this.owner.photo = `${this.owner.photo.split('?')[0]}?t=${Date.now()}`;
          }
          this.resolveCityName();
          this.loadDocuments();
        } else {
          this.denyAccess('Error', 'No se encontró el propietario');
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading owner:', err);
        this.loading = false;
        this.denyAccess('Error', 'Error al cargar el propietario');
      },
    });
  }

  /**
   * Fecha fin de suscripcion normalizada a YYYY-MM-DD. Se pinta con el pipe
   * date en 'UTC' para que no se corra un dia contra la zona del navegador.
   */
  get subscriptionEndDateOnly(): string | null {
    return SubscriptionUtils.toDateOnly(this.owner?.subscriptionEndDate);
  }

  /** true cuando la fecha ya paso: el propietario y sus conductores no entran. */
  get isSubscriptionExpired(): boolean {
    return SubscriptionUtils.isExpired(this.owner?.subscriptionEndDate);
  }

  /** true cuando vence dentro de los proximos 30 dias y aun no ha vencido. */
  get isSubscriptionExpiringSoon(): boolean {
    return SubscriptionUtils.isExpiringSoon(this.owner?.subscriptionEndDate);
  }

  get subscriptionLabel(): string {
    return SubscriptionUtils.label(this.owner?.subscriptionEndDate);
  }

  /**
   * El propietario está mirando su propio perfil.
   *
   * A esta pantalla llegan tres roles y solo uno paga la suscripción. Al
   * propietario `validateAccess` ya le impide abrir un perfil ajeno, así que
   * no ser administrador ni conductor equivale a estar en el suyo.
   */
  get isOwnerSelf(): boolean {
    return !this.isAdmin && !this.isConductor;
  }

  /** Su plan, con el vencimiento y la renovación. */
  goToSubscription(): void {
    this.router.navigate(['/site/subscription']);
  }

  validateAccess(ownerId: number, user: any): void {
    const roleName = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
    this.userRole = roleName;
    this.isAdmin = roleName === 'ADMINISTRADOR';
    this.isConductor = roleName === 'CONDUCTOR';

    if (this.isAdmin) {
      this.loadAllData(ownerId);
      return;
    }

    if (roleName === 'PROPIETARIO') {
      const ownerFilter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );

      this.ownerService
        .getOwnerFilter(ownerFilter)
        .pipe(
          catchError((err) => {
            console.error('Error validating owner access:', err);
            return of(null);
          }),
        )
        .subscribe((response: any) => {
          const loggedInOwner = response?.data?.content?.[0];
          if (loggedInOwner?.id === ownerId) {
            this.loadAllData(ownerId);
          } else {
            // A su propio perfil, no atrás: si escribió la URL, atrás puede
            // quedar fuera de la app.
            this.denyAccess(
              'Acceso Denegado',
              'No tiene permiso para ver este perfil',
              loggedInOwner?.id ? ['/site/owners', loggedInOwner.id] : null,
            );
          }
        });
      return;
    }

    if (roleName === 'CONDUCTOR') {
      this.loadDriverVehicleData(ownerId, user.id);
      return;
    }

    // Otros roles
    this.denyAccess(
      'Acceso Denegado',
      'No tiene permiso para ver esta información',
    );
  }

  loadDriverVehicleData(ownerId: number, userId: number): void {
    // 1. Get Driver Info to get driver ID
    const driverFilter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.driverService.getDriverFilter(driverFilter).subscribe({
      next: (response: any) => {
        const driver = response?.data?.content?.[0];
        if (driver) {
          // Security check: ensure the driver belongs to the owner in the URL
          if (driver.ownerId !== ownerId) {
            this.denyAccess(
              'Acceso Denegado',
              'No tiene permiso para ver este perfil de propietario',
              driver.id ? ['/site/drivers', driver.id] : null,
            );
            return;
          }

          // AUTHORIZED: Now we can load the owner and vehicle data
          this.loadOwner(ownerId);

          // 2. Get the specific vehicle assigned to this driver
          const vehicleFilter = new ModelFilterTable(
            [new Filter('currentDriverId', '=', driver.id.toString())],
            new Pagination(1, 0),
            new Sort('id', true),
          );

          this.vehicleService.getVehicleFilter(vehicleFilter).subscribe({
            next: (vResponse: any) => {
              this.vehicles = vResponse?.data?.content ?? [];
              this.vehicles.forEach((v: any) => {
                v.lastTripStatus = v.occupied ? 'En Curso' : 'Disponible';
                if (v.driver?.name) {
                  v.currentDriverName = v.driver.name;
                }
              });
              this.mapBrandNames();
              this.loadingVehicles = false;

              if (this.vehicles.length > 0) {
                // 3. Load trips ONLY for this vehicle
                this.loadTripCountForVehicle(this.vehicles[0].id!);
              } else {
                this.tripCount = 0;
              }
            },
            error: () => {
              this.loadingVehicles = false;
              this.tripCount = 0;
            },
          });
        } else {
          // Sin conductor no hay forma de validar el acceso: antes la pantalla
          // se quedaba cargando para siempre detrás del aviso.
          this.loadingVehicles = false;
          this.denyAccess('Error', 'No se encontró información del conductor');
        }
      },
      error: () => {
        this.loadingVehicles = false;
        this.denyAccess('Error', 'No se pudo validar el acceso a este perfil');
      },
    });
  }

  loadTripCountForVehicle(vehicleId: number): void {
    const filter = new ModelFilterTable(
      [
        new Filter('vehicle.id', '=', vehicleId.toString()),
        excludeCancelledFilter(),
      ],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.tripCount = response?.data?.totalElements ?? 0;
      },
      error: (err) => console.error('Error loading trip count:', err),
    });
  }

  loadAllData(ownerId: number): void {
    this.loadOwner(ownerId);
    this.loadVehicles(ownerId);
    this.loadTripCount(ownerId);
  }

  loadVehicles(ownerId: number): void {
    this.loadingVehicles = true;
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(50, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        this.vehicles.forEach((v: any) => {
          v.lastTripStatus = v.occupied ? 'En Curso' : 'Disponible';
          if (v.driver?.name) {
            v.currentDriverName = v.driver.name;
          }
        });
        this.mapBrandNames();
        this.loadingVehicles = false;
      },
      error: (err) => {
        console.error('Error loading vehicles:', err);
        this.loadingVehicles = false;
      },
    });
  }

  loadTripCount(ownerId: number): void {
    const filter = new ModelFilterTable(
      [
        new Filter('vehicle.owners.owner.id', '=', ownerId.toString()),
        excludeCancelledFilter(),
      ],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.tripCount = response?.data?.totalElements ?? 0;
      },
      error: (err) => {
        console.error('Error loading trip count:', err);
      },
    });
  }

  loadCities(): void {
    this.loadingCities = true;
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        this.cities = response?.data ?? [];
        this.loadingCities = false;
        this.resolveCityName();
      },
      error: (err) => {
        console.error('Error loading cities:', err);
        this.loadingCities = false;
      },
    });
  }

  resolveCityName(): void {
    if (this.owner?.cityId && this.cities.length > 0) {
      const city = this.cities.find((c) => c.id === this.owner?.cityId);
      if (city) {
        this.owner.cityName = city.state
          ? `${city.name}, ${city.state}`
          : city.name;
      }
    }
  }

  loadBrands(): void {
    this.loadingBrands = true;
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        this.brands = response?.data ?? [];
        this.loadingBrands = false;
        this.mapBrandNames();
      },
      error: (err) => {
        console.error('Error loading brands:', err);
        this.loadingBrands = false;
      },
    });
  }

  mapBrandNames(): void {
    if (this.brands.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        if (!v.vehicleBrandName) {
          const brand = this.brands.find(
            (b) => String(b.id) === String(v.vehicleBrandId),
          );
          if (brand) v.vehicleBrandName = brand.name;
        }
      });
    }
  }

  /** Los vendidos no ocupan cupo del plan: se excluyen del conteo */
  get activeVehicles(): ModelVehicle[] {
    return this.vehicles.filter((v) => v.status !== 'Vendido');
  }

  get stats() {
    return {
      total: this.activeVehicles.length,
      trips: this.tripCount,
      maintenance: this.vehicles.filter((v) => v.status === 'Maintenance')
        .length,
    };
  }
  get statusClass(): string {
    return this.owner?.user?.status === 'Activo'
      ? 'bg-success'
      : 'bg-secondary';
  }

  /**
   * Sale de un perfil que no se puede ver y avisa cuando la navegación ya
   * terminó.
   *
   * No usa `goBack`: para quien no es administrador ese vuelve con
   * `location.back()`, y si la URL se escribió a mano atrás queda fuera de la
   * app —o no hay a dónde ir— y el aviso se perdía. Aquí se va siempre a una
   * pantalla de la app: la que se indique o, si no, el listado para el
   * administrador y el inicio para el resto.
   */
  private denyAccess(
    title: string,
    message: string,
    target: (string | number)[] | null = null,
  ): void {
    const avisar = () => this.toastService.showError(title, message);
    const destino =
      target ?? (this.isAdmin ? ['/site/owners'] : ['/site/home']);
    this.router.navigate(destino).then(avisar, avisar);
  }

  goBack(): void {
    // Desde la ficha de un vehículo se vuelve a esa ficha, no al listado.
    if (this.fromSource === 'vehicle-detail' && this.fromVehicleId) {
      this.router.navigate(['/site/vehicles', this.fromVehicleId]);
      return;
    }

    const user = this.securityService.getUserData();
    const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    if (role === 'ADMINISTRADOR') {
      switch (this.fromSource) {
        /* Desde un reporte del tablero (Suscripciones): se vuelve a esa
           pestaña y no a la de por omisión. */
        case 'dashboard': {
          const tab = this.route.snapshot.queryParamMap.get('tab');
          this.router.navigate(
            ['/site/dashboard'],
            tab ? { queryParams: { tab } } : {},
          );
          break;
        }
        case 'trips':
          this.router.navigate(['/site/trips']);
          break;
        case 'vehicles':
          this.router.navigate(['/site/vehicles']);
          break;
        case 'drivers':
          this.router.navigate(['/site/drivers']);
          break;
        default:
          this.router.navigate(['/site/owners']);
          break;
      }
    } else {
      this.location.back();
    }
  }

  manageFleet(): void {
    this.router.navigate(['/site/vehicles'], {
      queryParams: { ownerId: this.ownerId },
    });
  }

  viewOwnerTrips(): void {
    this.router.navigate(['/site/trips'], {
      queryParams: { ownerId: this.ownerId },
    });
  }

  formatDocNumber(value: any): string {
    return Formatters.formatDocNumber(value);
  }

  formatPhone(phone: string | undefined): string {
    return Formatters.formatPhone(phone);
  }

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.owner?.id) return;

    try {
      const processed = await CustomValidators.readPhotoFile(event);
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto('owner', this.owner.id, processed.blob),
      );
      if (uploadRes?.data) {
        this.updateOwnerPhoto(uploadRes.data);
      }
    } catch (err) {
      this.toastService.showError('Error', 'No se pudo subir la foto');
      console.error(err);
    }
  }

  removePhoto(): void {
    if (this.owner) {
      this.updateOwnerPhoto('');
    }
  }

  private updateOwnerPhoto(photoUrl: string): void {
    if (!this.owner) return;

    const ownerToUpdate: ModelOwner = {
      ...this.owner,
      photo: photoUrl,
    };

    // Remove calculated/computed properties that shouldn't be sent back as is or cause issues
    delete (ownerToUpdate as any).age;
    delete (ownerToUpdate as any).cityName;

    this.ownerService.createOwner(ownerToUpdate).subscribe({
      next: (response: any) => {
        this.toastService.showSuccess(
          'Perfil',
          'Foto actualizada exitosamente!',
        );
        this.owner!.photo = `${photoUrl.split('?')[0]}?t=${Date.now()}`;
      },
      error: (err) => {
        console.error('Error updating owner photo:', err);
        this.toastService.showError(
          'Error',
          'No se pudo actualizar la foto de perfil',
        );
      },
    });
  }

  async onCameraCapture(dataUrl: string): Promise<void> {
    if (!this.owner?.id) return;

    const byteString = atob(dataUrl.split(',')[1]);
    const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.codePointAt(i) ?? 0;
    }
    const file = new Blob([ab], { type: mimeType });

    try {
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto('owner', this.owner.id, file),
      );
      if (uploadRes?.data) {
        this.updateOwnerPhoto(uploadRes.data);
      }
    } catch (err) {
      this.toastService.showError('Error', 'No se pudo subir la foto');
      console.error(err);
    }

    this.showCamera = false;
  }

  onCameraClose(): void {
    this.showCamera = false;
  }

  // --- Documentos ---

  /**
   * Los gestiona el administrador y el propio propietario: para él esta ficha
   * es el único punto de carga de sus documentos, también de los que tiene
   * como conductor.
   */
  get canManageDocuments(): boolean {
    return this.isAdmin || this.isOwnerSelf;
  }

  /**
   * Sus documentos y, si también conduce, los de su registro de conductor:
   * cargados desde cualquiera de las dos fichas se ven en las dos. Un
   * conductor no ve esta sección, son papeles personales del propietario.
   */
  private loadDocuments(): void {
    const owner = this.owner;
    if (!owner?.id || this.isConductor) return;

    this.documentsReady = false;
    findLinkedDriver(this.driverService, owner)
      .pipe(
        switchMap((driver) => {
          this.linkedDriver = driver;
          return loadHolderDocuments(this.commonService, {
            ownerId: owner.id,
            driverId: driver?.id,
          });
        }),
      )
      .subscribe({
        next: (documents) => {
          this.setDocuments(documents);
          this.documentsReady = true;
        },
        error: (err) => {
          console.error('Error loading owner documents:', err);
          this.documentRows = [];
          this.documentsReady = true;
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

  openDocuments(): void {
    this.isMenuOpen = false;
    if (!this.canManageDocuments) return;
    this.isDocumentsOpen = true;
  }

  closeDocuments(): void {
    this.isDocumentsOpen = false;
  }

  /** Comparte los documentos por WhatsApp; ver `shareDocumentFiles`. */
  async shareDocumentsByWhatsApp(): Promise<void> {
    if (this.sharingDocuments) return;

    const header = [
      `*Documentos ${this.owner?.name ?? ''}*`,
      this.formatDocNumber(this.owner?.documentNumber),
    ];

    await shareDocumentFiles(
      this.documentRows,
      header,
      this.owner?.name,
      (preparing) => (this.sharingDocuments = preparing),
    );
  }

  /**
   * El documento se muestra en el visor de la app. Abrirlo con `window.open`
   * dejaba al usuario fuera y sin retorno cuando la PWA corre instalada.
   */
  openDocumentFile(row: DocumentRow, event: Event): void {
    event.stopPropagation();
    if (!row.document.fileUrl) return;
    this.viewerUrl = row.document.fileUrl;
    this.viewerName = row.name;
  }

  closeViewer(): void {
    this.viewerUrl = null;
    this.viewerName = '';
  }

  trackByDocument(index: number, row: DocumentRow): number {
    return row.document.id ?? index;
  }

  // --- Offcanvas Methods ---

  toggleOffcanvas(): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    this.isMenuOpen = false;
  }

  closeOffcanvas(): void {
    this.isOffcanvasOpen = false;
    this.isMenuOpen = false;
  }

  onOwnerSaved(): void {
    this.closeOffcanvas();
    if (this.ownerId) {
      this.loadOwner(this.ownerId);
    }
  }

  togglePasswordOffcanvas(): void {
    if (!this.isPasswordOffcanvasOpen) {
      this.passwordCard?.reset();
    }
    this.isPasswordOffcanvasOpen = !this.isPasswordOffcanvasOpen;
    this.isMenuOpen = false;
  }

  toggleMenu(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.isMenuOpen = !this.isMenuOpen;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.owner?.user?.id) {
      this.toastService.showError(
        'Error',
        'No se encontró el usuario asociado al propietario',
      );
      return;
    }

    try {
      const hashedNewPassword = await this.securityService.getHashSHA512(
        passwords.newPassword,
      );

      this.securityService
        .getUserFilter(
          new ModelFilterTable(
            [new Filter('id', '=', this.owner.user.id.toString())],
            new Pagination(1, 0),
            new Sort('id', true),
          ),
        )
        .subscribe({
          next: (response: any) => {
            if (response?.data?.content?.[0]) {
              const fullUser = response.data.content[0];
              fullUser.password = hashedNewPassword;

              this.isSavingPassword = true;
              this.securityService.createUser(fullUser).subscribe({
                next: () => {
                  this.toastService.showSuccess(
                    'Seguridad',
                    'Contraseña actualizada exitosamente!',
                  );
                  this.togglePasswordOffcanvas();
                  this.isSavingPassword = false;
                },
                error: (err: any) => {
                  console.error('Error updating password:', err);
                  this.toastService.showError(
                    'Error',
                    'No se pudo actualizar la contraseña',
                  );
                  this.isSavingPassword = false;
                },
              });
            }
          },
          error: (err: any) => {
            console.error('Error fetching user for password update:', err);
          },
        });
    } catch (error) {
      console.error('Error in onUpdatePassword:', error);
    }
  }

  onToggleStatus(): void {
    if (!this.owner?.user) {
      this.toastService.showError(
        'Error',
        'No hay un usuario asociado a este propietario',
      );
      return;
    }

    const newStatus =
      this.owner.user.status === 'Activo' ? 'Inactivo' : 'Activo';

    const userToSave = {
      ...this.owner.user,
      status: newStatus,
    };

    this.isMenuOpen = false;

    this.securityService.createUser(userToSave as any).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Seguridad',
          `Usuario ${newStatus === 'Activo' ? 'activado' : 'desactivado'} exitosamente!`,
        );
        if (this.owner) {
          if (this.owner.user) this.owner.user.status = newStatus;
          this.owner.status = newStatus;
        }
      },
      error: (err) => {
        console.error('Error toggling user status:', err);
        this.toastService.showError(
          'Error',
          'No se pudo cambiar el estado del usuario.',
        );
      },
    });
  }
}
