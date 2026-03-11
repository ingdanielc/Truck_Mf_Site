import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';

import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { SecurityService } from '../../services/security/security.service';
import { ModelRole, ModelUser, ModelUserRoles } from '../../models/user-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

import { User } from './interfaces/user.interface';
import { GUserCardComponent } from '../../components/g-user-card/g-user-card.component';
import { GPasswordCardComponent } from '../../components/g-password-card/g-password-card.component';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [
    GUserCardComponent,
    GPasswordCardComponent,
    ReactiveFormsModule,
    FormsModule,
  ],
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss'],
})
export class SecurityComponent implements OnInit {
  users: User[] = [];
  allUsers: User[] = [];
  totalUsers: number = 0;
  totalUsersStable: number = 0;
  searchTerm: string = '';
  activeFilter: string = 'Todos';
  filters: string[] = ['Todos'];
  rows: number = 9;
  page: number = 0;
  loading: boolean = true;

  userForm: FormGroup;
  isOffcanvasOpen: boolean = false;
  editingUser: User | null = null;
  availableRoles: ModelRole[] = [];
  ownersCount: number = 0;
  driversCount: number = 0;

  isPasswordOffcanvasOpen: boolean = false;
  userChangingPassword: User | null = null;

  showUserFormPassword = false;
  showUserFormConfirmPassword = false;

  constructor(
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
    private readonly fb: FormBuilder,
  ) {
    this.userForm = this.fb.group(
      {
        name: ['', [Validators.required]],
        email: [
          '',
          [Validators.required, Validators.email, this.emailUniqueValidator()],
        ],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        role: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  private emailUniqueValidator() {
    return (control: AbstractControl): ValidationErrors | null => {
      const email = control.value?.toLowerCase();
      if (!email || this.editingUser) {
        return null; // Don't validate if editing or empty
      }
      const exists = this.allUsers.some(
        (u) => u.email?.toLowerCase() === email,
      );
      return exists ? { emailExists: true } : null;
    };
  }

  ngOnInit(): void {
    this.loadRoles();
    this.updateUserCounts();
    this.loadUsers();
  }

  loadRoles(): void {
    this.securityService.getAllRoles().subscribe({
      next: (response: any) => {
        // Assuming the response structure, adjust if necessary based on actual API
        if (Array.isArray(response)) {
          this.availableRoles = response;
        } else if (response?.data) {
          this.availableRoles = response.data;
        } else {
          console.warn('Unexpected roles response format', response);
        }

        this.filters = [
          'Todos',
          ...this.availableRoles
            .map((r) => r.name)
            .filter((name): name is string => !!name),
        ];
      },
      error: (err) => {
        console.error('Error loading roles:', err);
      },
    });
  }

  loadUsers(): void {
    let filtros: Filter[] = [];
    if (this.activeFilter !== 'Todos') {
      filtros.push(new Filter('userRoles.role.name', '=', this.activeFilter));
    }
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.loading = true;
    this.securityService.getUserFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalUsers = response.data.totalElements || 0;
          this.allUsers = response.data.content.map((u: ModelUser) =>
            this.mapUser(u),
          );
          this.applyFilter();
        } else {
          this.allUsers = [];
          this.users = [];
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading users:', err);
        this.loading = false;
      },
    });
  }

  private mapUser(u: ModelUser): User {
    const roleName = u.userRoles?.[0]?.role?.name || 'OTRO';
    return {
      id: u.id || 0,
      name: u.name || 'Sin nombre',
      email: u.email || 'Sin email',
      role: roleName.toUpperCase(),
      roleType: this.getRoleType(roleName),
      status: u.status === 'Activo' ? 'online' : 'offline',
      avatar: undefined,
    };
  }

  private getRoleType(
    roleName: string,
  ): 'conductor' | 'propietario' | 'administrador' | 'otro' {
    const name = roleName.toLowerCase();
    if (name.includes('conductor')) return 'conductor';
    if (name.includes('propietario')) return 'propietario';
    if (name.includes('administrador')) return 'administrador';
    return 'otro';
  }

