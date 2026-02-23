import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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
  Filter,
} from 'src/app/models/model-filter-table';
import { GVehicleOwnerCardComponent } from '../../components/g-vehicle-owner-card/g-vehicle-owner-card.component';
import { GPasswordCardComponent } from '../../components/g-password-card/g-password-card.component';
import { SecurityService } from 'src/app/services/security/security.service';
import { ToastService } from 'src/app/services/toast.service';
import { DriverService } from 'src/app/services/driver.service';
import { CommonService } from '../../services/common.service';
import { Subscription } from 'rxjs';
import { CustomValidators } from 'src/app/utils/custom-validators';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelOwner } from 'src/app/models/owner-model';

export interface DriverOwnerGroup {
  owner: ModelOwner;
  drivers: ModelDriver[];
}

@Component({
  selector: 'app-drivers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    GDriverCardComponent,
    GVehicleOwnerCardComponent,
    GPasswordCardComponent,
  ],
  templateUrl: './drivers.component.html',
  styleUrls: ['./drivers.component.scss'],
})
export class DriversComponent implements OnInit, OnDestroy {
  drivers: ModelDriver[] = [];
  allDrivers: ModelDriver[] = [];
  totalDrivers: number = 0;
  activeDrivers: number = 0;
  inactiveDrivers: number = 0;
  groupedDrivers: DriverOwnerGroup[] = [];
  searchTerm: string = '';
  page: number = 0;
  rows: number = 10;

  // Role management
  userRole: string = '';
  loggedInOwnerId: number | null = null;
  private userSub: Subscription | undefined;

  /** ownerId filter when navigated from owner card (query param) */
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;

  // Offcanvas and Form
  isOffcanvasOpen: boolean = false;
  editingDriver: ModelDriver | null = null;
  driverForm!: FormGroup;
  showPassword = false;
  showConfirmPassword = false;
  documentTypes: any[] = [];
  genders: any[] = [];
  cities: any[] = [];
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
  owners: ModelOwner[] = [];
  showAccessData: boolean = true;

