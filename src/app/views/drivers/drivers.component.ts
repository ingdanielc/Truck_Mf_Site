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
import { PaginationUtils } from 'src/app/utils/pagination-utils';

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
  activeFilter: string = 'Todos';
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  // Global cache for Admin role
  globalStats = {
    total: 0,
    active: 0,
    inactive: 0,
  };

  expandedOwnerId: number | null = null;
  expandedOwnerPage: number = 0;
  expandedOwnerRows: number = 9;
  ownerDrivers: ModelDriver[] = [];
  totalOwners: number = 0;
  isLoadingExpandedDrivers: boolean = false;

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
  isSearchActive: boolean = false;

  get isSearchingDrivers(): boolean {
    return (
      this.userRole === 'ADMINISTRADOR' &&
      !!this.searchTerm &&
      !this.expandedOwnerId &&
      !this.ownerIdFilter
    );
  }

  // Data for lists and forms (passed to g-driver-form)
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];
  owners: ModelOwner[] = [];
  loggedInOwner: ModelOwner | null = null;
  salaryTypes: any[] = [];

  isPasswordOffcanvasOpen: boolean = false;
  isSavingPassword: boolean = false;
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
      this.isSearchActive = false;
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
      new Sort('name', true),
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
          this.userRole = (user.userRoles?.[0]?.role?.name || '')
            .toUpperCase()
            .trim();
          if (
            this.userRole === 'ADMINISTRADOR' ||
            this.userRole === 'PROPIETARIO'
          ) {
            this.rows = 9;
          } else {
            this.rows = 100;
          }

          if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners(); // This will trigger loadDrivers upon success
          } else {
            this.loadOwners();
            if (this.userRole !== 'ADMINISTRADOR') {
              this.loadDrivers();
            }
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

    if (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter) {
      filtros.push(new Filter('id', '=', this.ownerIdFilter.toString()));
    }

    const paginationRows = this.userRole === 'ADMINISTRADOR' ? this.rows : 1;
    const paginationPage = this.userRole === 'ADMINISTRADOR' ? this.page : 0;
    // For PROPIETARIO, we only need the current owner details (always page 0)

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(paginationRows, paginationPage),
      new Sort('name', true),
    );

    if (this.userRole === 'ADMINISTRADOR') this.loading = true;

    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
          if (this.userRole === 'PROPIETARIO' && this.owners.length > 0) {
            this.loggedInOwner = this.owners[0];
            this.loggedInOwnerId = this.owners[0].id ?? this.loggedInOwnerId;
            this.updateStatusCounts();
            this.loadDrivers();
          } else if (this.userRole === 'ADMINISTRADOR') {
            this.totalOwners = response.data.totalElements ?? 0;

            // Handle auto-expansion if ownerIdFilter is present
            if (this.ownerIdFilter && this.owners.length > 0) {
              const matchedOwner = this.owners.find(
                (o) => o.id === this.ownerIdFilter,
              );
              if (matchedOwner) {
                this.expandedOwnerId = matchedOwner.id ?? null;
                this.isLoadingExpandedDrivers = true;
                this.loadDriversForAdmin(matchedOwner.id!);
              }
            }

            // Initial global stats calculation for admin
            if (!this.expandedOwnerId && this.page === 0 && !this.searchTerm) {
              this.updateStatusCounts();
            }
            this.loading = false;
          }
          if (this.drivers.length > 0 && this.userRole !== 'ADMINISTRADOR') {
            this.buildGroups();
          }
        } else if (this.userRole === 'ADMINISTRADOR') {
          this.owners = [];
          this.totalOwners = 0;
          this.loading = false;
        }
      },
      error: (err: any) => {
        console.error('Error loading owners:', err);
        if (this.userRole === 'ADMINISTRADOR') {
          this.owners = [];
          this.totalOwners = 0;
          this.loading = false;
        }
      },
    });
  }

  private updateStatusCounts(): void {
    let filtros: Filter[] = [];
    if (this.ownerIdFilter) {
      filtros.push(new Filter('ownerId', '=', this.ownerIdFilter.toString()));
    } else if (this.loggedInOwnerId) {
      filtros.push(new Filter('ownerId', '=', this.loggedInOwnerId.toString()));
    } else if (this.userRole !== 'ADMINISTRADOR') {
      // For non-admins, ensure they don't load everything if ID is missing
      return;
    }

    this.driverService
      .getDriverFilter(
        new ModelFilterTable(
          filtros,
          new Pagination(20000, 0),
          new Sort('id', true),
        ),
      )
      .subscribe({
        next: (response: any) => {
          const allDrivers = response?.data?.content ?? [];
          const total = response?.data?.totalElements ?? allDrivers.length;

          const active = allDrivers.filter((d: ModelDriver) => {
            const status = d.user?.status;
            return !d.user || status === 'Activo';
          }).length;

          const inactive = total - active;

          this.totalDrivers = total;
          this.activeDrivers = active;
          this.inactiveDrivers = inactive;

          this.globalStats = {
            total: this.totalDrivers,
            active: this.activeDrivers,
            inactive: this.inactiveDrivers,
          };
        },
      });
  }

  toggleOwnerExpansion(owner: ModelOwner): void {
    if (this.userRole !== 'ADMINISTRADOR') return;

    if (this.expandedOwnerId === owner.id) {
      this.expandedOwnerId = null;
      this.expandedOwnerPage = 0;
      this.ownerDrivers = [];
      // Restore global stats
      this.totalDrivers = this.globalStats.total;
      this.activeDrivers = this.globalStats.active;
      this.inactiveDrivers = this.globalStats.inactive;
    } else {
      this.expandedOwnerId = owner.id ?? null;
      if (this.expandedOwnerId) {
        this.isLoadingExpandedDrivers = true;
        this.ownerDrivers = [];
        this.loadDriversForAdmin(this.expandedOwnerId);
      }
    }
  }

  private loadDriversForAdmin(ownerId: number): void {
    const filtros = [new Filter('ownerId', '=', ownerId.toString())];

    if (this.searchTerm) {
      const term = this.searchTerm.trim();
      const isNumeric = /^[\d\.\-]+$/.test(term);
      if (isNumeric) {
        filtros.push(new Filter('documentNumber', 'like', term)); // Basic search for expanded view
      } else {
        filtros.push(new Filter('name', 'like', term)); // Basic search for expanded view
      }
    }

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(20000, 0),
      new Sort('name', true),
    );

    this.driverService.getDriverFilter(filter).subscribe({
      next: (respTrips: any) => {
        const fetched: ModelDriver[] = respTrips?.data?.content ?? [];

        if (this.activeFilter === 'Activo') {
          this.ownerDrivers = fetched.filter(
            (d: ModelDriver) => !d.user || d.user.status === 'Activo',
          );
        } else if (this.activeFilter === 'Inactivo') {
          this.ownerDrivers = fetched.filter(
            (d: ModelDriver) => d.user && d.user.status !== 'Activo',
          );
        } else {
          this.ownerDrivers = fetched;
        }

        if (this.activeFilter === 'Todos') {
          this.totalDrivers = fetched.length;
          this.activeDrivers = fetched.filter((d: ModelDriver) => {
            const status = d.user?.status;
            return !d.user || status === 'Activo';
          }).length;
          this.inactiveDrivers = this.totalDrivers - this.activeDrivers;
        }

        this.isLoadingExpandedDrivers = false;
      },
      error: () => {
        this.ownerDrivers = [];
        this.totalDrivers = 0;
        this.activeDrivers = 0;
        this.inactiveDrivers = 0;
        this.isLoadingExpandedDrivers = false;
      },
    });
  }

  fetchOwnerDetails(ownerId: number): void {
    if (this.owners.some((o: ModelOwner) => o.id === ownerId)) return;

    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('name', true),
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
          `Conductor ${newStatus === 'Activo' ? 'activado' : 'desactivado'} exitosamente!`,
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
    } else if (this.userRole === 'CONDUCTOR' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('ownerId', '=', this.loggedInOwnerId.toString()));
    } else if (
      this.userRole === 'ADMINISTRADOR' &&
      this.ownerIdFilter != null
    ) {
      filtros.push(new Filter('ownerId', '=', this.ownerIdFilter.toString()));
    } else if (this.userRole !== 'ADMINISTRADOR') {
      return;
    }

    if (this.searchTerm) {
      const term = this.searchTerm.trim();
      const isNumeric = /^[\d\.\-]+$/.test(term);
      if (isNumeric) {
        filtros.push(new Filter('documentNumber', 'like', term));
      } else {
        filtros.push(new Filter('name', 'like', term));
      }
    }

    const fetchRows = this.isSearchActive ? 20000 : this.rows;
    const fetchPage = this.isSearchActive ? 0 : this.page;

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(fetchRows, fetchPage),
      new Sort('id', true),
    );
    this.loading = true;
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          const fetched: ModelDriver[] = response.data.content;

          if (this.activeFilter === 'Activo') {
            this.drivers = fetched.filter(
              (d: ModelDriver) => !d.user || d.user.status === 'Activo',
            );
            this.totalDrivers = this.activeDrivers;
          } else if (this.activeFilter === 'Inactivo') {
            this.drivers = fetched.filter(
              (d: ModelDriver) => d.user && d.user.status !== 'Activo',
            );
            this.totalDrivers = this.inactiveDrivers;
          } else {
            this.drivers = fetched;
            this.allDrivers = fetched;
            this.totalDrivers = response.data.totalElements || 0;
          }

          if (this.userRole !== 'ADMINISTRADOR' || this.isSearchActive) {
            this.buildGroups();
          }

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
    this.activeDrivers = this.allDrivers.filter((d: ModelDriver) => {
      const status = d.user?.status;
      return !d.user || status === 'Activo';
    }).length;
    this.inactiveDrivers = this.totalDrivers - this.activeDrivers;
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.page = 0;
    this.applyFilter();
  }

  applyFilter(): void {
    this.isSearchActive = this.isSearchingDrivers;

    if (this.userRole === 'ADMINISTRADOR' && this.expandedOwnerId) {
      this.loadDriversForAdmin(this.expandedOwnerId);
      return;
    }

    if (this.userRole !== 'ADMINISTRADOR' || this.isSearchActive) {
      this.page = 0;
      this.loadDrivers();
    } else {
      this.page = 0;
      this.loadOwners();
    }
  }

  buildGroups(): void {
    const groups = new Map<string, DriverOwnerGroup>();
    const noOwnerKey = '__sin_propietario__';

    if (this.userRole === 'PROPIETARIO') {
      const ownerId = this.loggedInOwnerId;
      const owner =
        this.loggedInOwner ??
        (this.owners.find((o) => o.id === ownerId) ||
          new ModelOwner(
            ownerId ?? undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'Mi Socio',
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            'Activo',
          ));
      groups.set(String(ownerId), { owner, drivers: [] });
    } else if (this.filteredOwner && !this.searchTerm) {
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

  get dataTotal(): number {
    return this.userRole === 'ADMINISTRADOR' && !this.isSearchActive
      ? this.totalOwners
      : this.totalDrivers;
  }

  get itemsShownCount(): number {
    return this.userRole === 'ADMINISTRADOR' && !this.isSearchingDrivers
      ? this.owners.length
      : this.drivers.length;
  }

  get totalPages(): number {
    return Math.ceil(this.dataTotal / this.rows);
  }

  get desktopPages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 12);
  }

  get mobilePages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 4);
  }

  get paginatedOwnerDrivers(): ModelDriver[] {
    const start = this.expandedOwnerPage * this.expandedOwnerRows;
    return this.ownerDrivers.slice(start, start + this.expandedOwnerRows);
  }

  get expandedTotalPages(): number {
    return Math.ceil(this.ownerDrivers.length / this.expandedOwnerRows);
  }

  get expandedDesktopPages(): number[] {
    return PaginationUtils.getVisiblePages(
      this.expandedOwnerPage,
      this.expandedTotalPages,
      12,
    );
  }

  get expandedMobilePages(): number[] {
    return PaginationUtils.getVisiblePages(
      this.expandedOwnerPage,
      this.expandedTotalPages,
      4,
    );
  }

  changeExpandedPage(newPage: number): void {
    if (
      newPage >= 0 &&
      newPage < this.expandedTotalPages &&
      newPage !== this.expandedOwnerPage
    ) {
      this.expandedOwnerPage = newPage;
    }
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.expandedOwnerId = null;
      this.ownerDrivers = [];
      if (this.userRole === 'ADMINISTRADOR' && !this.isSearchActive) {
        this.loadOwners();
      } else {
        this.loadDrivers();
      }
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
        passwords.newPassword.trim(),
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

  isSameUser(driver: ModelDriver, owner: ModelOwner | null): boolean {
    if (!driver || !owner) return false;
    // 1. User ID
    if (driver.user?.id && owner.user?.id) {
      if (driver.user.id === owner.user.id) return true;
    }

    // 2. Document Number
    const d1 = String(driver.documentNumber || '').replaceAll(/\D/g, '');
    const d2 = String(owner.documentNumber || '').replaceAll(/\D/g, '');
    return d1 !== '' && d1 === d2;
  }

  goBackToOwners(): void {
    this.router.navigate(['/site/owners']);
  }
}
