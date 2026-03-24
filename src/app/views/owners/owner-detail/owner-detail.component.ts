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
import { ModelDriver } from 'src/app/models/driver-model';
import { DriverService } from 'src/app/services/driver.service';
import { TripService } from 'src/app/services/trip.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { GVehicleMiniCardComponent } from 'src/app/components/g-vehicle-mini-card/g-vehicle-mini-card.component';
import { GPasswordCardComponent } from 'src/app/components/g-password-card/g-password-card.component';
import { GOwnerFormComponent } from 'src/app/components/g-owner-form/g-owner-form.component';
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
  ],
  templateUrl: './owner-detail.component.html',
  styleUrls: ['./owner-detail.component.scss'],
})
export class OwnerDetailComponent implements OnInit, OnDestroy {
  @ViewChild(GPasswordCardComponent) passwordCard?: GPasswordCardComponent;
  ownerId: number | null = null;
  owner: ModelOwner | null = null;
  vehicles: ModelVehicle[] = [];
  drivers: ModelDriver[] = [];
  cities: any[] = [];
  brands: any[] = [];
  loading: boolean = true;
  loadingVehicles: boolean = true;
  loadingDrivers: boolean = true;
  loadingCities: boolean = true;
  loadingBrands: boolean = true;
  tripCount: number = 0;
  fromSource: string | null = null;
  fromTrips: boolean = false; // Kept for backward compatibility if needed elsewhere but updated logic
  showCamera: boolean = false;
  isAdmin: boolean = false;
  isConductor: boolean = false;
  now: Date = new Date();

  // Offcanvas variables
  isOffcanvasOpen: boolean = false;
  isPasswordOffcanvasOpen: boolean = false;
  isMenuOpen: boolean = false;

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
          this.resolveCityName();
        } else {
          this.toastService.showError('Error', 'No se encontró el propietario');
          this.goBack();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading owner:', err);
        this.toastService.showError('Error', 'Error al cargar el propietario');
        this.loading = false;
        this.goBack();
      },
    });
  }

  validateAccess(ownerId: number, user: any): void {
    const roleName = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
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
            this.toastService.showError(
              'Acceso Denegado',
              'No tiene permiso para ver este perfil',
            );
            this.goBack();
          }
        });
      return;
    }

    if (roleName === 'CONDUCTOR') {
      this.loadDriverVehicleData(ownerId, user.id);
      return;
    }

    // Otros roles
    this.toastService.showError(
      'Acceso Denegado',
      'No tiene permiso para ver esta información',
    );
    this.goBack();
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
            this.toastService.showError(
              'Acceso Denegado',
              'No tiene permiso para ver este perfil de propietario',
            );
            this.goBack();
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
              this.mapBrandNames();
              this.mapDriverNames();
              this.mapLastTripStatuses();
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

          // Drivers list (maybe show all drivers of the owner or just themselves? The request says "el listado de vehiculos se debe mostrar unicamente el vehiculo del conductor", it doesn't mention driver list filtering specifically but usually it's better to hide others)
          this.drivers = [driver];
          this.loadingDrivers = false;
        } else {
          this.loadingVehicles = false;
          this.loadingDrivers = false;
          this.toastService.showError(
            'Error',
            'No se encontró información del conductor',
          );
        }
      },
      error: () => {
        this.loadingVehicles = false;
        this.loadingDrivers = false;
      },
    });
  }

  loadTripCountForVehicle(vehicleId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('vehicle.id', '=', vehicleId.toString())],
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
    this.loadDrivers(ownerId);
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
        this.mapBrandNames();
        this.mapDriverNames();
        this.mapLastTripStatuses();
        this.loadingVehicles = false;
      },
      error: (err) => {
        console.error('Error loading vehicles:', err);
        this.loadingVehicles = false;
      },
    });
  }

  loadDrivers(ownerId: number): void {
    this.loadingDrivers = true;
    const filter = new ModelFilterTable(
      [new Filter('ownerId', '=', ownerId.toString())],
      new Pagination(50, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        this.drivers = response?.data?.content ?? [];
        this.mapDriverNames();
        this.loadingDrivers = false;
      },
      error: (err) => {
        console.error('Error loading drivers:', err);
        this.loadingDrivers = false;
      },
    });
  }

  loadTripCount(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('vehicle.owners.owner.id', '=', ownerId.toString())],
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

  mapDriverNames(): void {
    if (this.drivers.length > 0 && this.vehicles.length > 0) {
      this.vehicles.forEach((v) => {
        const driver = this.drivers.find(
          (d) => String(d.id) === String(v.currentDriverId),
        );
        if (driver) v.currentDriverName = driver.name;
      });
    }
  }

  get stats() {
    return {
      total: this.vehicles.length,
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

  goBack(): void {
    const user = this.securityService.getUserData();
    const role = (user?.userRoles?.[0]?.role?.name ?? '').toUpperCase();

    if (role === 'ADMINISTRADOR') {
      switch (this.fromSource) {
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
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }

  mapLastTripStatuses(): void {
    if (this.vehicles.length === 0) return;

    this.vehicles.forEach((v) => {
      if (!v.id) return;
      const tripFilter = new ModelFilterTable(
        [new Filter('vehicle.id', '=', v.id.toString())],
        new Pagination(1, 0),
        new Sort('startDate', false),
      );

      this.tripService.getTripFilter(tripFilter).subscribe({
        next: (resp: any) => {
          const lastTrip = resp?.data?.content?.[0];
          v.lastTripStatus = lastTrip?.status ?? '';
        },
      });
    });
  }

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.owner?.id) return;

    try {
      const uploadRes = await firstValueFrom(
        this.commonService.uploadPhoto('owner', this.owner.id, file),
      );
      if (uploadRes?.data) {
        this.updateOwnerPhoto(uploadRes.data);
      }
    } catch (err) {
      this.toastService.showError('Error', 'No se pudo subir la foto');
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
          'Foto actualizada exitosamente',
        );
        this.owner!.photo = photoUrl;
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
      ia[i] = byteString.charCodeAt(i);
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
    }

    this.showCamera = false;
  }

  onCameraClose(): void {
    this.showCamera = false;
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

              this.securityService.createUser(fullUser).subscribe({
                next: () => {
                  this.toastService.showSuccess(
                    'Seguridad',
                    'Contraseña actualizada exitosamente',
                  );
                  this.togglePasswordOffcanvas();
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