  updateUserCounts(): void {
    forkJoin({
      total: this.securityService.getUserFilter(
        new ModelFilterTable([], new Pagination(1, 0), new Sort('id', true)),
      ),
      owners: this.securityService.getUserFilter(
        new ModelFilterTable(
          [new Filter('userRoles.role.name', '=', 'PROPIETARIO')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      drivers: this.securityService.getUserFilter(
        new ModelFilterTable(
          [new Filter('userRoles.role.name', '=', 'CONDUCTOR')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
    }).subscribe({
      next: (resps: any) => {
        this.totalUsersStable = resps.total?.data?.totalElements ?? 0;
        this.ownersCount = resps.owners?.data?.totalElements ?? 0;
        this.driversCount = resps.drivers?.data?.totalElements ?? 0;
      },
    });
  }

  get strength(): number {
    const pwd = this.userForm.get('password')?.value || '';
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 6) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  }

  get strengthLabel(): string {
    const s = this.strength;
    if (s === 0) return '';
    if (s <= 1) return 'Débil';
    if (s === 2) return 'Media';
    if (s === 3) return 'Buena';
    return 'Fuerte';
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
    this.page = 0;
    this.loadUsers();
  }

  applyFilter(): void {
    if (!this.searchTerm) {
      this.users = [...this.allUsers];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.users = this.allUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          u.email.toLowerCase().includes(term),
      );
    }
  }

  get totalPages(): number {
    return Math.ceil(this.totalUsers / this.rows);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.loadUsers();
    }
  }

  toggleOffcanvas(user?: User): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    this.showUserFormPassword = false;
    this.showUserFormConfirmPassword = false;

    if (this.isOffcanvasOpen) {
      if (user) {
        this.editingUser = user;
        const role = this.availableRoles.find(
          (r) => r.name?.toUpperCase() === user.role?.toUpperCase(),
        );

        this.userForm.patchValue({
          name: user.name,
          email: user.email,
          role: role ? role.name : user.role,
        });
        // Password is not required when editing
        this.userForm.get('password')?.setValidators([Validators.minLength(6)]);
        this.userForm.get('confirmPassword')?.setValidators([]);
      } else {
        this.editingUser = null;
        this.userForm.reset();

        // Preselect 'ADMINISTRADOR'
        const adminRole = this.availableRoles.find(
          (r) => r.name?.toUpperCase() === 'ADMINISTRADOR',
        );
        this.userForm.patchValue({
          role: adminRole ? adminRole.name : 'ADMINISTRADOR',
        });

        this.userForm
          .get('password')
          ?.setValidators([Validators.required, Validators.minLength(6)]);
        this.userForm
          .get('confirmPassword')
          ?.setValidators([Validators.required]);
      }
      this.userForm.get('password')?.updateValueAndValidity();
      this.userForm.get('confirmPassword')?.updateValueAndValidity();
      this.userForm.get('role')?.disable();
    }
  }

  async onSubmit(): Promise<void> {
    if (this.userForm.valid) {
      try {
        const formValue = this.userForm.getRawValue();
        let password = formValue.password;

        if (password) {
          password = await this.securityService.getHashSHA512(password);
        }

        const selectedRole = this.availableRoles.find(
          (r) =>
            r.name === formValue.role ||
            r.name?.toUpperCase() === formValue.role?.toUpperCase(),
        );
        const roleId = selectedRole ? selectedRole.id : null;

        const userRoles = [
          new ModelUserRoles(null, {
            id: roleId,
            name: formValue.role,
          }),
        ];

        const userToSave = new ModelUser(
          this.editingUser?.id || null,
          formValue.name,
          formValue.email,
          password || undefined,
          userRoles,
          this.editingUser?.status === 'online' ? 'Activo' : 'Inactivo', // Simplification
        );

        this.securityService.createUser(userToSave).subscribe({
          next: () => {
            this.toastService.showSuccess(
              'Gestión de Usuarios',
              this.editingUser
                ? 'Usuario actualizado exitosamente!'
                : 'Usuario creado exitosamente!',
            );
            this.updateUserCounts();
            this.loadUsers();
            this.toggleOffcanvas();
          },
          error: (err) => {
            console.error('Error saving user:', err);
            this.toastService.showError(
              'Error',
              'No se pudo procesar la solicitud. Por favor, intente de nuevo.',
            );
          },
        });
      } catch (error) {
        console.error('Error in onSubmit:', error);
      }
    } else {
      this.userForm.markAllAsTouched();
    }
  }

  togglePasswordOffcanvas(user?: User): void {
    this.isPasswordOffcanvasOpen = !this.isPasswordOffcanvasOpen;
    this.userChangingPassword = user || null;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.userChangingPassword) return;

    try {
      const hashedNewPassword = await this.securityService.getHashSHA512(
        passwords.newPassword,
      );

      // We need to fetch the full user model to update it
      this.securityService
        .getUserFilter(
          new ModelFilterTable(
            [new Filter('id', '=', this.userChangingPassword.id.toString())],
            new Pagination(1, 0),
            new Sort('id', true),
          ),
        )
        .subscribe({
          next: (response: any) => {
            if (response?.data?.content?.[0]) {
              const fullUser = response.data.content[0];
              const updatedUser = new ModelUser(
                fullUser.id,
                fullUser.name,
                fullUser.email,
                hashedNewPassword,
                fullUser.userRoles,
                fullUser.status,
              );

              this.securityService.createUser(updatedUser).subscribe({
                next: () => {
                  this.toastService.showSuccess(
                    'Seguridad',
                    'Contraseña actualizada exitosamente',
                  );
                  this.togglePasswordOffcanvas();
                },
                error: (err) => {
                  console.error('Error updating password:', err);
                  this.toastService.showError(
                    'Error',
                    'No se pudo actualizar la contraseña',
                  );
                },
              });
            }
          },
          error: (err) => {
            console.error('Error fetching user for password update:', err);
          },
        });
    } catch (error) {
      console.error('Error in onUpdatePassword:', error);
    }
  }
}
