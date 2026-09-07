import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core';
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
import { ModelTrip } from 'src/app/models/trip-model';
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
import { CommonService } from 'src/app/services/common.service';
import { normalizeCategoryName } from 'src/app/utils/expense-shortcuts';

interface CategoryConfig {
  id: number;
  name: string;
  icon: string;
  type: string;
  colorClass: string;
  disabled?: boolean;
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
  /** Viaje del gasto: de su flete sale el monto sugerido del impuesto 4x1000 */
  @Input() trip: ModelTrip | null = null;
  @Input() editingExpense: ModelExpense | null = null;
  @Input() preselectedTypeId?: number;
  /** Acceso rápido: categoría a marcar al abrir (id del backend) */
  @Input() preselectedCategoryId: number | null = null;
  /** Respaldo del acceso rápido cuando la categoría aún no se ha usado */
  @Input() preselectedCategoryName: string = '';
  @Input() isMaintenance = false;
  @Input() userRole = '';
  @Input() isSaving: boolean = false;
  @Output() close = new EventEmitter<ModelExpense | null>();
  private initialFormValue: string = '';
  private targetOwnerId: number | null = null;

  @ViewChild('amountInput') amountInputRef?: ElementRef<HTMLInputElement>;

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
  salaryTypes: any[] = [];
  currentDriverSalaryTypeId: number | null = null;

  /**
   * Remuneración del conductor del vehículo. Según su tipo de salario es el
   * sueldo mensual en pesos o el porcentaje del flete que se lleva de cada
   * viaje; de aquí sale el monto sugerido de una y otra categoría.
   */
  private currentDriverSalary: number | null = null;

  /** El 4x1000 son 4 pesos por cada 1000 del flete */
  private readonly TAX_4X1000_RATE = 0.004;
  /** Último monto precargado, para saber si el usuario lo cambió */
  private suggestedAmount: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly expenseService: VehicleService,
    private readonly router: Router,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly driverService: DriverService,
    private readonly vehicleRealService: VehicleRealService,
    private readonly commonService: CommonService,
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.determineTargetOwnerId();
    this.loadInitialData();

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

