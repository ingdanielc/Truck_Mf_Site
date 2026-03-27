import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';
import { ModelOwner } from 'src/app/models/owner-model';
import {
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { CommonService } from 'src/app/services/common.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';
import { ToastService } from 'src/app/services/toast.service';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { SecurityService } from 'src/app/services/security/security.service';

@Component({
  selector: 'g-owner-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, GCameraComponent],
  templateUrl: './g-owner-form.component.html',
  styleUrls: ['./g-owner-form.component.scss'],
})
export class GOwnerFormComponent implements OnInit, OnChanges {
  @Input() owner: ModelOwner | null = null;
  @Input() isOpen: boolean = false;
  @Output() saved = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  ownerForm: FormGroup;
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];
  allOwners: ModelOwner[] = [];

  maxDate: string = '';
  defaultBirthdate: string = '';

  showPassword = false;
  showConfirmPassword = false;

  showCamera = false;
  photoPreview: string = '';
  photoFile: File | Blob | null = null;
  licenseCategories: any[] = [
    { id: 'a1', name: 'A1' },
    { id: 'a2', name: 'A2' },
    { id: 'b1', name: 'B1' },
    { id: 'b2', name: 'B2' },
    { id: 'b3', name: 'B3' },
    { id: 'c1', name: 'C1' },
    { id: 'c2', name: 'C2' },
    { id: 'c3', name: 'C3' },
  ];
  private initialFormValue: string = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly ownerService: OwnerService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly driverService: DriverService,
  ) {
    this.ownerForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.maxLength(150)]],
        documentType: [null, [Validators.required]],
        documentNumber: ['', [Validators.required, Validators.maxLength(13)]],
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
          {
            validators: [Validators.required, Validators.email],
            asyncValidators: [],
            updateOn: 'blur',
          },
        ],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        isDriver: [false],
        licenseCategory: [null],
        licenseExpiry: [''],
      },
      {
        validators: [CustomValidators.passwordMatchValidator],
      },
    );
    this.calculateDates();
  }

  ngOnInit(): void {
    this.loadReferenceData();
    this.ownerForm.get('isDriver')?.valueChanges.subscribe((isDriver) => {
      this.updateLicenseValidators(isDriver);
    });
  }

  private updateLicenseValidators(isDriver: boolean): void {
    const categoryControl = this.ownerForm.get('licenseCategory');
    const expiryControl = this.ownerForm.get('licenseExpiry');

    if (isDriver) {
      categoryControl?.setValidators([Validators.required]);
      expiryControl?.setValidators([Validators.required]);
    } else {
      categoryControl?.clearValidators();
      expiryControl?.clearValidators();
      categoryControl?.setValue(null);
      expiryControl?.setValue('');
    }
    categoryControl?.updateValueAndValidity();
    expiryControl?.updateValueAndValidity();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && changes['isOpen'].currentValue) {
      if (this.owner) {
        this.patchForm(this.owner);
      } else {
        this.resetForm();
      }
    }
  }

  private calculateDates(): void {
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];

    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(today.getFullYear() - 18);
    this.defaultBirthdate = eighteenYearsAgo.toISOString().split('T')[0];
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

  loadReferenceData(): void {
    this.commonService.getListTypeDocument().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.documentTypes = response.data;
          if (!this.owner) {
            const cedulaType = this.documentTypes.find((t: any) =>
              t.name.toUpperCase().includes('CÉDULA'),
            );
            if (cedulaType)
              this.ownerForm.get('documentType')?.setValue(cedulaType.id);
          }
        }
      },
    });

    this.commonService.getGenders().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.genders = response.data;
          if (!this.owner) {
            const maleGender = this.genders.find((g: any) =>
              g.name.toUpperCase().includes('MASCULINO'),
            );
            if (maleGender)
              this.ownerForm.get('gender')?.setValue(maleGender.id);
          }
        }
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
    });

    this.ownerService
      .getOwnerFilter(
        new ModelFilterTable(
          [],
          new Pagination(10000, 0),
          new Sort('id', true),
        ),
      )
      .subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.allOwners = res.data.content;
          }
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

  patchForm(owner: ModelOwner): void {
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
      isDriver: owner.isDriver || false,
      licenseCategory: owner.licenseCategory || null,
      licenseExpiry: owner.licenseExpiry
        ? owner.licenseExpiry.split('T')[0]
        : '',
    });
    this.photoPreview = owner.photo || '';

    this.ownerForm
      .get('documentNumber')
      ?.setValidators([
        Validators.required,
        Validators.maxLength(13),
        CustomValidators.duplicateValueValidator(
          this.allOwners,
          'documentNumber',
          owner.id,
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
          owner.id,
        ),
      ]);
    this.ownerForm
      .get('email')
      ?.setAsyncValidators([
        CustomValidators.emailGlobalUniquenessValidator(
          this.securityService,
          this.driverService,
          owner.user?.id,
          owner.id,
          owner.email,
        ),
      ]);

    this.ownerForm.get('documentNumber')?.updateValueAndValidity();
    this.ownerForm.get('documentType')?.disable();

    this.ownerForm.get('password')?.clearValidators();
    this.ownerForm.get('confirmPassword')?.clearValidators();
    this.ownerForm.get('password')?.updateValueAndValidity();
    this.ownerForm.get('confirmPassword')?.updateValueAndValidity();

    this.captureInitialState();
  }

  resetForm(): void {
    this.ownerForm.reset({
      birthdate: this.defaultBirthdate,
      isDriver: false,
      licenseCategory: null,
      licenseExpiry: '',
    });
    this.ownerForm.get('documentType')?.enable();
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
        CustomValidators.duplicateValueValidator(this.allOwners, 'email', null),
      ]);
    this.ownerForm
      .get('email')
      ?.setAsyncValidators([
        CustomValidators.emailGlobalUniquenessValidator(
          this.securityService,
          this.driverService,
          null,
          null,
          null,
        ),
      ]);
    this.ownerForm.get('documentNumber')?.updateValueAndValidity();

    this.ownerForm
      .get('password')
      ?.setValidators([Validators.required, Validators.minLength(6)]);
    this.ownerForm.get('confirmPassword')?.setValidators([Validators.required]);
    this.ownerForm.get('password')?.updateValueAndValidity();
    this.ownerForm.get('confirmPassword')?.updateValueAndValidity();

    if (this.documentTypes.length > 0) {
      const cedulaType = this.documentTypes.find((t: any) =>
        t.name.toUpperCase().includes('CÉDULA'),
      );
      if (cedulaType)
        this.ownerForm.get('documentType')?.setValue(cedulaType.id);
    }

    if (this.genders.length > 0) {
      const maleGender = this.genders.find((g: any) =>
        g.name.toUpperCase().includes('MASCULINO'),
      );
      if (maleGender) this.ownerForm.get('gender')?.setValue(maleGender.id);
    }

    this.showConfirmPassword = false;
    this.photoPreview = '';
    this.photoFile = null;

    this.captureInitialState();
  }

  closeOffcanvas(): void {
    this.closed.emit();
  }

  async onSubmit(): Promise<void> {
    if (this.ownerForm.valid) {
      try {
        const formValue = this.ownerForm.getRawValue();
        const password = formValue.password
          ? btoa(formValue.password)
          : undefined;

        if (this.owner) {
          // EDICIÓN: subir foto primero (si hay nueva), luego guardar
          let photoUrl = this.owner.photo || '';

          if (this.photoFile) {
            try {
              const uploadRes = await firstValueFrom(
                this.commonService.uploadPhoto(
                  'owner',
                  this.owner.id!,
                  this.photoFile,
                ),
              );
              photoUrl = uploadRes?.data || photoUrl;
            } catch (uploadErr) {
              console.error('Error uploading photo:', uploadErr);
            }
          }

          const documentNumber = formValue.documentNumber.replaceAll(/\D/g, '');
          const ownerToSave: ModelOwner = {
            id: this.owner.id,
            name: formValue.name,
            documentTypeId: formValue.documentType,
            documentNumber: documentNumber,
            cellPhone: formValue.cellPhone,
            birthdate: formValue.birthdate,
            cityId: formValue.city,
            genderId: formValue.gender,
            email: formValue.email,
            maxVehicles: formValue.maxVehicles,
            isDriver: formValue.isDriver,
            licenseCategory: formValue.licenseCategory,
            licenseExpiry: formValue.licenseExpiry,
            licenseNumber: formValue.isDriver ? documentNumber : undefined,
            password: password || undefined,
            status: this.owner.status || 'Activo',
            photo: photoUrl,
          };

          this.ownerService.createOwner(ownerToSave).subscribe({
            next: () => {
              this.toastService.showSuccess(
                'Gestión de Propietarios',
                'Propietario actualizado exitosamente!',
              );
              this.saved.emit();
              this.closeOffcanvas();
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
          const documentNumber = formValue.documentNumber.replaceAll(/\D/g, '');
          const ownerToSave: ModelOwner = {
            id: null,
            name: formValue.name,
            documentTypeId: formValue.documentType,
            documentNumber: documentNumber,
            cellPhone: formValue.cellPhone,
            birthdate: formValue.birthdate,
            cityId: formValue.city,
            genderId: formValue.gender,
            email: formValue.email,
            maxVehicles: formValue.maxVehicles,
            isDriver: formValue.isDriver,
            licenseCategory: formValue.licenseCategory,
            licenseExpiry: formValue.licenseExpiry,
            licenseNumber: formValue.isDriver ? documentNumber : undefined,
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
                    // Actualizar owner con la URL de la foto (sin enviar password de nuevo)
                    const { password, ...ownerWithPhoto } = {
                      ...savedOwner,
                      photo: photoUrl,
                    };
                    this.ownerService
                      .createOwner(ownerWithPhoto as ModelOwner)
                      .subscribe({
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
              this.saved.emit();
              this.closeOffcanvas();
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

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Validar con CustomValidators para feedback de errores, corrección de orientación y redimensionamiento
    CustomValidators.readPhotoFile(event).then(
      (res) => {
        this.photoFile = res.blob;
        this.photoPreview = res.base64;
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

  allowOnlyNumbers(event: any): void {
    const pattern = /[0-9]/;
    const inputChar = String.fromCodePoint(event.charCode);
    if (!pattern.test(inputChar)) {
      event.preventDefault();
    }
  }

  onDocumentNumberInput(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, '');
    const formatted = this.applyDocumentNumberMask(input);
    this.ownerForm
      .get('documentNumber')
      ?.setValue(formatted, { emitEvent: false });
    this.ownerForm.get('documentNumber')?.markAsDirty();
  }

  private applyDocumentNumberMask(value: string): string {
    if (!value) return '';
    const numericValue = Number(value.replaceAll(/\D/g, ''));
    if (Number.isNaN(numericValue)) return '';
    return new Intl.NumberFormat('es-CO').format(numericValue);
  }

  formatCellPhone(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, '');
    const formatted = this.applyPhoneMask(input);
    this.ownerForm.get('cellPhone')?.setValue(formatted, { emitEvent: true });
    this.ownerForm.get('cellPhone')?.markAsDirty();
  }

  private applyPhoneMask(input: string): string {
    let unmasked = input.replaceAll(/\D/g, '');
    if (unmasked.length > 10) unmasked = unmasked.substring(0, 10);
    let formatted = '';
    if (unmasked.length > 0) formatted = unmasked.substring(0, 3);
    if (unmasked.length > 3) formatted += ' ' + unmasked.substring(3, 6);
    if (unmasked.length > 6) formatted += ' ' + unmasked.substring(6, 8);
    if (unmasked.length > 8) formatted += ' ' + unmasked.substring(8, 10);
    return formatted;
  }

  get canSave(): boolean {
    return this.ownerForm.valid && (this.isModified || !!this.photoFile);
  }

  private captureInitialState(): void {
    this.initialFormValue = JSON.stringify(this.getNormalizedFormValue());
  }

  get isModified(): boolean {
    return (
      JSON.stringify(this.getNormalizedFormValue()) !== this.initialFormValue
    );
  }

  private getNormalizedFormValue(): any {
    const raw = this.ownerForm.getRawValue();
    const normalized: any = {};
    Object.keys(raw).forEach((key) => {
      let val = raw[key];
      if (val === undefined || val === null) val = null;
      if (typeof val === 'number') val = String(val);
      normalized[key] = val;
    });
    return normalized;
  }
}
