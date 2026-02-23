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
import { GPasswordCardComponent } from '../../components/g-password-card/g-password-card.component';
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
import { CustomValidators } from 'src/app/utils/custom-validators';

@Component({
  selector: 'app-owners',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GOwnerCardComponent,
    GPasswordCardComponent,
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
  showPassword = false;
  showConfirmPassword = false;

  isPasswordOffcanvasOpen: boolean = false;
  ownerChangingPassword: ModelOwner | null = null;

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
            Validators.maxLength(10),
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
        maxVehicles: [
          0,
          [Validators.required, Validators.min(0), Validators.max(99)],
        ],
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
    if (s <= 1) return 'Débil';
    if (s === 2) return 'Media';
    if (s === 3) return 'Buena';
    if (s === 4) return 'Fuerte';
    return '';
  }

  toggleOffcanvas(owner?: ModelOwner): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    this.showPassword = false;
    this.showConfirmPassword = false;

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
        maxVehicles: owner.maxVehicles,
      });

      // Update validators to include the current owner's ID for duplication checks
      this.ownerForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(10),
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
        maxVehicles: 0,
        email: '',
        password: '',
        confirmPassword: '',
      });

      // Default values: Cédula (usually name 'Cédula de Ciudadanía') and Masculino (usually name 'MASCULINO')
      const cedulaType = this.documentTypes.find((t) =>
        t.name.toUpperCase().includes('CÉDULA'),
      );
      const maleGender = this.genders.find((g) =>
        g.name.toUpperCase().includes('MASCULINO'),
      );

      if (cedulaType)
        this.ownerForm.get('documentType')?.setValue(cedulaType.id);
      if (maleGender) this.ownerForm.get('gender')?.setValue(maleGender.id);

      // Reset validators for generic list check
      this.ownerForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(10),
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

  async onSubmit(): Promise<void> {
    if (this.ownerForm.valid) {
      // Logic for save/update would go here
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
          maxVehicles: formValue.maxVehicles,
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

  togglePasswordOffcanvas(owner?: ModelOwner): void {
    this.isPasswordOffcanvasOpen = !this.isPasswordOffcanvasOpen;
    this.ownerChangingPassword = owner || null;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.ownerChangingPassword || !this.ownerChangingPassword.user?.id) {
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
                this.ownerChangingPassword.user.id.toString(),
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
