import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ModelOwner } from 'src/app/models/owner-model';
import { GOwnerCardComponent } from '../../components/g-owner-card/g-owner-card.component';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { OwnerService } from 'src/app/services/owner.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ToastService } from 'src/app/services/toast.service';
import { ModelRole } from '../../models/user-model';
import { CommonService } from '../../services/common.service';

@Component({
  selector: 'app-owners',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GOwnerCardComponent,
  ],
  templateUrl: './owners.component.html',
  styleUrls: ['./owners.component.scss'],
})
export class OwnersComponent implements OnInit {
  owners: ModelOwner[] = [];
  allOwners: ModelOwner[] = [];
  totalOwners: number = 0;
  activeOwners: number = 0;
  inactiveOwners: number = 0;
  searchTerm: string = '';
  page: number = 0;
  rows: number = 10;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingOwner: ModelOwner | null = null;
  ownerForm: FormGroup;
  availableRoles: ModelRole[] = [];
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly ownerService: OwnerService,
    private readonly commonService: CommonService,
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
  ) {
    this.ownerForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.maxLength(150)]],
        documentType: ['', [Validators.required]],
        documentNumber: ['', [Validators.required]],
        cellPhone: ['', [Validators.required]],
        birthdate: ['', [Validators.required]],
        city: ['', [Validators.required]],
        gender: ['', [Validators.required]],
        vehicleCount: [0, [Validators.required, Validators.min(0)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.loadOwners();
    this.loadReferenceData();
  }

  loadReferenceData(): void {
    this.commonService.getListTypeDocument().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.documentTypes = response.data;
        }
      },
      error: (err) => {
        console.error('Error loading document types:', err);
      },
    });

    this.commonService.getGenders().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.genders = response.data;
        }
      },
      error: (err) => {
        console.error('Error loading genders:', err);
      },
    });

    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data;
        }
      },
      error: (err) => {
        console.error('Error loading cities:', err);
      },
    });
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  get strength(): number {
    const pwd = this.ownerForm.get('password')?.value || '';
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

  toggleOffcanvas(owner?: ModelOwner): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      if (owner) {
        this.editingOwner = owner;
        this.ownerForm.patchValue({
          name: owner.name,
          documentType: owner.documentTypeId,
          documentNumber: owner.documentNumber,
          cellPhone: owner.cellPhone,
          birthdate: owner.birthdate,
          city: owner.cityId,
          gender: owner.genderId,
          vehicleCount: 0,
          email: owner.email,
        });

        // Disable document type in edit mode
        this.ownerForm.get('documentType')?.disable();

        // Make password optional for editing
        this.ownerForm.get('password')?.clearValidators();
        this.ownerForm.get('confirmPassword')?.clearValidators();
        this.ownerForm.get('password')?.updateValueAndValidity();
        this.ownerForm.get('confirmPassword')?.updateValueAndValidity();
      } else {
        this.editingOwner = null;
        this.ownerForm.reset();

        // Enable document type for new owner
        this.ownerForm.get('documentType')?.enable();

        // Set default values
        const defaultDocType = this.documentTypes.find(
          (d) => d.name === 'Cédula de Ciudadanía',
        );
        const defaultGender = this.genders.find((g) => g.name === 'Masculino');

        this.ownerForm.patchValue({
          documentType: defaultDocType ? defaultDocType.id : '',
          gender: defaultGender ? defaultGender.id : '',
        });

        // Restore password validators for new owner
        this.ownerForm
          .get('password')
          ?.setValidators([Validators.required, Validators.minLength(6)]);
        this.ownerForm
          .get('confirmPassword')
          ?.setValidators([Validators.required]);
        this.ownerForm.get('password')?.updateValueAndValidity();
        this.ownerForm.get('confirmPassword')?.updateValueAndValidity();
      }
    } else {
      this.editingOwner = null;
      this.ownerForm.reset();
    }
  }

  async onSubmit(): Promise<void> {
    if (this.ownerForm.valid) {
      try {
        const formValue = this.ownerForm.getRawValue();
        let password = formValue.password;

        if (password) {
          password = await this.securityService.getHashSHA512(password);
        }

        const ownerToSave: ModelOwner = {
          id: this.editingOwner?.id || null,
          name: formValue.name,
          documentTypeId: formValue.documentType,
          documentNumber: formValue.documentNumber,
          cellPhone: formValue.cellPhone,
          birthdate: formValue.birthdate,
          cityId: formValue.city,
          genderId: formValue.gender,
          email: formValue.email,
          password: password || undefined,
          status: this.editingOwner?.status || 'Active',
          photo: this.editingOwner?.photo || '',
        };

        this.ownerService.createOwner(ownerToSave).subscribe({
          next: () => {
            this.toastService.showSuccess(
              'Gestión de Propietarios',
              this.editingOwner
                ? 'Propietario actualizado exitosamente!'
                : 'Propietario creado exitosamente!',
            );
            this.loadOwners();
            this.toggleOffcanvas();
          },
          error: (err) => {
            console.error('Error saving owner:', err);
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
      this.ownerForm.markAllAsTouched();
    }
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalOwners = response.data.totalElements || 0;
          this.allOwners = response.data.content;
          this.calculateStats();
          this.applyFilter();
        } else {
          this.allOwners = [];
          this.owners = [];
          this.calculateStats();
        }
      },
      error: (err) => {
        console.error('Error loading users:', err);
      },
    });
  }

  calculateStats(): void {
    this.totalOwners = this.allOwners.length;
    this.activeOwners = this.allOwners.filter(
      (p) => p.status === 'Active',
    ).length;
    this.inactiveOwners = this.totalOwners - this.activeOwners;
  }

  applyFilter(): void {
    let filtered = this.allOwners;

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

  allowOnlyNumbers(event: any): void {
    const pattern = /[0-9]/;
    const inputChar = String.fromCharCode(event.charCode);

    if (!pattern.test(inputChar)) {
      event.preventDefault();
    }
  }

  formatCellPhone(event: any): void {
    let input = event.target.value.replace(/\D/g, ''); // Remove non-digits
    if (input.length > 10) {
      input = input.substring(0, 10);
    }

    // Format as XXX XXX XX XX
    if (input.length > 3) {
      input = input.substring(0, 3) + ' ' + input.substring(3);
    }
    if (input.length > 7) {
      input = input.substring(0, 7) + ' ' + input.substring(7);
    }
    if (input.length > 10) {
      input = input.substring(0, 10) + ' ' + input.substring(10);
    }

    // Update the control value
    this.ownerForm.get('cellPhone')?.setValue(input, { emitEvent: false });
  }
}