  isPasswordOffcanvasOpen: boolean = false;
  driverChangingPassword: ModelDriver | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly driverService: DriverService,
    private readonly commonService: CommonService,
    private readonly securityService: SecurityService,
    private readonly toastService: ToastService,
    private readonly ownerService: OwnerService,
    private readonly route: ActivatedRoute,
  ) {
    this.driverForm = this.fb.group(
      {
        name: ['', [Validators.required, Validators.maxLength(150)]],
        documentType: [null, [Validators.required]],
        documentNumber: [
          '',
          [
            Validators.required,
            Validators.maxLength(10),
            CustomValidators.duplicateValueValidator(
              this.allDrivers,
              'documentNumber',
              this.editingDriver?.id,
            ),
          ],
        ],
        cellPhone: [
          '',
          [Validators.required, CustomValidators.phoneValidator()],
        ],
        birthdate: ['', [Validators.required]],
        city: [null, [Validators.required]],
        gender: [null, [Validators.required]],
        licenseCategory: [null],
        licenseExpiry: [''],
        email: [
          '',
          [
            Validators.email,
            CustomValidators.duplicateValueValidator(
              this.allDrivers,
              'email',
              this.editingDriver?.id,
            ),
          ],
        ],
        password: [
          '',
          this.editingDriver
            ? []
            : [Validators.required, Validators.minLength(4)],
        ],
        confirmPassword: ['', this.editingDriver ? [] : [Validators.required]],
        ownerId: [null, [Validators.required]],
      },
      {
        validators: [CustomValidators.passwordMatchValidator],
      },
    );
  }

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    this.subscribeToUserContext();
    this.loadReferenceData();
  }

  loadFilteredOwner(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredOwner = response.data.content[0];
          this.applyFilter();
        }
      },
      error: (err: any) => console.error('Error loading filtered owner:', err),
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user: any) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();
          if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners(); // This will trigger loadDrivers upon success
          } else {
            this.loadOwners();
            this.loadDrivers();
          }
        }
      },
    });
  }

  loadReferenceData(): void {
    this.commonService.getListTypeDocument().subscribe({
      next: (response: any) => {
        if (response?.data) this.documentTypes = response.data;
      },
      error: (err: any) => console.error('Error loading document types:', err),
    });

    this.commonService.getGenders().subscribe({
      next: (response: any) => {
        if (response?.data) this.genders = response.data;
      },
      error: (err: any) => console.error('Error loading genders:', err),
    });

    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) this.cities = response.data;
      },
      error: (err: any) => console.error('Error loading cities:', err),
    });
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      // Use user.Id to filter the owner record based on the logged-in user's ID
      filtros.push(new Filter('user.Id', '=', this.loggedInOwnerId.toString()));
    }

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(100, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
          // If proprietor, ensure we have the correct owner.id from the response
          if (this.userRole === 'PROPIETARIO' && this.owners.length > 0) {
            this.loggedInOwnerId = this.owners[0].id ?? this.loggedInOwnerId;
            // Now that we have the TRUE owner.id, load drivers
            this.loadDrivers();
          }
          // After loading owners, if we already have drivers, build groups
          if (this.drivers.length > 0) {
            this.buildGroups();
          }
        }
      },
      error: (err: any) => console.error('Error loading owners:', err),
    });
  }

  fetchOwnerDetails(ownerId: number): void {
    // Avoid duplicate requests if we are already fetching or have it
    if (this.owners.some((o) => o.id === ownerId)) return;

    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );

    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.[0]) {
          const owner = response.data.content[0];
          if (!this.owners.some((o) => o.id === owner.id)) {
            this.owners.push(owner);
            this.buildGroups();
          }
        }
      },
      error: (err: any) =>
        console.error(`Error fetching owner ${ownerId}:`, err),
    });
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
    if (s <= 1) return 'Débil';
    if (s === 2) return 'Media';
    if (s === 3) return 'Buena';
    return 'Fuerte';
  }

  onToggleAccessData(event: any): void {
    this.showAccessData = event.target.checked;
    const emailControl = this.driverForm.get('email');
    const passwordControl = this.driverForm.get('password');
    const confirmPasswordControl = this.driverForm.get('confirmPassword');

    if (this.showAccessData) {
      emailControl?.setValidators([
        Validators.email,
        CustomValidators.duplicateValueValidator(
          this.allDrivers,
          'email',
          this.editingDriver?.id,
        ),
      ]);
      if (!this.editingDriver) {
        passwordControl?.setValidators([
          Validators.required,
          Validators.minLength(4),
        ]);
        confirmPasswordControl?.setValidators([Validators.required]);
      }
    } else {
      emailControl?.clearValidators();
      passwordControl?.clearValidators();
      confirmPasswordControl?.clearValidators();
    }

    emailControl?.updateValueAndValidity();
    passwordControl?.updateValueAndValidity();
    confirmPasswordControl?.updateValueAndValidity();
  }

  toggleOffcanvas(driver?: ModelDriver): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    this.showPassword = false;
    this.showConfirmPassword = false;
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
          licenseCategory: driver.licenseCategory,
          licenseExpiry: driver.licenseExpiry
            ? driver.licenseExpiry.split('T')[0]
            : '',
          email: driver.email,
          password: '',
          confirmPassword: '',
          ownerId: driver.ownerId,
        });

        this.showAccessData = !!driver.email;
        this.driverForm.get('documentType')?.disable();
        this.driverForm.get('password')?.clearValidators();
        this.driverForm.get('confirmPassword')?.clearValidators();
        this.driverForm.get('password')?.updateValueAndValidity();
        this.driverForm.get('confirmPassword')?.updateValueAndValidity();

        // Update validators for edit mode
        this.driverForm
          .get('documentNumber')
          ?.setValidators([
            Validators.required,
            Validators.maxLength(10),
            CustomValidators.duplicateValueValidator(
              this.allDrivers,
              'documentNumber',
              this.editingDriver.id,
            ),
          ]);
        this.driverForm
          .get('email')
          ?.setValidators([
            Validators.email,
            CustomValidators.duplicateValueValidator(
              this.allDrivers,
              'email',
              this.editingDriver.id,
            ),
          ]);
        this.driverForm.get('documentNumber')?.updateValueAndValidity();
        this.driverForm.get('email')?.updateValueAndValidity();
      } else {
        this.editingDriver = null;
        this.driverForm.reset({
          name: '',
          documentType: null,
          documentNumber: '',
          cellPhone: '',
          birthdate: '',
          city: null,
          gender: null,
          licenseCategory: null,
          licenseExpiry: '',
          email: '',
          password: '',
          confirmPassword: '',
          ownerId:
            this.userRole === 'ADMINISTRADOR' ? null : this.loggedInOwnerId,
        });

        this.showAccessData = true;

        // Default values: Cédula (usually name 'Cédula de Ciudadanía') and Masculino (usually name 'MASCULINO')
        const cedulaType = this.documentTypes.find((t) =>
          t.name.toUpperCase().includes('CÉDULA'),
        );
        const maleGender = this.genders.find((g) =>
          g.name.toUpperCase().includes('MASCULINO'),
        );

        if (cedulaType)
          this.driverForm.get('documentType')?.setValue(cedulaType.id);
        if (maleGender) this.driverForm.get('gender')?.setValue(maleGender.id);

        this.driverForm.get('documentType')?.enable();

        this.driverForm
          .get('password')
          ?.setValidators([Validators.required, Validators.minLength(4)]);
        this.driverForm
          .get('confirmPassword')
          ?.setValidators([Validators.required]);
        this.driverForm.get('password')?.updateValueAndValidity();
        this.driverForm.get('confirmPassword')?.updateValueAndValidity();

        // Reset validators for create mode
        this.driverForm
          .get('documentNumber')
          ?.setValidators([
            Validators.required,
            Validators.maxLength(10),
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
        this.driverForm.get('documentNumber')?.updateValueAndValidity();
        this.driverForm.get('email')?.updateValueAndValidity();
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
          licenseCategory: formValue.licenseCategory,
          licenseNumber: formValue.documentNumber,
          licenseExpiry: formValue.licenseExpiry,
          email: this.showAccessData ? formValue.email : undefined,
          password: this.showAccessData ? password || undefined : undefined,
          status: this.editingDriver?.user?.status || 'Active',
          photo: this.editingDriver?.photo || '',
          ownerId:
            this.userRole === 'ADMINISTRADOR'
              ? formValue.ownerId
              : this.loggedInOwnerId || undefined,
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
          error: (err: any) => {
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
    let filtros: Filter[] = [];

    // Filter by owner if user is PROPIETARIO
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('ownerId', '=', this.loggedInOwnerId.toString()));
    } else if (
      this.userRole === 'ADMINISTRADOR' &&
      this.ownerIdFilter != null
    ) {
      filtros.push(new Filter('ownerId', '=', this.ownerIdFilter.toString()));
    }

    const filter = new ModelFilterTable(
      filtros,
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

          // Identify unique missing owners and fetch their details
          const missingOwnerIds = [
            ...new Set(
              this.allDrivers
                .map((d) => d.ownerId)
                .filter(
                  (id): id is number =>
                    id != null && !this.owners.some((o) => o.id === id),
                ),
            ),
          ];

          missingOwnerIds.forEach((id) => this.fetchOwnerDetails(id));
        } else {
          this.allDrivers = [];
          this.drivers = [];
          this.calculateStats();
        }
      },
      error: (err: any) => console.error('Error loading drivers:', err),
    });
  }

  calculateStats(): void {
    this.totalDrivers = this.allDrivers.length;
    this.activeDrivers = this.allDrivers.filter(
      (d) => (d.user?.status || 'Active') === 'Active',
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
    this.buildGroups();
  }

  buildGroups(): void {
    const groups = new Map<string, DriverOwnerGroup>();
    const noOwnerKey = '__sin_propietario__';

    // Always include the filtered owner if present and no search term is active
    if (this.filteredOwner && !this.searchTerm) {
      const key = String(this.filteredOwner.id);
      groups.set(key, { owner: this.filteredOwner, drivers: [] });
    }

    this.drivers.forEach((d) => {
      if (!d.ownerId) {
        if (!groups.has(noOwnerKey)) {
          groups.set(noOwnerKey, {
            owner: new ModelOwner(
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              'Sin socio',
            ),
            drivers: [],
          });
        }
        groups.get(noOwnerKey)!.drivers.push(d);
      } else {
        const ownerData = this.owners.find((o) => o.id === d.ownerId);
        const key = String(d.ownerId);
        if (!groups.has(key)) {
          groups.set(key, {
            owner:
              ownerData ||
              new ModelOwner(
                d.ownerId,
                undefined,
                undefined,
                undefined,
                undefined,
                'Socio desconocido',
              ),
            drivers: [],
          });
        }
        groups.get(key)!.drivers.push(d);
      }
    });

    // Convert map to array and sort: named owners alphabetically, "Sin socio" last
    const result = Array.from(groups.values()).sort((a, b) => {
      const aName = a.owner.name ?? '';
      const bName = b.owner.name ?? '';
      if (aName === 'Sin socio') return 1;
      if (bName === 'Sin socio') return -1;
      return aName.localeCompare(bName);
    });

    this.groupedDrivers = result;
  }

  openAddDriverForOwner(owner: ModelOwner): void {
    this.toggleOffcanvas();
    if (owner.id) {
      this.driverForm.get('ownerId')?.setValue(owner.id);
      if (this.userRole === 'PROPIETARIO') {
        this.driverForm.get('ownerId')?.disable();
      }
    }
  }

  onViewProfile(owner: ModelOwner): void {
    console.log('View profile for owner:', owner);
  }

  allowOnlyNumbers(event: any): void {
    if (!/[0-9]/.test(String.fromCharCode(event.charCode)))
      event.preventDefault();
  }

  formatCellPhone(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, ''); // Remove non-digits
    const formatted = this.applyPhoneMask(input);
    this.driverForm.get('cellPhone')?.setValue(formatted, { emitEvent: true });
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

  togglePasswordOffcanvas(driver?: ModelDriver): void {
    this.isPasswordOffcanvasOpen = !this.isPasswordOffcanvasOpen;
    this.driverChangingPassword = driver || null;
  }

  async onUpdatePassword(passwords: any): Promise<void> {
    if (!this.driverChangingPassword || !this.driverChangingPassword.user?.id) {
      this.toastService.showError(
        'Error',
        'No se encontró el usuario asociado al conductor',
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
                this.driverChangingPassword.user.id.toString(),
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
