import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ModelDriver } from 'src/app/models/driver-model';
import { GDriverCardComponent } from '../../components/g-driver-card/g-driver-card.component';
import {
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { DriverService } from 'src/app/services/driver.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { ToastService } from 'src/app/services/toast.service';
import { CommonService } from '../../services/common.service';

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GDriverCardComponent,
  ],
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.scss'],
})
export class DriversComponent implements OnInit {
  drivers: ModelDriver[] = [];
  allDrivers: ModelDriver[] = [];
  totalDrivers: number = 0;
  activeDrivers: number = 0;
  inactiveDrivers: number = 0;
  searchTerm: string = '';
  page: number = 0;
  rows: number = 10;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingDriver: ModelDriver | null = null;
  driverForm: FormGroup;
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];

  constructor(
    private readonly fb: FormBuilder,
    private readonly driverService: DriverService,
    private readonly commonService: CommonService,
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
  ) {
    this.driverForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.maxLength(150)]],
        documentType: ['', [Validators.required]],
        documentNumber: ['', [Validators.required]],
        cellPhone: ['', [Validators.required]],
        birthdate: ['', [Validators.required]],
        city: ['', [Validators.required]],
        gender: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(4)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  ngOnInit(): void {
    this.loadDrivers();
    this.loadReferenceData();
  }

  loadReferenceData(): void {
    this.commonService.getListTypeDocument().subscribe({
      next: (response: any) => {
        if (response?.data) this.documentTypes = response.data;
      },
      error: (err) => console.error('Error loading document types:', err),
    });

    this.commonService.getGenders().subscribe({
      next: (response: any) => {
        if (response?.data) this.genders = response.data;
      },
      error: (err) => console.error('Error loading genders:', err),
    });

    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) this.cities = response.data;
      },
      error: (err) => console.error('Error loading cities:', err),
    });
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('password')?.value === g.get('confirmPassword')?.value
      ? null
      : { mismatch: true };
  }

  get strength(): number {
    const pwd = this.driverForm.get('password')?.value || '';
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

  toggleOffcanvas(driver?: ModelDriver): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      if (driver) {
        this.editingDriver = driver;
        this.driverForm.patchValue({
          name: driver.name,
          documentType: driver.documentTypeId,
          documentNumber: driver.documentNumber,
          cellPhone: driver.cellPhone,
          birthdate: driver.birthdate,
          city: driver.cityId,
          gender: driver.genderId,
          email: driver.email,
        });

        this.driverForm.get('documentType')?.disable();
        this.driverForm.get('password')?.clearValidators();
        this.driverForm.get('confirmPassword')?.clearValidators();
        this.driverForm.get('password')?.updateValueAndValidity();
        this.driverForm.get('confirmPassword')?.updateValueAndValidity();
      } else {
        this.editingDriver = null;
        this.driverForm.reset();
        this.driverForm.get('documentType')?.enable();

        this.driverForm
          .get('password')
          ?.setValidators([Validators.required, Validators.minLength(4)]);
        this.driverForm
          .get('confirmPassword')
          ?.setValidators([Validators.required]);
        this.driverForm.get('password')?.updateValueAndValidity();
        this.driverForm.get('confirmPassword')?.updateValueAndValidity();
      }
    } else {
      this.editingDriver = null;
      this.driverForm.reset();
    }
  }

  async onSubmit(): Promise<void> {
    if (this.driverForm.valid) {
      try {
        const formValue = this.driverForm.getRawValue();
        let password = formValue.password;

        if (password) {
          password = await this.securityService.getHashSHA512(password);
        }

        const driverToSave: ModelDriver = {
          id: this.editingDriver?.id || null,
          name: formValue.name,
          documentTypeId: formValue.documentType,
          documentNumber: formValue.documentNumber,
          cellPhone: formValue.cellPhone,
          birthdate: formValue.birthdate,
          cityId: formValue.city,
          genderId: formValue.gender,
          email: formValue.email,
          password: password || undefined,
          status: this.editingDriver?.status || 'Active',
          photo: this.editingDriver?.photo || '',
        };

        this.driverService.createDriver(driverToSave).subscribe({
          next: () => {
            this.toastService.showSuccess(
              'Gestión de Conductores',
              this.editingDriver
                ? 'Conductor actualizado exitosamente!'
                : 'Conductor creado exitosamente!',
            );
            this.loadDrivers();
            this.toggleOffcanvas();
          },
          error: (err) => {
            console.error('Error saving driver:', err);
            this.toastService.showError(
              'Error',
              'No se pudo procesar la solicitud.',
            );
          },
        });
      } catch (error) {
        console.error('Error in onSubmit:', error);
      }
    } else {
      this.driverForm.markAllAsTouched();
    }
  }

  loadDrivers(): void {
    const filter = new ModelFilterTable(
      [],
      new Pagination(this.rows, this.page),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.totalDrivers = response.data.totalElements || 0;
          this.allDrivers = response.data.content;
          this.calculateStats();
          this.applyFilter();
        } else {
          this.allDrivers = [];
          this.drivers = [];
          this.calculateStats();
        }
      },
      error: (err) => console.error('Error loading drivers:', err),
    });
  }

  calculateStats(): void {
    this.totalDrivers = this.allDrivers.length;
    this.activeDrivers = this.allDrivers.filter(
      (d) => d.status === 'Active',
    ).length;
    this.inactiveDrivers = this.totalDrivers - this.activeDrivers;
  }

  applyFilter(): void {
    let filtered = this.allDrivers;
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.name?.toLowerCase().includes(term) ||
          d.email?.toLowerCase().includes(term) ||
          d.documentNumber?.includes(term),
      );
    }
    this.drivers = filtered;
  }

  allowOnlyNumbers(event: any): void {
    if (!/[0-9]/.test(String.fromCharCode(event.charCode)))
      event.preventDefault();
  }

  formatCellPhone(event: any): void {
    let input = event.target.value.replace(/\D/g, '');
    if (input.length > 10) input = input.substring(0, 10);
    if (input.length > 3)
      input = input.substring(0, 3) + ' ' + input.substring(3);
    if (input.length > 7)
      input = input.substring(0, 7) + ' ' + input.substring(7);
    this.driverForm.get('cellPhone')?.setValue(input, { emitEvent: false });
  }
}
