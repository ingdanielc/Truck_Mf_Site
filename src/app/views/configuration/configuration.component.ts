import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
  AbstractControl,
  AsyncValidatorFn,
  ValidationErrors,
} from '@angular/forms';
import { map, switchMap, catchError } from 'rxjs/operators';
import { forkJoin, Observable, of, timer } from 'rxjs';
import { CommonModule } from '@angular/common';

import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { VehicleService } from 'src/app/services/expense.service';
import { ToastService } from 'src/app/services/toast.service';
import { GExpenseCategoryCardComponent } from 'src/app/components/g-expense-category-card/g-expense-category-card.component';
import { getCategoryConfigByName } from 'src/app/utils/category-config';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';

interface CategoryConfig {
  id: number;
  name: string;
  typeId?: number;
  typeStr: string;
  icon: string;
  colorClass: string;
}

@Component({
  selector: 'app-configuration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    GExpenseCategoryCardComponent,
  ],
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
})
export class ConfigurationComponent implements OnInit {
  categories: CategoryConfig[] = [];
  paginatedCategories: CategoryConfig[] = [];
  allCategories: CategoryConfig[] = [];

  page: number = 0;
  rows: number = 12;

  // Counters
  totalCategoriesStable: number = 0;
  viajeCount: number = 0;
  vehiculoCount: number = 0;
  conductorCount: number = 0;
  mantenimientoCount: number = 0;

  activeFilter: number = -1; // -1 for Todos, 3 Viaje, 1 Vehiculo, 2 Conductor, 4 Mantenimiento

  expenseTypes = [
    { id: 3, label: 'Viaje' },
    { id: 1, label: 'Vehículo' },
    { id: 2, label: 'Conductor' },
    { id: 4, label: 'Mantenimiento' },
  ];

  isOffcanvasOpen: boolean = false;
  editingCategory: CategoryConfig | null = null;
  categoryForm: FormGroup;
  searchTerm: string = '';
  loading: boolean = true;
  private initialFormValue: string = '';

  hasBackContext = false;
  originParam: string | null = null;
  vehicleIdParam: string | null = null;
  tripIdParam: string | null = null;

  currentUser: any = null;
  currentOwnerId: number | null = null;
  userRole: string = '';

