import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
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
import { GCardUserComponent } from '../../components/g-card-user/g-card-user.component';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, GCardUserComponent, ReactiveFormsModule, FormsModule],
  templateUrl: './security.component.html',
  styleUrls: ['./security.component.scss'],
})
export class SecurityComponent implements OnInit {
  users: User[] = [];
  allUsers: User[] = [];
  totalUsers: number = 0;
  searchTerm: string = '';
  activeFilter: string = 'Todos';
  filters: string[] = ['Todos'];
  rows: number = 10;
  page: number = 0;

  userForm: FormGroup;
  isOffcanvasOpen: boolean = false;
  editingUser: User | null = null;
  availableRoles: ModelRole[] = [];

  constructor(
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
    private readonly fb: FormBuilder,
  ) {
    this.userForm = this.fb.group(
      {
        name: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
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

  ngOnInit(): void {
    this.loadRoles();
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
      },
      error: (err) => {
        console.error('Error loading users:', err);
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
      status: u.status === 'Active' ? 'online' : 'offline',
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
    if (s <= 1) return 'DÉBIL';
    if (s === 2) return 'MEDIA';
    if (s === 3) return 'BUENA';
    return 'FUERTE';
  }

  setFilter(filter: string): void {
    this.activeFilter = filter;
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

  toggleOffcanvas(user?: User): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
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
          this.editingUser?.status === 'online' ? 'Active' : 'Inactive', // Simplification
        );

        this.securityService.createUser(userToSave).subscribe({
          next: () => {
            this.toastService.showSuccess(
              'Gestión de Usuarios',
              this.editingUser
                ? 'Usuario actualizado exitosamente!'
                : 'Usuario creado exitosamente!',
            );
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
}
