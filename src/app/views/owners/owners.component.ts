import { Component, OnDestroy, OnInit } from '@angular/core';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';

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
import { Subscription, firstValueFrom } from 'rxjs';
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
    FormsModule,
    ReactiveFormsModule,
    GOwnerCardComponent,
    GPasswordCardComponent,
    GCameraComponent,
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
  page: number = 0;
  rows: number = 9;

  userRole: string = 'ROL';
  private userSub?: Subscription;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingOwner: ModelOwner | null = null;
  ownerForm: FormGroup;
  availableRoles: ModelRole[] = [];
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];

  showCamera: boolean = false;
  showPassword = false;
  showConfirmPassword = false;

  photoFile: File | Blob | null = null;
  photoPreview: string = '';

  isPasswordOffcanvasOpen: boolean = false;
  ownerChangingPassword: ModelOwner | null = null;

  maxDate: string = '';
  defaultBirthdate: string = '';

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
            Validators.maxLength(13),
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
    this.calculateDates();
  }

  private calculateDates(): void {
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];

    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(today.getFullYear() - 18);
    this.defaultBirthdate = eighteenYearsAgo.toISOString().split('T')[0];
  }

  ngOnInit(): void {
    this.subscribeToUserContext();
    this.loadReferenceData();
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
          this.cities = response.data.sort((a: any, b: any) => {
            const stateCmp = (a.state || '').localeCompare(b.state || '', 'es');
            return stateCmp !== 0
              ? stateCmp
              : a.name.localeCompare(b.name, 'es');
          });
          this.groupedCities = this.buildGroupedCities();
        }
      },
      error: (err) => {
        console.error('Error loading cities:', err);
      },
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
        documentNumber: this.applyDocumentNumberMask(
          String(owner.documentNumber || ''),
        ),
        cellPhone: owner.cellPhone,
        birthdate: owner.birthdate ? owner.birthdate.split('T')[0] : '',
        city: owner.cityId,
        gender: owner.genderId,
        email: owner.email,
        maxVehicles: owner.maxVehicles,
      });
      this.photoFile = null;
      this.photoPreview = owner.photo || '';

      // Update validators to include the current owner's ID for duplication checks
      this.ownerForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(13),
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

      // Clear password validators in edit mode as they are hidden
      this.ownerForm.get('password')?.clearValidators();
      this.ownerForm.get('confirmPassword')?.clearValidators();
      this.ownerForm.get('password')?.updateValueAndValidity();
      this.ownerForm.get('confirmPassword')?.updateValueAndValidity();
    } else {
      this.editingOwner = null;
      this.photoFile = null;
      this.photoPreview = '';
      this.ownerForm.reset({
        name: '',
        documentType: null,
        documentNumber: '',
        cellPhone: '',
        birthdate: this.defaultBirthdate,
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
          Validators.maxLength(13),
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

      // Restore password validators for create mode
      this.ownerForm
        .get('password')
        ?.setValidators([Validators.required, Validators.minLength(6)]);
      this.ownerForm
        .get('confirmPassword')
        ?.setValidators([Validators.required]);
      this.ownerForm.get('password')?.updateValueAndValidity();
      this.ownerForm.get('confirmPassword')?.updateValueAndValidity();
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

        if (this.editingOwner) {
          // EDICIÓN: subir foto primero (si hay nueva), luego guardar
          let photoUrl = this.editingOwner.photo || '';

          if (this.photoFile) {
            try {
              const uploadRes = await firstValueFrom(
                this.commonService.uploadPhoto(
                  'owner',
                  this.editingOwner.id!,
                  this.photoFile,
                ),
              );
              photoUrl = uploadRes?.data || photoUrl;
            } catch (uploadErr) {
              console.error('Error uploading photo:', uploadErr);
            }
          }

          const ownerToSave: ModelOwner = {
            id: this.editingOwner.id,
            name: formValue.name,
            documentTypeId: formValue.documentType,
            documentNumber: formValue.documentNumber.replaceAll(/\D/g, ''),
            cellPhone: formValue.cellPhone,
            birthdate: formValue.birthdate,
            cityId: formValue.city,
            genderId: formValue.gender,
            email: formValue.email,
            maxVehicles: formValue.maxVehicles,
            password: password || undefined,
            status: this.editingOwner.status || 'Activo',
            photo: photoUrl,
          };

          this.ownerService.createOwner(ownerToSave).subscribe({
            next: () => {
              this.toastService.showSuccess(
                'Gestión de Propietarios',
                'Propietario actualizado exitosamente!',
              );
              this.toggleOffcanvas();
              this.loadOwners();
            },
            error: (err) => {
              console.error('Error saving owner:', err);
              this.toastService.showError(
                'Error',
                'No se pudo procesar la solicitud. Por favor, intente de nuevo.',
              );
            },
          });
        } else {
          // CREACIÓN: guardar owner primero, obtener ID, luego subir foto
          const ownerToSave: ModelOwner = {
            id: null,
            name: formValue.name,
            documentTypeId: formValue.documentType,
            documentNumber: formValue.documentNumber.replaceAll(/\D/g, ''),
            cellPhone: formValue.cellPhone,
            birthdate: formValue.birthdate,
            cityId: formValue.city,
            genderId: formValue.gender,
            email: formValue.email,
            maxVehicles: formValue.maxVehicles,
            password: password || undefined,
            status: 'Activo',
            photo: '',
          };

          this.ownerService.createOwner(ownerToSave).subscribe({
            next: async (response: any) => {
              const savedOwner = response?.data;
              const newId: number | null = savedOwner?.id ?? null;

              // Subir foto si hay archivo y se obtuvo el ID
              if (this.photoFile && newId) {
                try {
                  const uploadRes = await firstValueFrom(
                    this.commonService.uploadPhoto(
                      'owner',
                      newId,
                      this.photoFile,
                    ),
                  );
                  const photoUrl = uploadRes?.data || '';

                  if (photoUrl) {
                    // Actualizar owner con la URL de la foto
                    const ownerWithPhoto: ModelOwner = {
                      ...savedOwner,
                      photo: photoUrl,
                    };
                    this.ownerService.createOwner(ownerWithPhoto).subscribe({
                      error: (err) =>
                        console.error('Error updating photo URL:', err),
                    });
                  }
                } catch (uploadErr) {
                  console.error(
                    'Error uploading photo after create:',
                    uploadErr,
                  );
                }
              }

              this.toastService.showSuccess(
                'Gestión de Propietarios',
                'Propietario creado exitosamente!',
              );
              this.toggleOffcanvas();
              this.loadOwners();
            },
            error: (err) => {
              console.error('Error saving owner:', err);
              this.toastService.showError(
                'Error',
                'No se pudo procesar la solicitud. Por favor, intente de nuevo.',
              );
            },
          });
        }
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
      new Sort('name', false),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalOwners = response.data.totalElements || 0;
          this.allOwners = response.data.content;
          this.calculateStats();
          this.applyFilter();
        }
      },
      error: (err) => console.error('Error loading owners:', err),
    });
  }

  calculateStats(): void {
    this.activeOwners = this.allOwners.filter(
      (p) => p.user?.status === 'Activo',
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

  allowOnlyNumbers(event: any): void {
    const pattern = /[0-9]/;
    const inputChar = String.fromCodePoint(event.charCode);

    if (!pattern.test(inputChar)) {
      event.preventDefault();
    }
  }

  onDocumentNumberInput(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, ''); // Remove non-digits
    const formatted = this.applyDocumentNumberMask(input);
    this.ownerForm
      .get('documentNumber')
      ?.setValue(formatted, { emitEvent: false });
  }

  private applyDocumentNumberMask(value: string): string {
    if (!value) return '';
    const numericValue = Number(value.replaceAll(/\D/g, ''));
    if (Number.isNaN(numericValue)) return '';
    return new Intl.NumberFormat('es-CO').format(numericValue);
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
    if (!this.ownerChangingPassword?.user?.id) {
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

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validar con CustomValidators para feedback de errores
    CustomValidators.readPhotoFile(event).then(
      (base64) => {
        this.photoFile = file;
        this.photoPreview = base64;
      },
      (err) => this.toastService.showError('Error', err),
    );
  }

  removePhoto(): void {
    this.photoFile = null;
    this.photoPreview = '';
  }

  onCameraCapture(dataUrl: string): void {
    // La cámara devuelve un data URL; convertir a Blob para poder subir
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    this.photoFile = new Blob([ab], { type: mimeType });
    this.photoPreview = dataUrl;
    this.showCamera = false;
  }

  onCameraClose(): void {
    this.showCamera = false;
  }
}
