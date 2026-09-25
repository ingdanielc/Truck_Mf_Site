import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { DriverService } from 'src/app/services/driver.service';
import { TripService } from 'src/app/services/trip.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelDriver } from 'src/app/models/driver-model';
import { ModelOwner } from 'src/app/models/owner-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { GVehicleMiniCardComponent } from 'src/app/components/g-vehicle-mini-card/g-vehicle-mini-card.component';
import { Formatters } from '../../../utils/formatters';
import { phoneDigits } from 'src/app/utils/clipboard';
import { GCopyButtonComponent } from 'src/app/components/g-copy-button/g-copy-button.component';
import { SubscriptionUtils } from '../../../utils/subscription';
import { GDriverFormComponent } from 'src/app/components/g-driver-form/g-driver-form.component';
import { GPasswordCardComponent } from 'src/app/components/g-password-card/g-password-card.component';
import {
  DocumentRow,
  GVehicleDocumentsComponent,
} from 'src/app/components/g-vehicle-documents/g-vehicle-documents.component';
import { GDocumentViewerComponent } from 'src/app/components/g-document-viewer/g-document-viewer.component';
import { ModelDocumentFile } from 'src/app/models/document-model';
import {
  getDocumentTypeName,
  getDocumentValidity,
} from 'src/app/utils/document-utils';
import { shareDocumentFiles } from 'src/app/utils/document-share';
import {
  findLinkedOwner,
  loadHolderDocuments,
} from 'src/app/utils/holder-documents';
import { filter as rxFilter, map, switchMap, take } from 'rxjs/operators';
import { excludeCancelledFilter } from 'src/app/utils/trip-status';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

