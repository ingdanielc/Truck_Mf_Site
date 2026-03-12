import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ModelDriver } from 'src/app/models/driver-model';
import { GDriverCardComponent } from '../../components/g-driver-card/g-driver-card.component';
import {
  ModelFilterTable,
  Pagination,
  Sort,
  Filter,
} from 'src/app/models/model-filter-table';
import { GVehicleOwnerCardComponent } from '../../components/g-vehicle-owner-card/g-vehicle-owner-card.component';
import { GPasswordCardComponent } from '../../components/g-password-card/g-password-card.component';
import { GDriverFormComponent } from '../../components/g-driver-form/g-driver-form.component';
import { SecurityService } from 'src/app/services/security/security.service';
import { ToastService } from 'src/app/services/toast.service';
import { DriverService } from 'src/app/services/driver.service';
import { CommonService } from '../../services/common.service';
import { Subscription } from 'rxjs';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelOwner } from 'src/app/models/owner-model';

export interface DriverOwnerGroup {
  owner: ModelOwner;
  drivers: ModelDriver[];
}

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [
    FormsModule,
    GDriverCardComponent,
    GVehicleOwnerCardComponent,
    GPasswordCardComponent,
    GDriverFormComponent,
  ],
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.scss'],
})
export class DriversComponent implements OnInit, OnDestroy {
  drivers: ModelDriver[] = [];
  allDrivers: ModelDriver[] = [];
  totalDrivers: number = 0;
  activeDrivers: number = 0;
  inactiveDrivers: number = 0;
  groupedDrivers: DriverOwnerGroup[] = [];
  searchTerm: string = '';
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  // Role management
  userRole: string = '';
  loggedInOwnerId: number | null = null;
  private userSub: Subscription | undefined;

  /** ownerId filter when navigated from owner card (query param) */
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;

  // Offcanvas flags
  isOffcanvasOpen: boolean = false;
  editingDriver: ModelDriver | null = null;

