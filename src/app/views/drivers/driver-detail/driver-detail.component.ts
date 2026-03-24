import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { DriverService } from 'src/app/services/driver.service';
import { TripService } from 'src/app/services/trip.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelDriver } from 'src/app/models/driver-model';
import { ModelOwner } from 'src/app/models/owner-model';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { GVehicleMiniCardComponent } from 'src/app/components/g-vehicle-mini-card/g-vehicle-mini-card.component';
import { GDriverFormComponent } from 'src/app/components/g-driver-form/g-driver-form.component';
import { GPasswordCardComponent } from 'src/app/components/g-password-card/g-password-card.component';
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
  ],
  templateUrl: './driver-detail.component.html',
  styleUrls: ['./driver-detail.component.scss'],
})
export class DriverDetailComponent implements OnInit, OnDestroy {
  @ViewChild(GPasswordCardComponent) passwordCard?: GPasswordCardComponent;
  driverId: number | null = null;
  driver: ModelDriver | null = null;
  vehicles: ModelVehicle[] = [];
  cities: any[] = [];
  brands: any[] = [];
  loading: boolean = true;
  loadingVehicles: boolean = true;
  loadingCities: boolean = true;
  loadingBrands: boolean = true;
  tripCount: number = 0;
  now: Date = new Date();
  showCamera: boolean = false;
  photoPreview: string = '';

  // Context menu
  isMenuOpen: boolean = false;
  userRole: string = '';
  private userSub?: Subscription;

  // Offcanvas states
  isEditOffcanvasOpen: boolean = false;
  isPasswordOffcanvasOpen: boolean = false;
  loggedInOwner: ModelOwner | null = null;

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
    this.userSub = this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '')
            .toUpperCase()
            .trim();
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
        this.loadDriver(this.driverId);
        this.loadVehicles(this.driverId);
        this.loadTripCount(this.driverId);
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
        if (response?.data?.content?.length > 0) {
          this.driver = response.data.content[0];
          this.photoPreview = this.driver?.photo || '';
          this.resolveCityName();
        } else {
          this.toastService.showError('Error', 'No se encontró el conductor');
          this.goBack();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading driver:', err);
        this.toastService.showError('Error', 'Error al cargar el conductor');
        this.loading = false;
        this.goBack();
      },
    });
  }

  loadReferenceData(): void {
    this.loadOwners();
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
      [new Filter('driver.id', '=', driverId.toString())],
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

  goBack(): void {
    this.router.navigate(['/site/drivers']);
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
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
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

              this.securityService.createUser(fullUser).subscribe({
                next: () => {
                  this.toastService.showSuccess(
                    'Seguridad',
                    'Contraseña actualizada exitosamente',
                  );
                  this.closePasswordOffcanvas();
                },
                error: (err: any) => {
                  console.error('Error updating password:', err);
                  this.toastService.showError(
                    'Error',
                    'No se pudo actualizar la contraseña',
                  );
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
          `Conductor ${newStatus === 'Activo' ? 'activado' : 'desactivado'} exitosamente`,
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

  // ─── Photo from hero card ─────────────────────────────────────────────────

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.driver?.id) return;

    try {
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto('driver', this.driver.id, file),
      );
      if (uploadRes?.data) {
        this.photoPreview = uploadRes.data;
        this.savePhoto(uploadRes.data);
      }
    } catch (err) {
      this.toastService.showError('Error', 'No se pudo subir la foto');
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
      ia[i] = byteString.charCodeAt(i);
    }
    const file = new Blob([ab], { type: mimeType });

    try {
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto('driver', this.driver.id, file),
      );
      if (uploadRes?.data) {
        this.photoPreview = uploadRes.data;
        this.savePhoto(uploadRes.data);
      }
    } catch (err) {
      this.toastService.showError('Error', 'No se pudo subir la foto');
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
          'Fotografía actualizada exitosamente',
        );
        if (this.driver) this.driver.photo = photoUrl;
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
