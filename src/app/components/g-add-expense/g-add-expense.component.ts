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
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
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

    if (this.showExpenseDate) {
      /* El `min` del campo frena el selector, pero no lo que se escriba a mano
         ni lo que llegue precargado: el validador es lo que mantiene Guardar
         apagado con una fecha fuera de rango. */
      this.expenseForm
        .get('expenseDate')
        ?.setValidators([Validators.required, this.expenseDateRange()]);
      this.expenseForm.get('expenseDate')?.updateValueAndValidity();
    }

    if (this.editingExpense) {
      this.patchFormForEdit();
    } else if (this.preselectedTypeId) {
      if (!this.isMaintenance) {
        this.selectedType = this.preselectedTypeId;
      }
    }

    /* La fecha del viaje, ya puesta: es la respuesta correcta casi siempre, y
       quien carga viajes viejos no tiene que escribirla gasto a gasto. Se
       vuelve a capturar el estado inicial para que el formulario no nazca
       "modificado" y habilite Guardar sin que nadie haya tocado nada. */
    if (this.showExpenseDate && !this.editingExpense) {
      this.expenseForm.patchValue({ expenseDate: this.defaultExpenseDate });
      this.captureInitialState();
    }
  }

  /**
   * Con que fecha abre el campo.
   *
   * **Hoy si el viaje sigue vivo.** En Curso y Pendiente son viajes que estan
   * pasando: el camion rueda o la plata no ha entrado, y el gasto que se
   * registra ahora es de ahora, aunque el viaje haya salido hace tres semanas.
   *
   * **La fecha del viaje si ya se cerro.** Un Completado que alguien esta
   * cargando de semanas atras no tiene gastos de hoy: los tuvo cuando ocurrio,
   * y esa es la respuesta correcta casi siempre.
   *
   * En los dos casos es solo el valor de partida: el campo se cambia.
   *
   * Nunca por debajo del tope. La fecha del viaje es su salida, y en un viaje
   * cargado tarde la salida queda antes del registro: sin esto el campo abria
   * en un dia que el mismo campo no admite, en rojo desde el primer momento.
   */
  private get defaultExpenseDate(): string {
    const fecha = this.isTripOpen
      ? new Date()
      : (this.pastTripDate ?? new Date());
    const partida = GAddExpenseComponent.toInputDate(fecha);
    const minimo = this.expenseDateMin;
    return minimo && partida < minimo ? minimo : partida;
  }

  /** El viaje sigue vivo: rodando, o entregado y sin cobrar. */
  private get isTripOpen(): boolean {
    const estado = (this.trip?.status ?? '').trim().toLowerCase();
    return estado === 'en curso' || estado === 'pendiente';
  }

  /* ======================================================================
     Fecha del gasto
     ====================================================================== */

  /**
   * El campo de fecha solo sale cuando hace falta: en un viaje registrado con
   * fechas pasadas.
   *
   * En el viaje del dia el gasto es de hoy y preguntarlo sobra -un campo mas
   * que atravesar en el celular, en un formulario que se llena con el camion
   * en marcha-. En el viaje que alguien esta cargando de semanas atras, en
   * cambio, "hoy" es la respuesta equivocada y no habia forma de corregirla.
   *
   * El mantenimiento no lo lleva: no cuelga de ningun viaje, asi que no hay
   * fecha de la que salga el valor por omision.
   */
  get showExpenseDate(): boolean {
    return !this.isMaintenance && this.pastTripDate !== null;
  }

  /**
   * La fecha del viaje: cuando salio, o cuando se registro si no hay salida.
   *
   * De aqui sale todo lo que el campo hace con fechas -con que valor abre y
   * hasta donde deja retroceder-, para que las dos no puedan separarse.
   */
  private get tripDate(): Date | null {
    const cruda = this.trip?.startDate ?? this.trip?.creationDate;
    if (!cruda) return null;

    const fecha = new Date(cruda);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /** Cuando el viaje entro al sistema. Puede ser posterior a la salida: un
   *  viaje se registra tarde y se le pone la fecha en que de verdad salio. */
  private get tripCreationDate(): Date | null {
    const cruda = this.trip?.creationDate;
    if (!cruda) return null;

    const fecha = new Date(cruda);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  /** La fecha del viaje, solo si es de un dia anterior a hoy. `null` si el
   *  viaje es de hoy, si no hay viaje o si la fecha no se entiende. */
  private get pastTripDate(): Date | null {
    const fecha = this.tripDate;
    if (!fecha) return null;

    const dia = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return dia(fecha) < dia(new Date()) ? fecha : null;
  }

  /**
   * Lo mas temprano que admite el campo: la mas tardia entre la salida del
   * viaje y su registro.
   *
   * Un gasto no puede ser anterior al viaje al que se le imputa, y los dos
   * topes dejan fuera cosas distintas segun como se haya cargado el viaje.
   *
   * **Por la salida.** Un viaje creado el lunes con salida el jueves no puede
   * tener gastos del martes: esos dias el camion todavia no rodaba.
   *
   * **Por el registro.** Un viaje que se carga tarde —sale el cinco y se
   * registra el diez— no puede tener gastos del seis: ese viaje no existia en
   * el sistema y la fecha no se puede comprobar contra nada.
   *
   * Vale igual creando que editando. Editando se puede corregir la fecha hacia
   * atras, porque un gasto se guarda mal y hay que poder arreglarlo, pero
   * nunca mas alla de ese tope.
   */
  get expenseDateMin(): string {
    /* `YYYY-MM-DD` se ordena igual como texto que como fecha, asi que la mas
       tardia es la mayor de las dos cadenas. */
    const topes = [this.tripDate, this.tripCreationDate]
      .filter((fecha): fecha is Date => fecha !== null)
      .map((fecha) => GAddExpenseComponent.toInputDate(fecha))
      .sort();
    return topes.length ? topes[topes.length - 1] : '';
  }

  /** Fuera de rango, con cual de los dos topes se paso: el mensaje de abajo
   *  nombra el que corresponde en vez de decir "fecha invalida". */
  private expenseDateRange(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const valor = control.value;
      if (!valor) return null;
      /* `YYYY-MM-DD` se ordena igual como texto que como fecha, asi que la
         comparacion directa basta y no hay que construir dos `Date`. */
      if (this.expenseDateMin && valor < this.expenseDateMin) {
        return { antesDelViaje: true };
      }
      return null;
    };
  }

  /** Lo que dice el campo cuando la fecha se sale del rango. */
  get expenseDateError(): string {
    const errores = this.expenseForm.get('expenseDate')?.errors;
    if (!errores) return '';
    if (errores['required']) return 'La fecha es obligatoria';
    if (errores['antesDelViaje'])
      return 'El gasto no puede ser anterior al viaje';
    return '';
  }

  /** `YYYY-MM-DD` con las partes locales. `toISOString` no sirve: pasa por UTC
   *  y en Bogota corre un dia las fechas de la tarde. */
  private static toInputDate(date: Date): string {
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const dia = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${mes}-${dia}`;
  }

  /**
   * De `YYYY-MM-DD` a lo que guarda la API.
   *
   * Se fija al mediodia local y no a medianoche: a medianoche, el paso a UTC
   * deja el instante en el dia anterior, y el gasto acababa contando en otro
   * mes. Al mediodia el dia sobrevive a la conversion mire quien mire.
   */
  private static fromInputDate(value: string): string {
    const [anio, mes, dia] = value.split('-').map(Number);
    return new Date(anio, mes - 1, dia, 12, 0, 0).toISOString();
  }

  patchFormForEdit(): void {
    if (!this.editingExpense) return;

    this.selectedType = this.editingExpense.category?.expenseTypeId || 1;
    this.selectedCategoryId = this.editingExpense.categoryId;

    const fecha = new Date(this.editingExpense.expenseDate);

    this.expenseForm.patchValue({
      categoryId: this.editingExpense.categoryId,
      /* La suya, no la del viaje: editando se corrige lo que se guardo. */
      expenseDate: isNaN(fecha.getTime())
        ? ''
        : GAddExpenseComponent.toInputDate(fecha),
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
      /* Solo se usa -y solo se pide- cuando el viaje es de dias pasados. Ver
         `showExpenseDate`. */
      expenseDate: [''],
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

    /* Elegir la categoría es el paso anterior a escribir cuánto: el teclado se
       abre solo, sin un toque de más para llegar al campo. Vale igual para el
       gasto y para el mantenimiento, que comparten este formulario. */
    this.focusAmount();
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
        expenseDate: this.resolveExpenseDate(),
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

  /**
   * Con que fecha se guarda el gasto.
   *
   * Manda lo que diga el campo, cuando el campo esta; si no, se conserva lo que
   * ya tenia el gasto que se edita, y para uno nuevo es hoy -que es lo que
   * hacia siempre-.
   */
  private resolveExpenseDate(): string | Date {
    const elegida = this.showExpenseDate
      ? this.expenseForm.value.expenseDate
      : '';
    if (elegida) return GAddExpenseComponent.fromInputDate(elegida);
    if (this.editingExpense) return this.editingExpense.expenseDate;
    return new Date().toISOString();
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