  // Data for lists and forms (passed to g-driver-form)
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];
  owners: ModelOwner[] = [];
  salaryTypes: any[] = [];

  isPasswordOffcanvasOpen: boolean = false;
  driverChangingPassword: ModelDriver | null = null;

  constructor(
    private readonly driverService: DriverService,
    private readonly commonService: CommonService,
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
    private readonly ownerService: OwnerService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    this.subscribeToUserContext();
    this.loadReferenceData();
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  loadFilteredOwner(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredOwner = response.data.content[0];
          this.applyFilter();
        }
      },
      error: (err: any) => console.error('Error loading filtered owner:', err),
    });
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          if (this.userRole !== 'ADMINISTRADOR') {
            this.rows = 100;
          } else {
            this.rows = 9;
          }

          if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners(); // This will trigger loadDrivers upon success
          } else {
            this.loadOwners();
            this.loadDrivers();
          }
        }
      },
    });
  }

  loadReferenceData(): void {
    this.commonService.getListTypeDocument().subscribe({
      next: (response: any) => {
        if (response?.data) this.documentTypes = response.data;
      },
      error: (err: any) => console.error('Error loading document types:', err),
    });

    this.commonService.getGenders().subscribe({
      next: (response: any) => {
        if (response?.data) this.genders = response.data;
      },
      error: (err: any) => console.error('Error loading genders:', err),
    });

    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data)
          this.cities = response.data.sort((a: any, b: any) => {
            const stateCmp = (a.state || '').localeCompare(b.state || '', 'es');
            return stateCmp !== 0
              ? stateCmp
              : a.name.localeCompare(b.name, 'es');
          });
        this.groupedCities = this.buildGroupedCities();
      },
      error: (err: any) => console.error('Error loading cities:', err),
    });

    this.commonService.getSalaryTypes().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.salaryTypes = response.data;
        }
      },
      error: (err: any) => console.error('Error loading salary types:', err),
    });
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('user.Id', '=', this.loggedInOwnerId.toString()));
    }

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(100, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
          if (this.userRole === 'PROPIETARIO' && this.owners.length > 0) {
            this.loggedInOwnerId = this.owners[0].id ?? this.loggedInOwnerId;
            this.loadDrivers();
          }
          if (this.drivers.length > 0) {
            this.buildGroups();
          }
        }
      },
      error: (err: any) => console.error('Error loading owners:', err),
    });
  }

  fetchOwnerDetails(ownerId: number): void {
    if (this.owners.some((o: ModelOwner) => o.id === ownerId)) return;

    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.[0]) {
          const owner = response.data.content[0];
          if (!this.owners.some((o: ModelOwner) => o.id === owner.id)) {
            this.owners.push(owner);
            this.buildGroups();
          }
        }
      },
      error: (err: any) =>
        console.error(`Error fetching owner ${ownerId}:`, err),
    });
  }

  private buildGroupedCities(): { state: string; cities: any[] }[] {
    const map = new Map<string, any[]>();
    for (const city of this.cities) {
      const state = city.state || 'Sin departamento';
      if (!map.has(state)) map.set(state, []);
      map.get(state)!.push(city);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([state, cities]) => ({ state, cities }));
  }

  toggleOffcanvas(driver?: ModelDriver): void {
    this.editingDriver = driver || null;
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
  }

  onDriverSaved(): void {
    this.isOffcanvasOpen = false;
    this.loadDrivers();
  }

  onToggleDriverStatus(driver: ModelDriver): void {
    if (!driver.user) return;

    const newStatus = driver.user.status === 'Activo' ? 'Inactivo' : 'Activo';
    const userToSave = { ...driver.user, status: newStatus };

    this.securityService.createUser(userToSave as any).subscribe({
      next: () => {
        // Update local model without reloading
        driver.user!.status = newStatus;
        this.calculateStats();
        this.toastService.showSuccess(
          'Conductor',
          `Conductor ${newStatus === 'Activo' ? 'activado' : 'desactivado'} exitosamente`,
        );
      },
      error: (err: any) => {
        console.error('Error toggling driver status:', err);
        this.toastService.showError(
          'Error',
          'No se pudo cambiar el estado del conductor',
        );
      },
    });
  }

  loadDrivers(): void {
    let filtros: Filter[] = [];

    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('ownerId', '=', this.loggedInOwnerId.toString()));
    } else if (
      this.userRole === 'ADMINISTRADOR' &&
      this.ownerIdFilter != null
    ) {
      filtros.push(new Filter('ownerId', '=', this.ownerIdFilter.toString()));
    }

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.loading = true;
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalDrivers = response.data.totalElements || 0;
          this.allDrivers = response.data.content;
          this.calculateStats();
          this.applyFilter();

          const missingOwnerIds = [
            ...new Set(
              this.allDrivers
                .map((d) => d.ownerId)
                .filter(
                  (id): id is number =>
                    id != null &&
                    !this.owners.some((o: ModelOwner) => o.id === id),
                ),
            ),
          ];

          missingOwnerIds.forEach((id) => this.fetchOwnerDetails(id));
        } else {
          this.allDrivers = [];
          this.groupedDrivers = [];
          this.calculateStats();
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Error loading drivers:', err);
        this.loading = false;
      },
    });
  }

  calculateStats(): void {
    this.activeDrivers = this.allDrivers.filter((d) => {
      const status = d.user?.status;
      return !d.user || status === 'Activo';
    }).length;
    this.inactiveDrivers = this.totalDrivers - this.activeDrivers;
  }

  applyFilter(): void {
    let filtered = this.allDrivers;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name?.toLowerCase().includes(term) ||
          d.email?.toLowerCase().includes(term) ||
          d.documentNumber?.includes(term),
      );
    }
    this.drivers = filtered;
    this.buildGroups();
  }

  buildGroups(): void {
    const groups = new Map<string, DriverOwnerGroup>();
    const noOwnerKey = '__sin_propietario__';

    if (this.filteredOwner && !this.searchTerm) {
      const key = String(this.filteredOwner.id);
      groups.set(key, { owner: this.filteredOwner, drivers: [] });
    }

    this.drivers.forEach((d) => {
      if (!d.ownerId) {
        if (!groups.has(noOwnerKey)) {
          groups.set(noOwnerKey, {
            owner: new ModelOwner(
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              'Sin socio',
            ),
            drivers: [],
          });
        }
        groups.get(noOwnerKey)!.drivers.push(d);
      } else {
        const ownerData = this.owners.find((o) => o.id === d.ownerId);
        const key = String(d.ownerId);
        if (!groups.has(key)) {
          groups.set(key, {
            owner:
              ownerData ||
              new ModelOwner(
                d.ownerId,
                undefined,
                undefined,
                undefined,
                undefined,
                'Socio desconocido',
              ),
            drivers: [],
          });
        }
        groups.get(key)!.drivers.push(d);
      }
    });

    const result = Array.from(groups.values()).sort((a, b) => {
      const aName = a.owner.name ?? '';
      const bName = b.owner.name ?? '';
      if (aName === 'Sin socio') return 1;
      if (bName === 'Sin socio') return -1;
      return aName.localeCompare(bName, 'es');
    });

    this.groupedDrivers = result;
  }

  get totalPages(): number {
    return Math.ceil(this.totalDrivers / this.rows);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.loadDrivers();
    }
  }

  openAddDriverForOwner(owner: ModelOwner): void {
    this.editingDriver = null;
    this.isOffcanvasOpen = true;
    if (owner.id) {
      this.editingDriver = { ownerId: owner.id } as ModelDriver;
    }
  }

  onViewProfile(owner: ModelOwner): void {
    this.router.navigate(['/site/owners', owner.id]);
  }

  onViewDriver(driver: ModelDriver): void {
    this.router.navigate(['/site/drivers', driver.id]);
  }

  togglePasswordOffcanvas(driver?: ModelDriver): void {
    this.isPasswordOffcanvasOpen = !this.isPasswordOffcanvasOpen;
    this.driverChangingPassword = driver || null;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.driverChangingPassword?.user?.id) {
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
            [
              new Filter(
                'id',
                '=',
                this.driverChangingPassword.user.id.toString(),
              ),
            ],
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
}
