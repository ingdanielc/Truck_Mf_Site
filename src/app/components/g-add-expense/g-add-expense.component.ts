import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
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
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';
import { VehicleService as VehicleRealService } from 'src/app/services/vehicle.service';
import { CustomValidators } from 'src/app/utils/custom-validators';

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
  @Input() editingExpense: ModelExpense | null = null;
  @Input() preselectedTypeId?: number;
  @Input() isMaintenance = false;
  @Input() userRole = '';
  @Input() isSaving: boolean = false;
  @Output() close = new EventEmitter<ModelExpense | null>();
  private initialFormValue: string = '';
  private targetOwnerId: number | null = null;

  expenseForm!: FormGroup;
  expenseTypes = [
    { id: 3, label: 'Viaje' },
    { id: 1, label: 'Vehículo' },
    { id: 2, label: 'Conductor' },
  ];
  selectedType: number = 3;

  categories: CategoryConfig[] = [];
  loadingCategories: boolean = false;

  filteredCategories: CategoryConfig[] = [];
  selectedCategoryId: number | null = null;
  searchQuery: string = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly expenseService: VehicleService,
    private readonly router: Router,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly vehicleRealService: VehicleRealService,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.determineTargetOwnerId();

    if (this.isMaintenance) {
      this.selectedType = 4;
      this.expenseForm
        .get('description')
        ?.setValidators([Validators.required, Validators.maxLength(200)]);
      this.expenseForm.get('description')?.updateValueAndValidity();
    }

    if (this.editingExpense) {
      this.patchFormForEdit();
    } else if (this.preselectedTypeId) {
      if (!this.isMaintenance) {
        this.selectedType = this.preselectedTypeId;
      }
    }
  }

  patchFormForEdit(): void {
    if (!this.editingExpense) return;

    this.selectedType = this.editingExpense.category?.expenseTypeId || 1;
    this.selectedCategoryId = this.editingExpense.categoryId;

    this.expenseForm.patchValue({
      categoryId: this.editingExpense.categoryId,
      amount: this.applyAmountMask(this.editingExpense.amount.toString()),
      description: this.editingExpense.description,
    });
    this.captureInitialState();
  }

  private determineTargetOwnerId(): void {
    if (this.userRole === 'ADMINISTRADOR') {
      if (this.vehicleId) {
        const filter = new ModelFilterTable(
          [new Filter('vehicleId', '=', this.vehicleId.toString())],
          new Pagination(1, 0),
          new Sort('id', true),
        );
        this.vehicleRealService.getVehicleOwnerFilter(filter).subscribe({
          next: (resp: any) => {
            const vehicle = resp?.data?.content?.[0];
            this.targetOwnerId = vehicle?.owners[0].ownerId || null;
            this.loadCategories();
          },
          error: () => {
            this.loadCategories(); // Fallback
          },
        });
      } else {
        this.targetOwnerId = null;
        this.loadCategories();
      }
    } else if (this.userRole === 'PROPIETARIO') {
      this.securityService.userData$.subscribe((user) => {
        if (user) {
          const filter = new ModelFilterTable(
            [new Filter('user.id', '=', user?.id?.toString() || '')],
            new Pagination(1, 0),
            new Sort('id', true),
          );
          this.ownerService.getOwnerFilter(filter).subscribe({
            next: (resp: any) => {
              this.targetOwnerId = resp?.data?.content?.[0]?.id || null;
              this.loadCategories();
            },
            error: () => {
              this.loadCategories(); // Fallback
            },
          });
        } else {
          this.loadCategories(); // Fallback if null
        }
      });
    } else if (this.userRole === 'CONDUCTOR') {
      this.securityService.userData$.subscribe((user) => {
        if (user) {
          const filter = new ModelFilterTable(
            [new Filter('user.id', '=', user?.id?.toString() || '')],
            new Pagination(1, 0),
            new Sort('id', true),
          );
          this.driverService.getDriverFilter(filter).subscribe({
            next: (resp: any) => {
              this.targetOwnerId = resp?.data?.content?.[0]?.ownerId || null;
              this.loadCategories();
            },
            error: () => {
              this.loadCategories(); // Fallback
            },
          });
        } else {
          this.loadCategories(); // Fallback if null
        }
      });
    } else {
      this.loadCategories();
    }
  }

  loadCategories(): void {
    this.loadingCategories = true;
    const pagination = new Pagination(500, 0);
    const sort = new Sort('name', true);

    const globalFilters = [new Filter('ownerId', 'isnull', '')];
    const ownFilters = [
      new Filter('ownerId', '=', this.targetOwnerId?.toString() || ''),
    ];

    forkJoin({
      global: this.expenseService.getExpenseCategoryFilter(
        new ModelFilterTable(globalFilters, pagination, sort),
      ),
      own: this.expenseService.getExpenseCategoryFilter(
        new ModelFilterTable(ownFilters, pagination, sort),
      ),
    }).subscribe({
      next: (results: any) => {
        const gData =
          results.global?.data?.content ||
          results.global?.data ||
          results.global;
        const oData =
          results.own?.data?.content || results.own?.data || results.own;
        const data = [
          ...(Array.isArray(gData) ? gData : []),
          ...(Array.isArray(oData) ? oData : []),
        ];

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
      error: (err: any) => {
        console.error('Error loading expense categories:', err);
        this.loadingCategories = false;
      },
    });
  }

  initForm(): void {
    this.expenseForm = this.fb.group({
      categoryId: [null, Validators.required],
      amount: [
        '',
        [Validators.required, Validators.min(1), Validators.max(999999999)],
      ],
      description: ['', [Validators.maxLength(200)]],
    });
    this.captureInitialState();
  }

  onAmountInput(event: any): void {
    const input = event.target.value.replaceAll(/\D/g, ''); // Remove non-digits
    const formatted = this.applyAmountMask(input);
    this.expenseForm.get('amount')?.setValue(formatted, { emitEvent: false });
    this.expenseForm.get('amount')?.markAsDirty();
  }

  private applyAmountMask(value: string): string {
    if (!value) return '';
    const numericValue = Number(value.replaceAll(/\D/g, ''));
    if (Number.isNaN(numericValue)) return '';
    return new Intl.NumberFormat('es-CO').format(numericValue);
  }

  selectType(typeId: number): void {
    this.selectedType = typeId;
    this.expenseForm.patchValue({ categoryId: null });
    this.selectedCategoryId = null;
    this.filterCategories();
  }

  filterCategories(): void {
    const query = this.searchQuery.toLowerCase();
    this.filteredCategories = this.categories
      .filter((cat) => {
        const catType = Number(cat.type);
        const matchesType = catType === this.selectedType;
        const matchesSearch = cat.name.toLowerCase().includes(query);
        return matchesType && matchesSearch;
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      );
  }

  onSearchChange(event: any): void {
    this.searchQuery = event.target.value;
    this.filterCategories();
  }

  selectCategory(id: number): void {
    if (id === -1) {
      this.router.navigate(['/site/configuration'], {
        queryParams: {
          typeId: this.selectedType,
          origin: 'expenses',
          vehicleId: this.vehicleId,
          tripId: this.tripId,
        },
      });
      this.dismiss();
      return;
    }
    this.selectedCategoryId = id;
    this.expenseForm.patchValue({ categoryId: id });
    this.expenseForm.markAsDirty();
  }

  onSave(): void {
    if (this.expenseForm.valid && this.selectedCategoryId && this.vehicleId) {
      const expenseData: ModelExpense = {
        vehicleId: this.vehicleId,
        tripId: this.tripId || undefined,
        categoryId: this.selectedCategoryId,
        amount: Number(
          this.expenseForm.value.amount.toString().replaceAll(/\D/g, ''),
        ),
        description: this.expenseForm.value.description,
        expenseDate: this.editingExpense
          ? this.editingExpense.expenseDate
          : new Date().toISOString(),
      };
      if (this.editingExpense?.id) {
        expenseData.id = this.editingExpense.id;
      }
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

  get canSave(): boolean {
    return this.expenseForm.valid && this.isModified;
  }

  private captureInitialState(): void {
    this.initialFormValue = JSON.stringify(
      CustomValidators.getNormalizedFormValue(this.expenseForm.getRawValue()),
    );
  }

  get isModified(): boolean {
    return (
      JSON.stringify(
        CustomValidators.getNormalizedFormValue(this.expenseForm.getRawValue()),
      ) !== this.initialFormValue
    );
  }
}
