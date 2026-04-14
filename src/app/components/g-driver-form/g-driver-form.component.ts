import {
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  SimpleChanges,
  OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GCameraComponent } from 'src/app/components/g-camera/g-camera.component';
import { ModelDriver } from 'src/app/models/driver-model';
import { ModelOwner } from 'src/app/models/owner-model';
import { DriverService } from 'src/app/services/driver.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { SecurityService } from 'src/app/services/security/security.service';

@Component({
  selector: 'g-driver-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, GCameraComponent],
  templateUrl: './g-driver-form.component.html',
  styleUrls: ['./g-driver-form.component.scss'],
})
export class GDriverFormComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() driver: ModelDriver | null = null;
  @Input() allDrivers: ModelDriver[] = [];
  @Input() userRole: string = '';
  @Input() loggedInOwnerId: number | null = null;
  @Input() owners: ModelOwner[] = [];
  @Input() documentTypes: any[] = [];
  @Input() genders: any[] = [];
  @Input() cities: any[] = [];
  @Input() salaryTypes: any[] = [];

  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  driverForm!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;
  isSaving = false;
  showCamera = false;
  photoFile: File | Blob | null = null;
  photoPreview: string = '';
  private initialFormValue: string = '';
  groupedCities: { state: string; cities: any[] }[] = [];
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
  showAccessData: boolean = false;
  salaryLabel: string = 'Valor Salario';
  maxDate: string = '';
  defaultBirthdate: string = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly driverService: DriverService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
  ) {
    this.initForm();
    this.calculateDates();
  }

  ngOnInit(): void {
    this.driverForm.get('salaryTypeId')?.valueChanges.subscribe((value) => {
      this.updateSalaryValidators(value);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.resetOrFillForm();
    }
    if (changes['cities'] && this.cities.length > 0) {
      this.groupedCities = this.buildGroupedCities();
    }
  }

  private initForm(): void {
    this.driverForm = this.fb.group(
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
        gender: [null, [Validators.required]],
        licenseCategory: [null, [Validators.required]],
        licenseExpiry: ['', [Validators.required]],
        email: [
          '',
          {
            validators: [Validators.required, Validators.email],
            updateOn: 'blur',
          },
        ],
        password: [''],
        confirmPassword: [''],
        ownerId: [null, [Validators.required]],
        salaryTypeId: [null, [Validators.required]],
        salary: [null],
      },
      {
        validators: [CustomValidators.passwordMatchValidator],
      },
    );
  }

  private calculateDates(): void {
    const today = new Date();
    this.maxDate = today.toISOString().split('T')[0];
    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(today.getFullYear() - 18);
    this.defaultBirthdate = eighteenYearsAgo.toISOString().split('T')[0];
  }

  private resetOrFillForm(): void {
    this.photoFile = null;
    this.showPassword = false;
    this.showConfirmPassword = false;

    if (this.driver?.id) {
      this.photoPreview = this.driver.photo || '';
      this.driverForm.patchValue({
        name: this.driver.name,
        documentType: this.driver.documentTypeId,
        documentNumber: this.applyNumberMask(
          String(this.driver.documentNumber || ''),
        ),
        cellPhone: this.driver.cellPhone,
        birthdate: this.driver.birthdate
          ? this.driver.birthdate.split('T')[0]
          : '',
        city: this.driver.cityId,
        gender: this.driver.genderId,
        licenseCategory: this.driver.licenseCategory,
        licenseExpiry: this.driver.licenseExpiry
          ? this.driver.licenseExpiry.split('T')[0]
          : '',
        email: this.driver.email,
        password: '',
        confirmPassword: '',
        ownerId: this.driver.ownerId,
        salaryTypeId: this.driver.salaryTypeId,
        salary: this.applyNumberMask(String(this.driver.salary || '')),
      });

      this.showAccessData = !!this.driver.user;
      this.driverForm.get('documentType')?.disable();
      this.driverForm.get('password')?.clearValidators();
      this.driverForm.get('confirmPassword')?.clearValidators();

      // Update validators for edit mode
      this.driverForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(13),
          CustomValidators.duplicateValueValidator(
            this.allDrivers,
            'documentNumber',
            this.driver.id,
          ),
        ]);
      this.driverForm
        .get('email')
        ?.setValidators([
          Validators.email,
          CustomValidators.duplicateValueValidator(
            this.allDrivers,
            'email',
            this.driver.id,
          ),
        ]);
      this.driverForm
        .get('email')
        ?.setAsyncValidators([
          CustomValidators.emailGlobalUniquenessValidator(
            this.securityService,
            this.driverService,
            this.driver.user?.id,
            this.driver.id,
            this.driver.email,
          ),
        ]);

      this.updateSalaryValidators(this.driver.salaryTypeId || null);
      this.captureInitialState();
    } else {
      this.photoPreview = '';
      this.driverForm.reset({
        name: '',
        documentNumber: '',
        cellPhone: '',
        birthdate: this.defaultBirthdate,
        licenseExpiry: '',
        email: '',
        password: '',
        confirmPassword: '',
        ownerId:
          this.driver?.ownerId ||
          (this.userRole === 'ADMINISTRADOR' ? null : this.loggedInOwnerId),
        salaryTypeId: null,
        salary: null,
      });

      this.showAccessData = false;
      this.driverForm.get('documentType')?.enable();

      // Set default values
      const cedulaType = this.documentTypes.find((t) =>
        t.name.toUpperCase().includes('CÉDULA'),
      );
      const maleGender = this.genders.find((g) =>
        g.name.toUpperCase().includes('MASCULINO'),
      );
      if (cedulaType)
        this.driverForm.get('documentType')?.setValue(cedulaType.id);
      if (maleGender) this.driverForm.get('gender')?.setValue(maleGender.id);

      // Reset validators for create mode
      this.driverForm
        .get('documentNumber')
        ?.setValidators([
          Validators.required,
          Validators.maxLength(13),
          CustomValidators.duplicateValueValidator(
            this.allDrivers,
            'documentNumber',
            null,
          ),
        ]);
      this.driverForm
        .get('email')
        ?.setValidators([
          Validators.email,
          CustomValidators.duplicateValueValidator(
            this.allDrivers,
            'email',
            null,
          ),
        ]);
      this.driverForm
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
      this.updateSalaryValidators(null);
    }

    this.driverForm.get('documentNumber')?.updateValueAndValidity();
    this.driverForm.get('password')?.updateValueAndValidity();
    this.driverForm.get('confirmPassword')?.updateValueAndValidity();

    if (this.userRole === 'CONDUCTOR') {
      this.driverForm.get('salaryTypeId')?.disable({ emitEvent: false });
      this.driverForm.get('salary')?.disable({ emitEvent: false });
    } else {
      this.driverForm.get('salaryTypeId')?.enable({ emitEvent: false });
      this.driverForm.get('salary')?.enable({ emitEvent: false });
    }
    this.captureInitialState();
  }

  updateSalaryValidators(salaryTypeId: number | null): void {
    const salaryControl = this.driverForm.get('salary');
    if (!salaryTypeId) {
      this.salaryLabel = 'Valor Salario';
      salaryControl?.clearValidators();
      salaryControl?.updateValueAndValidity();
      return;
    }
    const selectedType = this.salaryTypes.find(
      (t) => t.id === Number(salaryTypeId),
    );
    if (selectedType?.name.toUpperCase().includes('PORCENTAJE')) {
      this.salaryLabel = 'Porcentaje';
      salaryControl?.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(100),
      ]);
    } else {
      this.salaryLabel = 'Valor Salario';
      salaryControl?.setValidators([
        Validators.required,
        Validators.min(1),
        Validators.max(99999999),
      ]);
    }
    salaryControl?.updateValueAndValidity();
    if (salaryControl?.value) {
      const masked = this.applyNumberMask(salaryControl.value.toString());
      salaryControl.setValue(masked, { emitEvent: false });
    }
  }

  onSalaryInput(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, '');
    const formatted = this.applyNumberMask(input);
    this.driverForm.get('salary')?.setValue(formatted, { emitEvent: false });
    this.driverForm.get('salary')?.markAsDirty();
  }

  onDocumentNumberInput(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, '');
    const formatted = this.applyNumberMask(input);
    this.driverForm
      .get('documentNumber')
      ?.setValue(formatted, { emitEvent: false });
    this.driverForm.get('documentNumber')?.markAsDirty();
  }

  private applyNumberMask(value: string): string {
    if (!value) return '';
    const numericValue = Number(value.replaceAll(/\D/g, ''));
    if (Number.isNaN(numericValue)) return '';
    return new Intl.NumberFormat('es-CO').format(numericValue);
  }

  formatCellPhone(event: any): void {
    let input = event.target.value.replaceAll(/\D/g, '');
    if (input.length > 10) input = input.substring(0, 10);
    let formatted = '';
    if (input.length > 0) formatted += input.substring(0, 3);
    if (input.length > 3) formatted += ' ' + input.substring(3, 6);
    if (input.length > 6) formatted += ' ' + input.substring(6, 8);
    if (input.length > 8) formatted += ' ' + input.substring(8, 10);
    this.driverForm.get('cellPhone')?.setValue(formatted, { emitEvent: false });
    this.driverForm.get('cellPhone')?.markAsDirty();
  }

  triggerPhotoInput(photoInput: HTMLInputElement): void {
    photoInput.click();
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

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
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.codePointAt(i) ?? 0;
    }
    this.photoFile = new Blob([ab], { type: mimeType });
    this.photoPreview = dataUrl;
    this.showCamera = false;
  }

  onToggleAccessData(event: any): void {
    this.showAccessData = event.target.checked;
    const emailControl = this.driverForm.get('email');
    const passwordControl = this.driverForm.get('password');
    const confirmPasswordControl = this.driverForm.get('confirmPassword');

    if (this.showAccessData) {
      emailControl?.setValidators([
        Validators.required,
        Validators.email,
        CustomValidators.duplicateValueValidator(
          this.allDrivers,
          'email',
          this.driver?.id,
        ),
      ]);
      emailControl?.setAsyncValidators([
        CustomValidators.emailGlobalUniquenessValidator(
          this.securityService,
          this.driverService,
          this.driver?.user?.id,
          this.driver?.id,
          this.driver?.email,
        ),
      ]);
      if (!this.driver?.id) {
        passwordControl?.setValidators([
          Validators.required,
          Validators.minLength(4),
        ]);
        confirmPasswordControl?.setValidators([Validators.required]);
      }
    } else {
      emailControl?.setValidators([
        Validators.required,
        Validators.email,
        CustomValidators.duplicateValueValidator(
          this.allDrivers,
          'email',
          this.driver?.id,
        ),
      ]);
      passwordControl?.clearValidators();
      confirmPasswordControl?.clearValidators();
    }
    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    if (this.driverForm.valid) {
      try {
        const formValue = this.driverForm.getRawValue();
        const password = formValue.password
          ? btoa(formValue.password)
          : undefined;

        if (this.driver?.id) {
          // EDIT
          let photoUrl = this.driver.photo || '';
          if (this.photoFile) {
            try {
              const uploadRes = await firstValueFrom(
                this.commonService.uploadPhoto(
                  'driver',
                  this.driver.id,
                  this.photoFile,
                ),
              );
              photoUrl = uploadRes?.data || photoUrl;
            } catch (uploadErr) {
              console.error('Error uploading photo:', uploadErr);
            }
          }

          const driverToSave: ModelDriver = {
            id: this.driver.id,
            name: formValue.name,
            documentTypeId: formValue.documentType,
            documentNumber: formValue.documentNumber.replaceAll(/\D/g, ''),
            cellPhone: formValue.cellPhone,
            birthdate: formValue.birthdate,
            cityId: formValue.city,
            genderId: formValue.gender,
            licenseCategory: formValue.licenseCategory,
            licenseNumber: formValue.documentNumber.replaceAll(/\D/g, ''),
            licenseExpiry: formValue.licenseExpiry,
            email: formValue.email || undefined,
            password: this.showAccessData ? password || undefined : undefined,
            status: this.driver.status || 'Activo',
            photo: photoUrl,
            ownerId:
              this.userRole === 'ADMINISTRADOR'
                ? formValue.ownerId
                : this.loggedInOwnerId || undefined,
            salaryTypeId: formValue.salaryTypeId,
            salary: formValue.salary
              ? Number(formValue.salary.toString().replaceAll(/\D/g, ''))
              : undefined,
          };

          this.isSaving = true;
          this.driverService.createDriver(driverToSave).subscribe({
            next: () => {
              this.toastService.showSuccess(
                'Gestión de Conductores',
                'Conductor actualizado exitosamente!',
              );
              this.saved.emit();
              this.isSaving = false;
            },
            error: (err) => {
              console.error('Error saving driver:', err);
              this.toastService.showError(
                'Error',
                'No se pudo procesar la solicitud.',
              );
              this.isSaving = false;
            },
          });
        } else {
          // CREATE
          const driverToSave: ModelDriver = {
            id: null,
            name: formValue.name,
            documentTypeId: formValue.documentType,
            documentNumber: formValue.documentNumber.replaceAll(/\D/g, ''),
            cellPhone: formValue.cellPhone,
            birthdate: formValue.birthdate,
            cityId: formValue.city,
            genderId: formValue.gender,
            licenseCategory: formValue.licenseCategory,
            licenseNumber: formValue.documentNumber.replaceAll(/\D/g, ''),
            licenseExpiry: formValue.licenseExpiry,
            email: formValue.email || undefined,
            password: this.showAccessData ? password || undefined : undefined,
            status: 'Activo',
            photo: '',
            ownerId:
              this.userRole === 'ADMINISTRADOR'
                ? formValue.ownerId
                : this.loggedInOwnerId || undefined,
            salaryTypeId: formValue.salaryTypeId,
            salary: formValue.salary
              ? Number(formValue.salary.toString().replaceAll(/\D/g, ''))
              : undefined,
          };

          this.isSaving = true;
          this.driverService.createDriver(driverToSave).subscribe({
            next: async (response: any) => {
              const savedDriver = response?.data;
              const newId = savedDriver?.id;
              if (this.photoFile && newId) {
                try {
                  const uploadRes = await firstValueFrom(
                    this.commonService.uploadPhoto(
                      'driver',
                      newId,
                      this.photoFile,
                    ),
                  );
                  const photoUrl = uploadRes?.data || '';
                  if (photoUrl) {
                    // Remove password before re-saving to avoid double hashing on backend
                    const { password, ...driverWithPhoto } = {
                      ...savedDriver,
                      photo: photoUrl,
                    };
                    this.driverService
                      .createDriver(driverWithPhoto as ModelDriver)
                      .subscribe();
                  }
                } catch (uploadErr) {
                  console.error(
                    'Error uploading photo after create:',
                    uploadErr,
                  );
                }
              }
              this.toastService.showSuccess(
                'Gestión de Conductores',
                'Conductor creado exitosamente!',
              );
              this.saved.emit();
              this.isSaving = false;
            },
            error: (err) => {
              console.error('Error creating driver:', err);
              this.toastService.showError(
                'Error',
                'No se pudo procesar la solicitud.',
              );
              this.isSaving = false;
            },
          });
        }
      } catch (error) {
        console.error('Error in onSubmit:', error);
      }
    } else {
      this.driverForm.markAllAsTouched();
    }
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
    const pwd = this.driverForm.get('password')?.value || '';
    return CustomValidators.getPasswordStrength(pwd);
  }

  get strengthLabel(): string {
    return CustomValidators.getPasswordStrengthLabel(this.strength);
  }

  close(): void {
    this.closed.emit();
  }

  get canSave(): boolean {
    return this.driverForm.valid && (this.isModified || !!this.photoFile);
  }

  private captureInitialState(): void {
    this.initialFormValue = JSON.stringify(
      CustomValidators.getNormalizedFormValue(this.driverForm.getRawValue()),
    );
  }

  get isModified(): boolean {
    return (
      JSON.stringify(
        CustomValidators.getNormalizedFormValue(this.driverForm.getRawValue()),
      ) !== this.initialFormValue
    );
  }
}
