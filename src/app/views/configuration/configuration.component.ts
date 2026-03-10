import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
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
  allCategories: CategoryConfig[] = [];

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

  constructor(
    private readonly expenseService: VehicleService,
    private readonly fb: FormBuilder,
    private readonly toastService: ToastService,
  ) {
    this.categoryForm = this.fb.group({
      name: ['', [Validators.required]],
      typeId: [null, [Validators.required]],
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    let filtros: Filter[] = [];
    const filter = new ModelFilterTable(
      filtros,
      new Pagination(500, 0),
      new Sort('id', true),
    );

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
        }
      },
      error: (err) => {
        console.error('Error loading expense categories:', err);
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

    this.categories = filtered;
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
      }
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
              ? 'Categoría actualizada exitosamente'
              : 'Categoría creada exitosamente',
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
}
