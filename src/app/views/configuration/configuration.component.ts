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
import { Observable, of, timer } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
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

  constructor(
    private readonly expenseService: VehicleService,
    private readonly fb: FormBuilder,
    private readonly toastService: ToastService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {
    this.categoryForm = this.fb.group({
      name: ['', [Validators.required], [this.duplicateNameValidator()]],
      typeId: [null, [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.loadCategories();

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

  loadCategories(): void {
    let filtros: Filter[] = [];
    if (this.activeFilter !== -1) {
      filtros.push(
        new Filter('expenseType.id', '=', this.activeFilter.toString()),
      );
    }
    const filter = new ModelFilterTable(
      filtros,
      new Pagination(1000, 0),
      new Sort('name', true),
    );
    this.loading = true;

    this.expenseService.getExpenseCategoryFilter(filter).subscribe({
      next: (response: any) => {
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
      },
      error: (err) => {
        console.error('Error loading expense categories:', err);
        this.loading = false;
      },
    });
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

      const filtros = [new Filter('name', '=', control.value.trim())];
      const filter = new ModelFilterTable(
        filtros,
        new Pagination(10, 0),
        new Sort('id', true),
      );

      return timer(500).pipe(
        switchMap(() => this.expenseService.getExpenseCategoryFilter(filter)),
        map((response: any) => {
          const data = response?.data?.content || response?.data || response;
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