@Component({
  selector: 'app-driver-detail',
  standalone: true,
  imports: [
    CommonModule,
    GVehicleMiniCardComponent,
    GCameraComponent,
    GDriverFormComponent,
    GPasswordCardComponent,
    GVehicleDocumentsComponent,
    GDocumentViewerComponent,
    GCopyButtonComponent,
  ],
  templateUrl: './driver-detail.component.html',
  styleUrls: ['./driver-detail.component.scss'],
})
export class DriverDetailComponent implements OnInit, OnDestroy {
  @ViewChild(GPasswordCardComponent) passwordCard?: GPasswordCardComponent;
  driverId: number | null = null;
  /** Origen de la navegación y ficha de vehículo de la que se viene, si aplica. */
  fromSource: string | null = null;
  fromVehicleId: string | null = null;
  driver: ModelDriver | null = null;
  vehicles: ModelVehicle[] = [];
  cities: any[] = [];
  brands: any[] = [];
  loading: boolean = true;
  loadingVehicles: boolean = true;
  loadingCities: boolean = true;
  loadingBrands: boolean = true;
  tripCount: number = 0;
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
    return SubscriptionUtils.isExpired(this.driver?.licenseExpiry);
  }
  showCamera: boolean = false;
  photoPreview: string = '';

  // Context menu
  isMenuOpen: boolean = false;
  userRole: string = '';
  /** Usuario de la sesión: dice si el conductor está en su propio perfil. */
  private loggedUserId: number | null = null;
  private userSub?: Subscription;

  // Offcanvas states
  isEditOffcanvasOpen: boolean = false;
  isPasswordOffcanvasOpen: boolean = false;
  isSavingPassword: boolean = false;
  loggedInOwner: ModelOwner | null = null;

  // Documentos
  /** Ya se sabe si también es propietario: el panel puede pedir los documentos. */
  documentsReady: boolean = false;
  /** Su registro de propietario, si también lo es. */
  linkedOwner: ModelOwner | null = null;
  documentRows: DocumentRow[] = [];
  isDocumentsOpen: boolean = false;
  /** Descarga de los archivos previa a compartirlos por WhatsApp. */
  sharingDocuments: boolean = false;
  /** Documento abierto en el visor; null cuando no hay ninguno. */
  viewerUrl: string | null = null;
  viewerName: string = '';

  // Reference data for g-driver-form
  documentTypes: any[] = [];
  genders: any[] = [];
  salaryTypes: any[] = [];
  owners: any[] = [];

  private routeSub?: Subscription;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly driverService: DriverService,
    private readonly tripService: TripService,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
  ) {}

  ngOnInit(): void {
    this.fromSource = this.route.snapshot.queryParamMap.get('from');
    this.fromVehicleId = this.route.snapshot.queryParamMap.get('vehicleId');
    this.userSub = this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '')
            .toUpperCase()
            .trim();
          this.loggedUserId = user.id ?? null;
          if (this.userRole === 'PROPIETARIO' && user.id) {
            this.loadLoggedInOwner(user.id);
          }
        }
      },
    });
    this.routeSub = this.route.paramMap.subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.driverId = Number(id);
        this.loadCities();
        this.loadBrands();
        // Vehículos, viajes y documentos se piden cuando `loadDriver` ya
        // comprobó que este perfil se puede ver.
        this.loadDriver(this.driverId);
        this.loadReferenceData();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.userSub?.unsubscribe();
  }

  loadDriver(id: number): void {
    this.loading = true;
    const filter = new ModelFilterTable(
      [new Filter('id', '=', id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        const found: ModelDriver | undefined = response?.data?.content?.[0];
        if (!found) {
          this.loading = false;
          this.denyAccess('No se encontró el conductor');
          return;
        }

        // Nada del perfil se asigna ni se pide antes de saber que se puede ver.
        this.authorize(found).subscribe((allowed) => {
          if (!allowed) {
            this.loading = false;
            this.denyAccess('No tiene permiso para ver este perfil');
            return;
          }

          this.driver = found;
          this.photoPreview = found.photo
            ? `${found.photo.split('?')[0]}?t=${Date.now()}`
            : '';
          this.resolveCityName();
          this.loadDocuments();
          this.loadVehicles(id);
          this.loadTripCount(id);
          this.loading = false;
        });
      },
      error: (err) => {
        console.error('Error loading driver:', err);
        this.loading = false;
        this.denyAccess('Error al cargar el conductor');
      },
    });
  }

  /**
   * ¿Puede el usuario de la sesión ver este conductor?
   *
   * El conductor solo ve su propio perfil: cambiar el id en la URL no puede
   * abrir el de otro. Al administrador no se le restringe, y al propietario
   * el backend ya le acota los conductores a los suyos.
   *
   * Espera al usuario de la sesión: el conductor puede llegar antes que él.
   */
  private authorize(driver: ModelDriver): Observable<boolean> {
    return this.securityService.userData$.pipe(
      rxFilter((user: any) => !!user),
      take(1),
      map((user: any) => {
        const role = (user.userRoles?.[0]?.role?.name || '')
          .toUpperCase()
          .trim();
        if (role !== 'CONDUCTOR') return true;
        return !!user.id && driver.user?.id === user.id;
      }),
    );
  }

  /**
   * Sale de un perfil que no se puede ver, con el motivo.
   *
   * El conductor vuelve a su propio perfil; el resto, a donde venía. El aviso
   * se muestra cuando la navegación ya terminó: lanzado antes, el cambio de
   * pantalla a veces lo tapaba.
   */
  private denyAccess(message: string): void {
    const avisar = () =>
      this.toastService.showError('Acceso denegado', message);

    this.securityService.userData$
      .pipe(
        rxFilter((user: any) => !!user),
        take(1),
      )
      .subscribe((user: any) => {
        const role = (user.userRoles?.[0]?.role?.name || '')
          .toUpperCase()
          .trim();
        if (role !== 'CONDUCTOR') {
          this.goBack().then(avisar);
          return;
        }
        this.goToOwnDriverProfile(user.id).then(avisar);
      });
  }

  /**
   * Lleva al conductor de la sesión a su propio perfil. Si no lo encuentra, o
   * si justo el suyo es el que falla, al inicio: si no, volvería a entrar aquí
   * una y otra vez.
   */
  private goToOwnDriverProfile(userId: number | undefined): Promise<boolean> {
    if (!userId) return this.router.navigate(['/site/home']);

    return firstValueFrom(
      this.driverService.getDriverFilter(
        new ModelFilterTable(
          [new Filter('user.id', '=', userId.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
    )
      .then((response: any) => {
        const own: ModelDriver | undefined = response?.data?.content?.[0];
        if (own?.id && own.user?.id === userId && own.id !== this.driverId) {
          return this.router.navigate(['/site/drivers', own.id]);
        }
        return this.router.navigate(['/site/home']);
      })
      .catch(() => this.router.navigate(['/site/home']));
  }

  loadReferenceData(): void {
    if (this.userRole === 'ADMINISTRADOR') this.loadOwners();
    this.commonService.getListTypeDocument().subscribe({
      next: (response: any) => {
        if (response?.data) this.documentTypes = response.data;
      },
    });
    this.commonService.getGenders().subscribe({
      next: (response: any) => {
        if (response?.data) this.genders = response.data;
      },
    });
    this.commonService.getSalaryTypes().subscribe({
      next: (response: any) => {
        if (response?.data) this.salaryTypes = response.data;
      },
    });
  }

  loadOwners(): void {
    const filter = new ModelFilterTable(
      [],
      new Pagination(500, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
        }
      },
      error: (err: any) => console.error('Error loading owners:', err),
    });
  }

  loadVehicles(driverId: number): void {
    this.loadingVehicles = true;
    const filter = new ModelFilterTable(
      [new Filter('currentDriverId', '=', driverId.toString())],
      new Pagination(50, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleFilter(filter).subscribe({
      next: (response: any) => {
        this.vehicles = response?.data?.content ?? [];
        this.vehicles.forEach((v) => {
          v.lastTripStatus = v.occupied ? 'En Curso' : 'Disponible';
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

  loadTripCount(driverId: number): void {
    const filter = new ModelFilterTable(
      [
        new Filter('driver.id', '=', driverId.toString()),
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
    if (this.driver?.cityId && this.cities.length > 0) {
      const city = this.cities.find((c) => c.id === this.driver?.cityId);
      if (city) {
        this.driver.cityName = city.state
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

  get stats() {
    return {
      trips: this.tripCount,
      vehicles: this.vehicles.length,
    };
  }

  get isActive(): boolean {
    return !this.driver?.user || this.driver.user.status === 'Activo';
  }

  get canEdit(): boolean {
    if (this.userRole !== 'PROPIETARIO') return true;
    if (!this.driver || !this.loggedInOwner) return false;

    // 1. Try comparing by user ID (most reliable)
    if (this.driver.user?.id && this.loggedInOwner.user?.id) {
      if (this.driver.user.id === this.loggedInOwner.user.id) return false;
    }

    // 2. Fallback to document number comparison (normalized)
    const driverDoc = String(this.driver.documentNumber || '').replaceAll(
      /\D/g,
      '',
    );
    const ownerDoc = String(this.loggedInOwner.documentNumber || '').replaceAll(
      /\D/g,
      '',
    );

    if (driverDoc && ownerDoc) {
      if (driverDoc === ownerDoc) return false;
    }

    return true;
  }

  /** Devuelve la navegación, para avisar cuando ya terminó. */
  goBack(): Promise<boolean> {
    // Desde la ficha de un vehículo se vuelve a esa ficha, no al listado.
    if (this.fromSource === 'vehicle-detail' && this.fromVehicleId) {
      return this.router.navigate(['/site/vehicles', this.fromVehicleId]);
    }
    return this.router.navigate(['/site/drivers']);
  }

  viewDriverVehicles(): void {
    this.router.navigate(['/site/vehicles'], {
      queryParams: { driverId: this.driverId },
    });
  }

  viewDriverTrips(): void {
    this.router.navigate(['/site/trips'], {
      queryParams: { driverId: this.driverId },
    });
  }

  formatDocNumber(value: any): string {
    return Formatters.formatDocNumber(value);
  }

  formatPhone(phone: string | undefined): string {
    return Formatters.formatPhone(phone);
  }

  /** El celular como se pega: sin los espacios con que se muestra. */
  phoneToCopy(phone: string | undefined): string {
    return phoneDigits(phone);
  }

  // ─── Context Menu ────────────────────────────────────────────────────────────

  toggleMenu(event?: Event): void {
    event?.stopPropagation();
    this.isMenuOpen = !this.isMenuOpen;
  }

  loadLoggedInOwner(userId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (resp: any) => {
        if (resp?.data?.content?.[0]) {
          this.loggedInOwner = resp.data.content[0];
        }
      },
      error: (err: any) => console.error('Error loading logged in owner:', err),
    });
  }

  // ─── Edit Offcanvas ──────────────────────────────────────────────────────────

  openEditOffcanvas(): void {
    this.isMenuOpen = false;
    this.isEditOffcanvasOpen = true;
  }

  closeEditOffcanvas(): void {
    this.isEditOffcanvasOpen = false;
  }

  onDriverSaved(): void {
    this.isEditOffcanvasOpen = false;
    if (this.driverId) this.loadDriver(this.driverId);
  }

  // ─── Password Offcanvas ──────────────────────────────────────────────────────

  openPasswordOffcanvas(): void {
    this.isMenuOpen = false;
    this.passwordCard?.reset();
    this.isPasswordOffcanvasOpen = true;
  }

  closePasswordOffcanvas(): void {
    this.isPasswordOffcanvasOpen = false;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.driver?.user?.id) {
      this.toastService.showError(
        'Error',
        'No se encontró el usuario asociado al conductor',
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
            [new Filter('id', '=', this.driver.user.id.toString())],
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
                  this.closePasswordOffcanvas();
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
            console.error('Error fetching user:', err);
            this.toastService.showError(
              'Error',
              'No se pudo obtener la información del usuario',
            );
          },
        });
    } catch (error) {
      console.error('Error in onUpdatePassword:', error);
    }
  }

  // ─── Toggle Status ───────────────────────────────────────────────────────────

  onToggleStatus(): void {
    if (!this.driver?.user) {
      this.toastService.showError(
        'Error',
        'No hay un usuario asociado a este conductor',
      );
      return;
    }

    const newStatus =
      this.driver.user.status === 'Activo' ? 'Inactivo' : 'Activo';
    const userToSave = { ...this.driver.user, status: newStatus };

    this.isMenuOpen = false;

    this.securityService.createUser(userToSave as any).subscribe({
      next: () => {
        this.driver!.user!.status = newStatus;
        this.toastService.showSuccess(
          'Conductor',
          `Conductor ${newStatus === 'Activo' ? 'activado' : 'desactivado'} exitosamente!`,
        );
      },
      error: (err: any) => {
        console.error('Error toggling status:', err);
        this.toastService.showError(
          'Error',
          'No se pudo cambiar el estado del conductor',
        );
      },
    });
  }

  // ─── Documentos ──────────────────────────────────────────────────────────────

  /**
   * Quién gestiona los documentos del conductor:
   * - el administrador, siempre;
   * - el propietario, los de sus conductores. En su propio registro de
   *   conductor no: sus documentos se cargan solo desde su ficha de
   *   propietario;
   * - el conductor, los suyos, desde su perfil —que es esta ficha—. Los de
   *   otro conductor solo los lee.
   */
  get canManageDocuments(): boolean {
    if (this.userRole === 'ADMINISTRADOR') return true;
    if (this.userRole === 'PROPIETARIO') return this.canEdit;
    if (this.userRole === 'CONDUCTOR') return this.isOwnProfile;
    return false;
  }

  /** El conductor de la sesión está en su propio perfil. */
  get isOwnProfile(): boolean {
    return (
      !!this.loggedUserId &&
      !!this.driver?.user?.id &&
      this.driver.user.id === this.loggedUserId
    );
  }

  /**
   * Sus documentos y, si también es propietario, los de ese registro: cargados
   * desde cualquiera de las dos fichas se ven en las dos.
   */
  private loadDocuments(): void {
    const driver = this.driver;
    if (!driver?.id) return;

    this.documentsReady = false;
    findLinkedOwner(this.ownerService, driver)
      .pipe(
        switchMap((owner) => {
          this.linkedOwner = owner;
          return loadHolderDocuments(this.commonService, {
            driverId: driver.id,
            ownerId: owner?.id,
          });
        }),
      )
      .subscribe({
        next: (documents) => {
          this.setDocuments(documents);
          this.documentsReady = true;
        },
        error: (err) => {
          console.error('Error loading driver documents:', err);
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
      `*Documentos ${this.driver?.name ?? ''}*`,
      this.formatDocNumber(this.driver?.documentNumber),
    ];

    await shareDocumentFiles(
      this.documentRows,
      header,
      this.driver?.name,
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

  // ─── Photo from hero card ─────────────────────────────────────────────────

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.driver?.id) return;

    try {
      const processed = await CustomValidators.readPhotoFile(event);
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto(
          'driver',
          this.driver.id,
          processed.blob,
        ),
      );
      if (uploadRes?.data) {
        this.photoPreview = `${uploadRes.data.split('?')[0]}?t=${Date.now()}`;
        this.savePhoto(uploadRes.data);
      }
    } catch (err) {
      this.toastService.showError('Error', 'No se pudo subir la foto');
      console.error(err);
    }
  }

  removePhoto(): void {
    this.photoPreview = '';
    this.savePhoto('');
  }

  async onCameraCapture(dataUrl: string): Promise<void> {
    if (!this.driver?.id) return;

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
        this.commonService.uploadPhoto('driver', this.driver.id, file),
      );
      if (uploadRes?.data) {
        this.photoPreview = `${uploadRes.data.split('?')[0]}?t=${Date.now()}`;
        this.savePhoto(uploadRes.data);
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

  savePhoto(photoUrl: string): void {
    if (!this.driver) return;

    const driverToSave: ModelDriver = {
      ...this.driver,
      photo: photoUrl,
    };

    this.driverService.createDriver(driverToSave).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Perfil',
          'Fotografía actualizada exitosamente!',
        );
        if (this.driver)
          this.driver.photo = photoUrl
            ? `${photoUrl.split('?')[0]}?t=${Date.now()}`
            : '';
      },
      error: (err) => {
        console.error('Error saving photo:', err);
        this.toastService.showError(
          'Error',
          'No se pudo guardar la fotografía',
        );
      },
    });
  }
}
