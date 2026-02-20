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
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { OwnerService } from 'src/app/services/owner.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ToastService } from 'src/app/services/toast.service';
import { ModelRole } from '../../models/user-model';
import { CommonService } from '../../services/common.service';
import { CustomValidators } from 'src/app/utils/custom-validators';

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
        documentType: [null, [Validators.required]],
        documentNumber: [
          '',
          [
            Validators.required,
            CustomValidators.duplicateValueValidator(
              this.allOwners,
              'documentNumber',
              this.editingOwner?.id,
            ),
          ],
        ],
        cellPhone: [
          '',
          [Validators.required, CustomValidators.phoneValidator()],
        ],
        birthdate: ['', [Validators.required]],
        city: [null, [Validators.required]],
        gender: ['', [Validators.required]],
        vehicleCount: [0, [Validators.required, Validators.min(0)]],
        email: [
          '',
          [
            Validators.required,
            Validators.email,
            CustomValidators.duplicateValueValidator(
              this.allOwners,
              'email',
              this.editingOwner?.id,
            ),
          ],
        ],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: [CustomValidators.passwordMatchValidator],
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
    if (s === 3) return 'FUERTE';
    if (s === 4) return 'EXCELENTE';
    return '';
  }

  toggleOffcanvas(owner?: ModelOwner): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
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
        email: owner.email,
      });

      // Update validators to include the current owner's ID for duplication checks
      this.ownerForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          CustomValidators.duplicateValueValidator(
            this.allOwners,
            'documentNumber',
            this.editingOwner.id,
          ),
        ]);
      this.ownerForm
        .get('email')
        ?.setValidators([
          Validators.required,
          Validators.email,
          CustomValidators.duplicateValueValidator(
            this.allOwners,
            'email',
            this.editingOwner.id,
          ),
        ]);
      this.ownerForm.get('documentNumber')?.updateValueAndValidity();
      this.ownerForm.get('email')?.updateValueAndValidity();

      // Disable document type in edit mode
      this.ownerForm.get('documentType')?.disable();
    } else {
      this.editingOwner = null;
      this.ownerForm.reset({
        name: '',
        documentType: null,
        documentNumber: '',
        cellPhone: '',
        birthdate: '',
        city: null,
        gender: '',
        vehicleCount: 0,
        email: '',
        password: '',
        confirmPassword: '',
      });

      // Reset validators for generic list check
      this.ownerForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          CustomValidators.duplicateValueValidator(
            this.allOwners,
            'documentNumber',
            null,
          ),
        ]);
      this.ownerForm
        .get('email')
        ?.setValidators([
          Validators.required,
          Validators.email,
          CustomValidators.duplicateValueValidator(
            this.allOwners,
            'email',
            null,
          ),
        ]);
      this.ownerForm.get('documentNumber')?.updateValueAndValidity();
      this.ownerForm.get('email')?.updateValueAndValidity();

      this.ownerForm.get('documentType')?.enable();
    }
  }

  onSubmit(): void {
    if (this.ownerForm.valid) {
      console.log('Form Submitted:', this.ownerForm.getRawValue());
      // Logic for save/update would go here
      this.toggleOffcanvas();
      this.toastService.showSuccess(
        'Propietarios',
        this.editingOwner
          ? 'Propietario actualizado exitosamente'
          : 'Propietario creado exitosamente',
      );
    } else {
      this.ownerForm.markAllAsTouched();
    }
  }

  loadOwners(): void {
    const filter = new ModelFilterTable(
      [],
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.allOwners = response.data.content;
          this.calculateStats();
          this.applyFilter();
        }
      },
      error: (err) => console.error('Error loading owners:', err),
    });
  }

  calculateStats(): void {
    this.totalOwners = this.allOwners.length;
    this.activeOwners = this.allOwners.filter(
      (p) => p.user?.status === 'Active',
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
    const input = event.target.value.replaceAll(/\D/g, ''); // Remove non-digits
    const formatted = this.applyPhoneMask(input);
    this.ownerForm.get('cellPhone')?.setValue(formatted, { emitEvent: true });
  }

  private applyPhoneMask(input: string): string {
    let unmasked = input.replaceAll(/\D/g, '');
    if (unmasked.length > 10) {
      unmasked = unmasked.substring(0, 10);
    }

    let formatted = '';
    if (unmasked.length > 0) {
      formatted = unmasked.substring(0, 3);
    }
    if (unmasked.length > 3) {
      formatted += ' ' + unmasked.substring(3, 6);
    }
    if (unmasked.length > 6) {
      formatted += ' ' + unmasked.substring(6, 8);
    }
    if (unmasked.length > 8) {
      formatted += ' ' + unmasked.substring(8, 10);
    }

    return formatted;
  }
}