  loadInitialData(): void {
    // 1. Load Salary Types
    this.commonService.getSalaryTypes().subscribe({
      next: (resp: any) => {
        if (resp?.data) this.salaryTypes = resp.data;
        // El catálogo decide qué categorías de remuneración se ven y con qué
        // monto: mientras no llega, el filtro corrió contra una lista vacía.
        this.refreshDriverDependentState();
      },
    });

    // 2. Load Vehicle and Driver info
    if (this.vehicleId) {
      const filter = new ModelFilterTable(
        [new Filter('id', '=', this.vehicleId.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.vehicleRealService.getVehicleFilter(filter).subscribe({
        next: (resp: any) => {
          const vehicle = resp?.data?.content?.[0];
          if (vehicle) {
            this.currentDriverSalaryTypeId =
              vehicle.driver?.salaryTypeId || null;
            this.currentDriverSalary = this.toAmount(vehicle.driver?.salary);
            this.refreshDriverDependentState();

            if (this.currentDriverSalary == null) {
              this.loadDriverSalary(
                vehicle.driver?.id ?? vehicle.currentDriverId,
              );
            }
          }
        },
      });
    }
  }

  /**
   * Salario del conductor cuando el vehículo no lo trae anidado.
   *
   * `/vehicle/filter` devuelve el conductor, pero el salario no está
   * garantizado en esa respuesta, y sin él las categorías de remuneración
   * quedarían sin monto sugerido justo en el caso que las necesita.
   */
  private loadDriverSalary(driverId: number | null | undefined): void {
    if (!driverId) return;

    const filter = new ModelFilterTable(
      [new Filter('id', '=', driverId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (resp: any) => {
        const driver = resp?.data?.content?.[0];
        if (!driver) return;

        this.currentDriverSalary = this.toAmount(driver.salary);
        this.currentDriverSalaryTypeId ??= driver.salaryTypeId ?? null;
        this.refreshDriverDependentState();
      },
      error: () => {
        /* Sin salario no hay sugerencia: el usuario escribe el monto. */
      },
    });
  }

  /**
   * Vuelve a aplicar lo que depende del conductor: qué categorías se ven y qué
   * monto traen.
   *
   * El tipo de salario y el vehículo llegan en dos peticiones aparte, y
   * cualquiera puede caer después de que un acceso rápido ya eligió la
   * categoría. Sin repetir filtro y sugerencia, la categoría se quedaría
   * oculta o el monto en blanco.
   */
  private refreshDriverDependentState(): void {
    this.filterCategories();
    if (!this.editingExpense && this.selectedCategoryId != null) {
      this.applySuggestedAmount(this.selectedCategoryId);
    }
  }

  /** Nombre del tipo de salario del conductor, en mayúsculas. */
  private get driverSalaryTypeName(): string {
    const type = this.salaryTypes.find(
      (t) => t.id === Number(this.currentDriverSalaryTypeId),
    );
    return (type?.name || '').toUpperCase();
  }

  /** Conductor que cobra un porcentaje del flete de cada viaje. */
  private get isPercentageDriver(): boolean {
    return this.driverSalaryTypeName.includes('PORCENTAJE');
  }

  /** Conductor con sueldo fijo mensual. */
  private get isMonthlySalaryDriver(): boolean {
    return this.driverSalaryTypeName.includes('SALARIO MENSUAL');
  }

  /** El salario puede llegar como texto: se normaliza a número o a null. */
  private toAmount(value: any): number | null {
    if (value == null || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
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
          this.applyPreselectedCategory();
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
    // Al cambiar de tipo se pierde la categoria: se marca como tocada para que
    // quede en rojo y se vea que falta elegir una.
    this.expenseForm.get('categoryId')?.markAsTouched();
    this.filterCategories();
  }

  /**
   * `categoryId` no tiene input propio, asi que nunca recibe el blur que la
   * marcaria como tocada. Al salir del monto ya hay interaccion suficiente
   * para resaltar todo lo que falte.
   */
  onAmountBlur(): void {
    this.expenseForm.markAllAsTouched();
  }

  filterCategories(): void {
    const query = this.searchQuery.toLowerCase();
    this.filteredCategories = this.categories
      .filter((cat) => {
        const catName = cat.name.toUpperCase();
        if (catName.includes('SALARIO')) {
          if (this.isMaintenance) {
            // Mantenimiento: hidden if Salary Type is NOT "Salario mensual"
            if (!this.isMonthlySalaryDriver) return false;
          } else {
            // Gasto (Viaje/Conductor/Vehículo): hidden if Salary Type is NOT "Porcentaje"
            if (!this.isPercentageDriver) return false;
          }
        }

        const catType = Number(cat.type);
        const matchesType = catType === this.selectedType;
        const matchesSearch = cat.name.toLowerCase().includes(query);
        return matchesType && matchesSearch;
      })
      .sort((a, b) =>
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
      );
  }

  /**
   * Acceso rápido desde la vista de gastos: marca la categoría recibida (por id
   * y, si no está, por nombre) y deja el cursor en el monto para solo escribir.
   */
  private applyPreselectedCategory(): void {
    if (this.editingExpense) return;
    if (!this.preselectedCategoryId && !this.preselectedCategoryName) return;

    const wanted = normalizeCategoryName(this.preselectedCategoryName);
    const target =
      this.filteredCategories.find(
        (cat) => cat.id === this.preselectedCategoryId,
      ) ??
      this.filteredCategories.find(
        (cat) => normalizeCategoryName(cat.name) === wanted,
      ) ??
      // El backend puede ampliar el nombre (ej. "VARIOS CONDUCTOR"). Se compara
      // por prefijo para no confundir categorías como CARGUE y DESCARGUE.
      (wanted
        ? this.filteredCategories.find((cat) =>
            normalizeCategoryName(cat.name).startsWith(wanted),
          )
        : undefined);

    if (target) this.selectCategory(target.id);
    this.focusAmount();
  }

  private focusAmount(): void {
    setTimeout(() => this.amountInputRef?.nativeElement.focus(), 0);
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
          origin: this.isMaintenance ? 'maintenance' : 'expenses',
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
    this.applySuggestedAmount(id);
  }

  /**
   * Precarga el monto al elegir la categoría. No se pisa lo que haya escrito
   * el usuario: solo se toca el campo si está vacío o si aún tiene la
   * sugerencia anterior, que también se limpia al cambiar de categoría.
   */
  private applySuggestedAmount(categoryId: number): void {
    const suggestion = this.suggestedAmountFor(categoryId);
    const current = this.expenseForm.get('amount')?.value || '';

    if (current && current !== this.suggestedAmount) return;
    if (current === (suggestion ?? '')) return;

    this.expenseForm.get('amount')?.setValue(suggestion ?? '');
    this.expenseForm.get('amount')?.markAsDirty();
    this.suggestedAmount = suggestion;
  }

  /**
   * Categorías que traen monto sugerido: el impuesto 4x1000 y la remuneración
   * del conductor. Las demás se escriben a mano.
   */
  private suggestedAmountFor(categoryId: number): string | null {
    const category = this.categories.find((c) => c.id === categoryId);
    if (!category) return null;

    if (this.isTax4x1000(category.name)) {
      return this.roundedAmount(this.tripFreight() * this.TAX_4X1000_RATE);
    }

    if (this.isDriverPayCategory(category.name)) {
      return this.suggestedDriverPay();
    }

    return null;
  }

  /**
   * Monto sugerido de la remuneración del conductor, que se calcula distinto
   * según cómo cobre:
   *
   *   Salario mensual → el mantenimiento trae el sueldo tal cual.
   *   Porcentaje      → el gasto del viaje trae ese porcentaje del flete.
   *
   * Es el mismo criterio con el que `filterCategories` decide cuál de las dos
   * categorías se ve, así que la que esté a la vista es siempre la que aquí
   * tiene monto.
   */
  private suggestedDriverPay(): string | null {
    const salary = this.currentDriverSalary;
    if (salary == null || salary <= 0) return null;

    if (this.isMaintenance) {
      return this.isMonthlySalaryDriver ? this.roundedAmount(salary) : null;
    }

    if (!this.isPercentageDriver) return null;
    return this.roundedAmount((this.tripFreight() * salary) / 100);
  }

  /**
   * Flete sobre el que se calculan los montos proporcionales. El viaje vacío no
   * tiene flete, y sin viaje elegido no hay de dónde sacarlo.
   */
  private tripFreight(): number {
    const tripType = this.trip?.tripType;
    if (tripType !== 'CARGADO' && tripType !== 'REDONDO') return 0;
    return Number(this.trip?.freight) || 0;
  }

  /** Redondea a peso. El cero no se sugiere: no es un monto, es un campo vacío. */
  private roundedAmount(value: number): string | null {
    const amount = Math.round(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return this.applyAmountMask(String(amount));
  }

  /** El nombre de la categoría viene del backend: se compara sin espacios */
  private isTax4x1000(name: string): boolean {
    return name.toLowerCase().replaceAll(/[\s.]/g, '').includes('4x1000');
  }

  /**
   * Categoría con la que se paga al conductor. El backend la nombra "SALARIO"
   * o "PORCENTAJE POR VIAJE" según el caso; cuál de las dos está visible ya lo
   * decidió `filterCategories` con el tipo de salario del conductor.
   */
  private isDriverPayCategory(name: string): boolean {
    const clean = normalizeCategoryName(name);
    return clean.includes('salario') || clean.includes('porcentaje');
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
