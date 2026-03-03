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
import { getCategoryConfigByName } from 'src/app/utils/category-config';

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
  @Input() tripId: number | null = null;
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
        const data = response?.data?.content || response?.data || response;

        if (data && Array.isArray(data)) {
          this.categories = data.map((cat: any) => {
            const uiConfig = getCategoryConfigByName(cat.name);

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
              icon: uiConfig.icon,
              colorClass: uiConfig.colorClass,
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
        tripId: this.tripId || undefined,
        categoryId: this.selectedCategoryId,
        amount: this.expenseForm.value.amount,
        description: this.expenseForm.value.description,
        expenseDate: new Date().toISOString(),
      };
      this.close.emit(expenseData);
    } else {
      if (!this.vehicleId) {
        console.error('No vehicle ID provided for the expense.');
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
