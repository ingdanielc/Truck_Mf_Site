import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { GExpenseCategoryCardComponent } from '../g-expense-category-card/g-expense-category-card.component';
import { VehicleService } from '../../services/expense.service';
import { ModelExpense } from 'src/app/models/expense-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';

interface CategoryConfig {
  id: number;
  name: string;
  icon: string;
  type: string;
  colorClass: string;
}

@Component({
  selector: 'g-add-expense',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, GExpenseCategoryCardComponent],
  templateUrl: './g-add-expense.component.html',
  styleUrls: ['./g-add-expense.component.scss'],
})
export class GAddExpenseComponent implements OnInit {
  @Input() vehicleId: number | null = null;
  @Output() close = new EventEmitter<any>();

  expenseForm!: FormGroup;
  expenseTypes = [
    { id: 1, label: 'Vehículo' },
    { id: 3, label: 'Viaje' },
    { id: 2, label: 'Conductor' },
  ];
  selectedType: number = 1;

  categories: CategoryConfig[] = [];
  loadingCategories: boolean = false;

  private readonly categoryUIConfig: Record<string, Partial<CategoryConfig>> = {
    combustible: {
      icon: 'fa-solid fa-gas-pump',
      colorClass: 'text-warning bg-warning',
    },
    peajes: {
      icon: 'fa-solid fa-circle-dot',
      colorClass: 'text-indigo bg-indigo',
    },
    alimentación: {
      icon: 'fa-solid fa-utensils',
      colorClass: 'text-primary bg-primary',
    },
    parqueadero: {
      icon: 'fa-solid fa-square-p',
      colorClass: 'text-secondary bg-secondary',
    },
    papelería: {
      icon: 'fa-solid fa-file-invoice',
      colorClass: 'text-info bg-info',
    },
    reparaciones: {
      icon: 'fa-solid fa-toolbox',
      colorClass: 'text-danger bg-danger',
    },
    mantenimiento: {
      icon: 'fa-solid fa-gear',
      colorClass: 'text-info bg-info',
    },
    lavado: {
      icon: 'fa-solid fa-car-wash',
      colorClass: 'text-primary bg-primary',
    },
    llantas: {
      icon: 'fa-solid fa-circle-notch',
      colorClass: 'text-secondary bg-secondary',
    },
    seguros: {
      icon: 'fa-solid fa-shield-halved',
      colorClass: 'text-primary bg-primary',
    },
    hospedaje: {
      icon: 'fa-solid fa-bed',
      colorClass: 'text-primary bg-primary',
    },
    viáticos: {
      icon: 'fa-solid fa-money-bill-wave',
      colorClass: 'text-info bg-info',
    },
    comunicaciones: {
      icon: 'fa-solid fa-mobile-screen',
      colorClass: 'text-secondary bg-secondary',
    },
    otros: {
      icon: 'fa-solid fa-ellipsis',
      colorClass: 'text-secondary bg-secondary',
    },
    engrasada: {
      icon: 'fa-solid fa-oil-can',
      colorClass: 'text-info bg-info',
    },
  };

  filteredCategories: CategoryConfig[] = [];
  selectedCategoryId: number | null = null;
  searchQuery: string = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly expenseService: VehicleService,
  ) {}

  ngOnInit(): void {
    console.log(
      'GAddExpenseComponent initialized with vehicleId:',
      this.vehicleId,
    );
    this.initForm();
    this.loadCategories();
  }

  loadCategories(): void {
    this.loadingCategories = true;
    let filtros: Filter[] = [];
    const filter = new ModelFilterTable(
      filtros,
      new Pagination(500, 0),
      new Sort('id', true),
    );
    this.expenseService.getExpenseCategoryFilter(filter).subscribe({
      next: (response: any) => {
        // Robust data extraction: handling different API response formats
        const data = response?.data?.content || response?.data || response;

        if (data && Array.isArray(data)) {
          this.categories = data.map((cat: any) => {
            const nameKey = (cat.name || '').toLowerCase();
            const uiConfig = this.categoryUIConfig[nameKey] || {
              icon: 'fa-solid fa-receipt',
              colorClass: 'text-secondary bg-secondary',
            };

            // Trying common field names for the category type ID
            const extractedType =
              cat.expenseTypeId ??
              cat.type ??
              cat.typeId ??
              cat.categoryTypeId ??
              cat.categoryType?.id;

            return {
              id: cat.id,
              name: cat.name,
              type: String(extractedType ?? ''),
              icon: uiConfig.icon!,
              colorClass: uiConfig.colorClass!,
            };
          });
          this.filterCategories();
        }
        this.loadingCategories = false;
      },
      error: (err) => {
        console.error('Error loading expense categories:', err);
        this.loadingCategories = false;
      },
    });
  }

  initForm(): void {
    this.expenseForm = this.fb.group({
      categoryId: [null, Validators.required],
      amount: [0, [Validators.required, Validators.min(0.01)]],
      description: [''],
    });
  }

  selectType(typeId: number): void {
    this.selectedType = typeId;
    this.expenseForm.patchValue({ categoryId: null });
    this.selectedCategoryId = null;
    this.filterCategories();
  }

  filterCategories(): void {
    const query = this.searchQuery.toLowerCase();
    this.filteredCategories = this.categories.filter((cat) => {
      const catType = Number(cat.type);
      const matchesType = catType === this.selectedType;
      const matchesSearch = cat.name.toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }

  onSearchChange(event: any): void {
    this.searchQuery = event.target.value;
    this.filterCategories();
  }

  selectCategory(id: number): void {
    this.selectedCategoryId = id;
    this.expenseForm.patchValue({ categoryId: id });
  }

  onSave(): void {
    if (this.expenseForm.valid && this.selectedCategoryId && this.vehicleId) {
      const expenseData: ModelExpense = {
        vehicleId: this.vehicleId,
        categoryId: this.selectedCategoryId,
        amount: this.expenseForm.value.amount,
        description: this.expenseForm.value.description,
        expenseDate: new Date().toISOString(), // Default to current date
      };
      this.close.emit(expenseData);
    } else {
      if (!this.vehicleId) {
        console.error(
          'No vehicle ID provided for the expense. vehicleId value:',
          this.vehicleId,
        );
      }
      Object.keys(this.expenseForm.controls).forEach((key) => {
        this.expenseForm.get(key)?.markAsTouched();
      });
    }
  }

  dismiss(): void {
    this.close.emit(null);
  }
}
