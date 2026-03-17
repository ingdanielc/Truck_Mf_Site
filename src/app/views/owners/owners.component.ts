import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelOwner } from 'src/app/models/owner-model';
import { GOwnerCardComponent } from 'src/app/components/g-owner-card/g-owner-card.component';
import { GPasswordCardComponent } from 'src/app/components/g-password-card/g-password-card.component';
import { GOwnerFormComponent } from 'src/app/components/g-owner-form/g-owner-form.component';
import { Subscription } from 'rxjs';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { OwnerService } from 'src/app/services/owner.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-owners',
  standalone: true,
  imports: [
    FormsModule,
    GOwnerCardComponent,
    GPasswordCardComponent,
    GOwnerFormComponent,
  ],
  templateUrl: './owners.component.html',
  styleUrls: ['./owners.component.scss'],
})
export class OwnersComponent implements OnInit, OnDestroy {
  owners: ModelOwner[] = [];
  allOwners: ModelOwner[] = [];
  totalOwners: number = 0;
  activeOwners: number = 0;
  inactiveOwners: number = 0;
  searchTerm: string = '';
  activeFilter: string = 'Todos';
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  userRole: string = 'ROL';
  private userSub?: Subscription;

  // Offcanvas and Form
  selectedOwner: ModelOwner | null = null;
  selectedOwnerForPassword: ModelOwner | null = null;

  isOffcanvasOpen: boolean = false;
  isPasswordOffcanvasOpen: boolean = false;
  openMenuOwnerId: number | null = null;
  constructor(
    private readonly ownerService: OwnerService,
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.subscribeToUserContext();
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          if (this.userRole !== 'ADMINISTRADOR') {
            this.rows = 100;
          } else {
            this.rows = 9;
          }
          this.loadOwners();
        }
      },
      error: (err) => console.error('Error loading role:', err),
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  // --- Offcanvas and Form Methods ---

  openOffcanvas(owner?: ModelOwner): void {
    this.selectedOwner = owner || null;
    this.isOffcanvasOpen = true;
    this.openMenuOwnerId = null;
  }

  toggleOffcanvas(): void {
    this.isOffcanvasOpen = false;
    setTimeout(() => {
      this.selectedOwner = null;
    }, 300);
  }

  onFormSaved(): void {
    this.toggleOffcanvas();
    this.loadOwners();
  }

  onMenuToggle(ownerId: number | null): void {
    this.openMenuOwnerId = ownerId;
  }

  loadOwners(): void {
    this.openMenuOwnerId = null;
    const filter = new ModelFilterTable(
      [],
      new Pagination(this.rows, this.page),
      new Sort('name', true),
    );
    this.loading = true;
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalOwners = response.data.totalElements || 0;
          this.allOwners = response.data.content;
          this.updateStats();
          this.applyFilter();
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading owners:', err);
        this.loading = false;
      },
    });
  }

  updateStats(): void {
    // Query for total owners (no status filter)
    const totalFilter = new ModelFilterTable(
      [],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.ownerService.getOwnerFilter(totalFilter).subscribe({
      next: (response: any) => {
        this.totalOwners = response?.data?.totalElements || 0;
      },
    });

    // Query for active owners
    const activeFilter = new ModelFilterTable(
      [new Filter('user.status', '=', 'Activo')],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.ownerService.getOwnerFilter(activeFilter).subscribe({
      next: (response: any) => {
        this.activeOwners = response?.data?.totalElements || 0;
      },
    });

    // Query for inactive owners
    const inactiveFilter = new ModelFilterTable(
      [new Filter('user.status', '!=', 'Activo')],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.ownerService.getOwnerFilter(inactiveFilter).subscribe({
      next: (response: any) => {
        this.inactiveOwners = response?.data?.totalElements || 0;
      },
    });
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.page = 0;
    this.applyFilter();
  }

  applyFilter(): void {
    let filtered = this.allOwners;

    if (this.activeFilter !== 'Todos') {
      filtered = filtered.filter((p) => {
        if (this.activeFilter === 'Activo') {
          return p.user?.status === 'Activo';
        } else {
          return p.user?.status !== 'Activo';
        }
      });
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(term) ||
          p.email?.toLowerCase().includes(term) ||
          p.documentNumber?.includes(term),
      );
    }

    this.owners = filtered;
  }

  get totalPages(): number {
    return Math.ceil(this.totalOwners / this.rows);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.loadOwners();
    }
  }

  openPasswordOffcanvas(owner: ModelOwner): void {
    this.selectedOwnerForPassword = owner;
    this.isPasswordOffcanvasOpen = true;
    this.openMenuOwnerId = null;
  }

  togglePasswordOffcanvas(): void {
    this.isPasswordOffcanvasOpen = !this.isPasswordOffcanvasOpen;
    this.selectedOwnerForPassword = null;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.selectedOwnerForPassword?.user?.id) {
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

      // Fetch full user to update
      this.securityService
        .getUserFilter(
          new ModelFilterTable(
            [
              new Filter(
                'id',
                '=',
                this.selectedOwnerForPassword.user.id.toString(),
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

  onToggleStatus(owner: ModelOwner): void {
    if (!owner.user) {
      this.toastService.showError(
        'Error',
        'No hay un usuario asociado a este propietario',
      );
      return;
    }

    const newStatus = owner.user.status === 'Activo' ? 'Inactivo' : 'Activo';

    const userToSave = {
      ...owner.user,
      status: newStatus,
    };

    this.securityService.createUser(userToSave as any).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Seguridad',
          `Usuario ${newStatus === 'Activo' ? 'activado' : 'desactivado'} exitosamente!`,
        );
        if (owner.user) owner.user.status = newStatus;
        owner.status = newStatus;
        this.updateStats();
        this.applyFilter();
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