  constructor(
    private readonly expenseService: VehicleService,
    private readonly fb: FormBuilder,
    private readonly toastService: ToastService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
  ) {
    this.categoryForm = this.fb.group({
      name: [
        '',
        {
          validators: [Validators.required],
          asyncValidators: [this.duplicateNameValidator()],
          updateOn: 'blur',
        },
      ],
      typeId: [null, [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.securityService.userData$.subscribe((user) => {
      this.currentUser = user;
      this.determineUserRoleAndOwner();
    });

    this.route.queryParamMap.subscribe((params) => {
      const typeIdStr = params.get('typeId');
      if (typeIdStr) {
        const typeId = Number(typeIdStr);
        this.activeFilter = typeId;
        this.toggleOffcanvas();
      }

      this.originParam = params.get('origin');
      this.vehicleIdParam = params.get('vehicleId');
      this.tripIdParam = params.get('tripId');
      this.hasBackContext = this.originParam === 'expenses';
    });
  }

  private determineUserRoleAndOwner(): void {
    if (!this.currentUser) {
      // Don't fallback to ADMIN immediately, wait for user data
      return;
    }
    const roles = new Set(
      (this.currentUser.userRoles || []).map((ur: any) => {
        const roleName =
          ur.role?.name || ur.name || (typeof ur === 'string' ? ur : '');
        return roleName.toUpperCase();
      }),
    );

    if (roles.has('ADMINISTRADOR')) {
      this.userRole = 'ADMINISTRADOR';
      this.currentOwnerId = null;
      this.loadCategories();
    } else if (roles.has('PROPIETARIO')) {
      this.userRole = 'PROPIETARIO';
      const filter = new ModelFilterTable(
        [new Filter('user.id', '=', this.currentUser.id?.toString() || '')],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.ownerService.getOwnerFilter(filter).subscribe({
        next: (resp: any) => {
          this.currentOwnerId = resp?.data?.content?.[0]?.id || null;
          this.loadCategories();
        },
        error: () => {
          this.loadCategories(); // Load anyway on failure
        },
      });
    } else if (roles.has('CONDUCTOR')) {
      this.userRole = 'CONDUCTOR';
      const filter = new ModelFilterTable(
        [new Filter('user.id', '=', this.currentUser.id?.toString() || '')],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.driverService.getDriverFilter(filter).subscribe({
        next: (resp: any) => {
          this.currentOwnerId = resp?.data?.content?.[0]?.ownerId || null;
          this.loadCategories();
        },
        error: () => {
          this.loadCategories(); // Load anyway on failure
        },
      });
    } else {
      // Default fallback
      this.userRole = 'ADMINISTRADOR';
      this.loadCategories();
    }
  }

  loadCategories(): void {
    this.loading = true;
    const pagination = new Pagination(1000, 0);
    const sort = new Sort('name', true);
    let baseFiltros: Filter[] = [];

    if (this.userRole === 'ADMINISTRADOR') {
      const filter = new ModelFilterTable(baseFiltros, pagination, sort);
      this.expenseService.getExpenseCategoryFilter(filter).subscribe({
        next: (resp) => this.handleCategoriesResponse(resp),
        error: (err) => this.handleCategoriesError(err),
      });
    } else {
      // Global + Own
      const globalFilters = [
        ...baseFiltros,
        new Filter('ownerId', 'isnull', ''),
      ];
      const ownFilters = [
        ...baseFiltros,
        new Filter('ownerId', '=', this.currentOwnerId?.toString() || ''),
      ];

      forkJoin({
        global: this.expenseService.getExpenseCategoryFilter(
          new ModelFilterTable(globalFilters, pagination, sort),
        ),
        own: this.expenseService.getExpenseCategoryFilter(
          new ModelFilterTable(ownFilters, pagination, sort),
        ),
      }).subscribe({
        next: (results) => {
          const gData =
            results.global?.data?.content ||
            results.global?.data ||
            results.global;
          const oData =
            results.own?.data?.content || results.own?.data || results.own;
          const combined = [
            ...(Array.isArray(gData) ? gData : []),
            ...(Array.isArray(oData) ? oData : []),
          ];
          this.handleCategoriesResponse({ data: { content: combined } });
        },
        error: (err) => this.handleCategoriesError(err),
      });
    }
  }

  private handleCategoriesResponse(response: any): void {
    const data = response?.data?.content || response?.data || response;
    if (data && Array.isArray(data)) {
      this.allCategories = data.map((cat: any) => {
        const uiConfig = getCategoryConfigByName(cat.name);
        const extractedType =
          cat.expenseTypeId ??
          cat.type ??
          cat.typeId ??
          cat.categoryTypeId ??
          cat.categoryType?.id;
        const typeIdNum = Number(extractedType);
        const typeObj = this.expenseTypes.find((t) => t.id === typeIdNum);

        return {
          id: cat.id,
          name: cat.name,
          typeId: typeIdNum,
          typeStr: typeObj ? typeObj.label : 'Otro',
          icon: uiConfig.icon,
          colorClass: uiConfig.colorClass,
        };
      });
      this.updateCounts();
      this.applyFilter();
    } else {
      this.allCategories = [];
      this.categories = [];
    }
    this.loading = false;
  }

  private handleCategoriesError(err: any): void {
    console.error('Error loading expense categories:', err);
    this.loading = false;
  }

  updateCounts(): void {
    this.totalCategoriesStable = this.allCategories.length;
    this.viajeCount = this.allCategories.filter((c) => c.typeId === 3).length;
    this.vehiculoCount = this.allCategories.filter(
      (c) => c.typeId === 1,
    ).length;
    this.conductorCount = this.allCategories.filter(
      (c) => c.typeId === 2,
    ).length;
    this.mantenimientoCount = this.allCategories.filter(
      (c) => c.typeId === 4,
    ).length;
  }

  setFilter(filterId: number): void {
    this.activeFilter = filterId;
    this.applyFilter();
  }

  applyFilter(): void {
    let filtered = this.allCategories;

    if (this.activeFilter !== -1) {
      filtered = filtered.filter((c) => c.typeId === this.activeFilter);
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter((c) => c.name.toLowerCase().includes(term));
    }

    this.categories = filtered.sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    );
    this.page = 0;
    this.updatePagination();
  }

  updatePagination(): void {
    const startIndex = this.page * this.rows;
    const endIndex = startIndex + this.rows;
    this.paginatedCategories = this.categories.slice(startIndex, endIndex);
  }

  get totalPages(): number {
    return Math.ceil(this.categories.length / this.rows);
  }

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.updatePagination();
    }
  }

  duplicateNameValidator(): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      if (!control.value) {
        return of(null);
      }

      const currentName = control.value.trim().toLowerCase();
      if (
        this.editingCategory &&
        this.editingCategory.name.toLowerCase() === currentName
      ) {
        return of(null);
      }

      const baseFilters = [new Filter('name', '=', control.value.trim())];

      let check$: Observable<any>;

      if (this.userRole === 'ADMINISTRADOR') {
        const filter = new ModelFilterTable(
          baseFilters,
          new Pagination(10, 0),
          new Sort('id', true),
        );
        check$ = this.expenseService.getExpenseCategoryFilter(filter);
      } else {
        const globalFilters = [
          ...baseFilters,
          new Filter('ownerId', 'isnull', ''),
        ];
        const ownFilters = [
          ...baseFilters,
          new Filter('ownerId', '=', this.currentOwnerId?.toString() || ''),
        ];

        const validationPagination = new Pagination(10, 0);
        const validationSort = new Sort('id', true);

        check$ = forkJoin({
          global: this.expenseService.getExpenseCategoryFilter(
            new ModelFilterTable(
              globalFilters,
              validationPagination,
              validationSort,
            ),
          ),
          own: this.expenseService.getExpenseCategoryFilter(
            new ModelFilterTable(
              ownFilters,
              validationPagination,
              validationSort,
            ),
          ),
        });
      }

      return timer(500).pipe(
        switchMap(() => check$),
        map((response: any) => {
          let data: any[];
          if (this.userRole === 'ADMINISTRADOR') {
            data = response?.data?.content || response?.data || response;
          } else {
            const gData =
              response.global?.data?.content ||
              response.global?.data ||
              response.global;
            const oData =
              response.own?.data?.content || response.own?.data || response.own;
            data = [
              ...(Array.isArray(gData) ? gData : []),
              ...(Array.isArray(oData) ? oData : []),
            ];
          }

          if (data && Array.isArray(data) && data.length > 0) {
            const exists = data.some(
              (c: any) => c.name.toLowerCase() === currentName,
            );
            return exists ? { duplicate: true } : null;
          }
          return null;
        }),
        catchError(() => of(null)),
      );
    };
  }

  toggleOffcanvas(category?: CategoryConfig): void {
    this.isOffcanvasOpen = !this.isOffcanvasOpen;

    if (this.isOffcanvasOpen) {
      if (category) {
        this.editingCategory = category;
        this.categoryForm.patchValue({
          name: category.name,
          typeId: category.typeId,
        });
      } else {
        this.editingCategory = null;
        this.categoryForm.reset();
        if (this.activeFilter !== -1) {
          this.categoryForm.patchValue({ typeId: this.activeFilter });
        }
      }
      this.captureInitialState();
    }
  }

  onSubmit(): void {
    if (this.categoryForm.valid) {
      const formValue = this.categoryForm.value;
      const categoryToSave = {
        id: this.editingCategory ? this.editingCategory.id : null,
        name: formValue.name,
        expenseTypeId: Number(formValue.typeId),
        ownerId: this.userRole === 'ADMINISTRADOR' ? null : this.currentOwnerId,
        status: 'Activo',
      };

      this.expenseService.saveExpenseCategory(categoryToSave).subscribe({
        next: () => {
          this.toastService.showSuccess(
            'Configuración',
            this.editingCategory
              ? 'Categoría actualizada exitosamente!'
              : 'Categoría creada exitosamente!',
          );
          this.loadCategories();
          this.toggleOffcanvas();
        },
        error: (err) => {
          console.error('Error saving category:', err);
          this.toastService.showError(
            'Error',
            'No se pudo guardar la categoría.',
          );
        },
      });
    } else {
      this.categoryForm.markAllAsTouched();
    }
  }

  goBack(): void {
    if (this.originParam === 'expenses') {
      this.router.navigate(['/site/expenses'], {
        queryParams: {
          vehicleId: this.vehicleIdParam,
          tripId: this.tripIdParam,
        },
      });
    }
  }

  get canSave(): boolean {
    return this.categoryForm.valid && this.isModified;
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
    const raw = this.categoryForm.getRawValue();
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
