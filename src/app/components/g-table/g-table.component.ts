import {
  Component,
  ContentChild,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnInit,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  ViewChild,
  ViewChildren,
} from '@angular/core';
import { PrimeNGConfig } from 'primeng/api';
import { ColumnFilter, Table } from 'primeng/table';
import { ModelFilterTable } from 'src/app/models/model-filter-table';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'g-table',
  templateUrl: './g-table.component.html',
  styleUrls: ['./g-table.component.scss'],
})
export class GTableComponent implements OnInit, OnChanges {
  environment = environment;
  @Input() items: any;
  @Input() columns: any = [];

  @Input() itemsSelectds: any[] = [];
  @Output() selectedItemsChange: EventEmitter<any> = new EventEmitter();

  @Input() loading: boolean = false;

  @Output() cLickEditarChange: EventEmitter<any> = new EventEmitter();
  @Output() cLickEliminarChange: EventEmitter<any> = new EventEmitter();
  @Output() cLickActivarChange: EventEmitter<any> = new EventEmitter();
  @Output() cLickInactivarChange: EventEmitter<any> = new EventEmitter();
  @Output() requestData = new EventEmitter<any>();

  @Input() rol: string = '';

  @Input() modelRadioButton: boolean = false;
  @Output() filterValue: any = '';

  @ViewChild('dt') dt: Table | undefined;
  @Input() total: number = 0;
  @Input() globalFilterFields: string = '';
  @Input() placeholder: string = '';
  @Input() activeIcon: boolean = true;
  @Input() maxlengthFilter: number | null = null;
  @Input() pattern!: any;

  @ContentChild('actionTemplate') actionTemplate!: TemplateRef<any>;
  @ContentChild('actionHeaderTemplate') actionHeaderTemplate!: TemplateRef<any>;
  @ContentChild('captionTemplate') captionTemplate!: TemplateRef<any>;
  @ViewChildren('myFilters') myFilters!: QueryList<ColumnFilter>;

  hideFilter: boolean = true;
  model: string = '';
  lastTimeout: any = null;
  dataLoaded: boolean = false;
  virtualScroll: boolean = true;
  isActive: boolean = true;
  filterTable: ModelFilterTable = new ModelFilterTable();
  maxDate: Date = new Date();
  totalPayment: number = 0;
  balancePayment: number = 0;

  constructor(private readonly primeNGConfig: PrimeNGConfig) {}

  @Input() filterElements: { [key: string]: any[] } = {};

  isRadioSelect: { [key: string]: boolean } = {};
  lastSelection: { [key: string]: any } = {};

  filterValues: { [key: string]: any } = {};
  @Output() filterValuesChange: EventEmitter<any> = new EventEmitter();

  activeFilters: { [key: string]: boolean } = {};
  btnApplyFilterIsLoanding: boolean = false;
  btnCleanFilterIsLoanding: boolean = false;

  @Input() type: string = '';
  @Input() showGlobalFilter: boolean = true;
  @Input() showSortIcon: boolean = true;
  @Input() isFilter: boolean = true;
  @Input() rowHover: boolean = true;
  @Input() skeletonRows: number = 5;
  @Input() inputType: string = '';
  @Input() rowsPerPageOptions: number[] = [10, 20, 30];

  filterVisible: boolean = false;
  pendingFilters: { [key: string]: any } = {};
  classTable: string = '';
  isSmallScreen: boolean = false;
  currentPageReportTemplate: string =
    'Showing {first} to {last} of {totalRecords} total.';

  private _rows: number = 10;

  @Input()
  set rows(value: number) {
    this._rows = value;
    this.skeletonRows = value;
    this.updateRowsPerPageOptions();
  }

  get rows(): number {
    return this._rows;
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.dataLoaded = true;
    if (changes['items']) {
      this.btnApplyFilterIsLoanding = false;
      this.btnCleanFilterIsLoanding = false;
      if (this.items.content) {
        this.totalPayment = this.items.content.reduce(
          (sum: any, item: any) => sum + item.amount,
          0
        );
        this.balancePayment = this.items.content.reduce(
          (sum: any, item: any) => sum + item.balance,
          0
        );
      }
    }
    if (changes['rows']) {
      this.updateRowsPerPageOptions();
    }
  }

  private updateRowsPerPageOptions() {
    this.rowsPerPageOptions = [this._rows, this._rows * 2, this._rows * 3];
  }

  cleanFilter(field: string) {
    this.btnCleanFilterIsLoanding = true;

    if (field) {
      // Limpia los valores aplicados en los filtros
      if (this.filterValues[field]) {
        this.filterValues[field] = {
          valueSimilarTo: '',
          valueEqualTo: '',
          radioButtonModel: null,
        };
      }

      // Limpia los valores de la UI (dropdowns, inputs)
      if (this.pendingFilters[field]) {
        this.pendingFilters[field] = {
          valueSimilarTo: '',
          valueEqualTo: '',
          radioButtonModel: null,
        };
      }

      this.activeFilters[field] = false;

      // Filtra la tabla eliminando el filtro seleccionado
      this.filterTable.filter = this.filterTable.filter.filter(
        (filter: any) => filter.fieldFilter !== field
      );

      // Cierra el acordeón si estaba abierto (remueve su índice de activeIndexes)
      const accordionIndex = this.columns.findIndex(
        (col: any) => col.field === field
      );
      if (accordionIndex !== -1) {
        this.activeIndexes = this.activeIndexes.filter(
          (index) => index !== accordionIndex
        );
      }

      // Refresca la tabla
      this.requestData.emit(this.filterTable);

      // Resetear valores relacionados con radio buttons
      this.isRadioSelect[field] = false;
      this.lastSelection[field] = null;
    }

    this.btnCleanFilterIsLoanding = false;
  }

  isActiveFilter(field: string): boolean {
    return !!(
      this.filterValues[field]?.valueEqualTo ||
      this.filterValues[field]?.valueSimilarTo
    );
  }

  updatePendingFilter(
    field: string,
    value: any,
    type: 'equal' | 'similar' | 'radio'
  ) {
    if (!this.pendingFilters[field]) {
      this.pendingFilters[field] = {};
    }

    if (type === 'equal') {
      this.pendingFilters[field].valueEqualTo = value;
    } else if (type === 'similar') {
      this.pendingFilters[field].valueSimilarTo = value;
    } else if (type === 'radio') {
      this.pendingFilters[field].radioButtonModel = value;
    }
  }

  applyFilter(field: string) {
    if (!this.isFilter) return;
    this.dataLoaded = false;
    this.btnApplyFilterIsLoanding = true;
    const filter = this.filterValues[field];
    if (filter.radioButtonModel) {
      if (this.filterTable.filter.length == 0) {
        this.filterTable.filter.push({
          fieldFilter: field,
          compFilter: 'like',
          valueFilter: filter.valueSimilarTo,
        });
      } else {
        this.verifyFilter(field, filter.valueSimilarTo, 'like');
      }
    } else if (this.filterTable.filter.length == 0) {
      if (field.indexOf('Date') >= 0) {
        this.filterTable.filter.push({
          fieldFilter: field,
          compFilter: '>=',
          valueFilter: this.formatDateSet(
            filter.valueEqualTo.setHours(0, 0, 0, 0)
          ),
        });
        this.filterTable.filter.push({
          fieldFilter: field,
          compFilter: '<=',
          valueFilter: this.formatDateSet(
            filter.valueEqualTo.setHours(23, 59, 59, 0)
          ),
        });
      } else {
        this.filterTable.filter.push({
          fieldFilter: field,
          compFilter: '=',
          valueFilter: filter.valueEqualTo,
        });
      }
    } else {
      this.verifyFilter(field, filter.valueEqualTo, '=');
    }
    this.activeFilters[field] = true;
    this.requestData.emit(this.filterTable);
  }

  verifyFilter(field: string, value: string, type: string) {
    this.dataLoaded = true;
    let find: boolean = true;
    this.filterTable.filter.forEach((filter: any) => {
      if (filter.fieldFilter == field) {
        filter.valueFilter = value;
      } else {
        find = false;
      }
    });

    if (!find) {
      this.filterTable.filter.push({
        fieldFilter: field,
        compFilter: type,
        valueFilter: value,
      });
    }
  }

  isBoolean(value: any): boolean {
    return typeof value === 'boolean';
  }

  ngOnDestroy(): void {
    console.log('OnDestroy Tabla');
  }

  ngOnInit(): void {
    this.primeNGConfig.ripple = true;
    this.columns.forEach((col: any) => {
      if (!this.filterValues[col.field]) {
        this.filterValues[col.field] = {
          valueSimilarTo: '',
          valueEqualTo: '',
          radioButtonModel: null,
        };
      }
      if (!this.pendingFilters[col.field]) {
        this.pendingFilters[col.field] = { ...this.filterValues[col.field] };
      }
      if (!this.filterElements[col.field]) {
        this.filterElements[col.field] = [];
      }
      this.activeFilters[col.field] = false;
    });
    this.onResize();
  }

  onCloseFilter(field: string) {
    if (!this.myFilters || this.myFilters.length === 0) {
      console.warn('No hay filtros disponibles en myFilters');
      return;
    }
    const filtersArray = this.myFilters.toArray();
    // Buscar el filtro que coincida con el field
    const filterToClose = filtersArray.find((filter) => filter.field === field);
    if (filterToClose) {
      filterToClose.hide();
    }
  }

  getColumnField(rowData: any, fields: string): string {
    const fieldsArray = fields.split('.');
    for (let field of fieldsArray) {
      if (rowData?.hasOwnProperty(field)) {
        rowData = rowData[field];
      } else {
        return '';
      }
    }
    return rowData !== null ? rowData.toString() : '';
  }

  loadData(event: any = {}) {
    if (!this.isFilter) return;
    this.dataLoaded = false;
    this.filterTable.pagination.pageSize = event.rows;
    this.filterTable.pagination.currentPage = event.first
      ? Math.floor(event.first / event.rows)
      : 0;

    this.filterTable.sort.orderBy = event.sortField
      ? event.sortField
      : 'updateDate';
    this.filterTable.sort.sortAsc = event.sortOrder !== 1;
    if (this.items.content != undefined) {
      this.virtualScroll = false;
    } else {
      this.virtualScroll = true;
    }
    this.requestData.emit(this.filterTable);
  }

  applyFilterGlobal(model: string) {
    if (this.lastTimeout) {
      clearTimeout(this.lastTimeout);
    }
    this.lastTimeout = setTimeout(() => {
      this.addOrUpdateFilter({
        fieldFilter: this.globalFilterFields,
        compFilter: 'like',
        valueFilter: model,
      });
    }, 350);
  }

  addOrUpdateFilter(newFilter: {
    fieldFilter: string;
    compFilter: string;
    valueFilter: any;
  }) {
    const index = this.filterTable.filter.findIndex(
      (f) => f.fieldFilter === newFilter.fieldFilter
    );

    if (index !== -1) {
      this.filterTable.filter[index] = newFilter;
    } else {
      this.filterTable.filter.push(newFilter);
    }

    this.requestData.emit(this.filterTable);
  }

  changeSelection(event: boolean) {
    this.modelRadioButton = event;
    this.filterValue = '';
  }

  changeSelectionFilter(event: boolean, field: string) {
    this.dataLoaded = true;
    if (this.lastSelection[field] === event) {
      this.isRadioSelect[field] = false;
      this.cleanFilter(field);
      this.lastSelection[field] = null;
    } else {
      if (this.lastSelection[field] !== null) {
        this.cleanFilter(field);
      }
      if (!this.filterValues[field]) {
        this.filterValues[field] = {};
      }
      this.filterValues[field].radioButtonModel = event;
      this.filterValues[field].valueSimilarTo = '';
      this.filterValues[field].valueEqualTo = '';
      this.isRadioSelect[field] = true;
      this.lastSelection[field] = event;
    }
  }

  getElements(field: any) {
    let data = [];
    data.push(field);
    return data;
  }

  closeFilter() {
    this.hideFilter = false;
  }

  clearAllFilters() {
    this.columns.forEach((col: any) => {
      if (col.filter) {
        // Limpiar los filtros aplicados
        this.filterValues[col.field] = {
          valueSimilarTo: '',
          valueEqualTo: '',
          radioButtonModel: null,
        };

        // Limpiar los filtros temporales (UI)
        this.pendingFilters[col.field] = {
          valueSimilarTo: '',
          valueEqualTo: '',
          radioButtonModel: null,
        };

        this.activeFilters[col.field] = false;
      }
    });

    // Limpiar la tabla de filtros
    this.filterTable.filter = [];

    // Reiniciar los acordeones (cerrarlos todos)
    this.activeIndexes = [];

    // Emitir el evento para refrescar la tabla
    this.requestData.emit(this.filterTable);

    // Cerrar el sidebar después de limpiar
    this.filterVisible = false;
  }

  applyAllFilters() {
    this.dataLoaded = false;
    this.filterTable.filter = [];

    // Transferir los valores temporales de pendingFilters a filterValues
    Object.keys(this.pendingFilters).forEach((field) => {
      this.filterValues[field] = { ...this.pendingFilters[field] };
    });

    this.columns.forEach((col: any) => {
      if (col.filter) {
        const filter = this.filterValues[col.field];
        if (filter.radioButtonModel) {
          this.filterTable.filter.push({
            fieldFilter: col.field,
            compFilter: 'like',
            valueFilter: filter.valueSimilarTo,
          });
        } else if (filter.valueEqualTo) {
          if (col.field.indexOf('Date') >= 0) {
            this.filterTable.filter.push({
              fieldFilter: col.field,
              compFilter: '>=',
              valueFilter: this.formatDateSet(
                filter.valueEqualTo.setHours(0, 0, 0, 0)
              ),
            });
            this.filterTable.filter.push({
              fieldFilter: col.field,
              compFilter: '<=',
              valueFilter: this.formatDateSet(
                filter.valueEqualTo.setHours(23, 59, 59, 0)
              ),
            });
          } else {
            this.filterTable.filter.push({
              fieldFilter: col.field,
              compFilter: '=',
              valueFilter: filter.valueEqualTo,
            });
          }
        }
        this.activeFilters[col.field] = true;
      }
    });

    this.requestData.emit(this.filterTable);
    this.filterVisible = false;
  }

  /** Obtiene la etiqueta del Chip basado en el filtro aplicado */
  getChipLabel(col: any): string {
    if (this.filterValues[col.field]?.valueEqualTo) {
      if (col.field.indexOf('Date') >= 0)
        return new Date(
          this.filterValues[col.field].valueEqualTo
        ).toLocaleDateString('es-ES', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
      else return `${this.filterValues[col.field].valueEqualTo}`;
    } else if (this.filterValues[col.field]?.valueSimilarTo) {
      return `${this.filterValues[col.field].valueSimilarTo}`;
    }
    return '';
  }

  activeIndexes: number[] = [];
  isTabOpen(tabIndex: number): boolean {
    return this.activeIndexes?.includes(tabIndex);
  }

  get hasActiveFilters(): boolean {
    return Object.values(this.pendingFilters).some(
      (filter) =>
        (filter.valueEqualTo && filter.valueEqualTo !== '') ||
        (filter.valueSimilarTo && filter.valueSimilarTo !== '') ||
        filter.radioButtonModel !== null
    );
  }

  get hasActiveChips(): boolean {
    return this.columns.some((col: any) => this.isActiveFilter(col.field));
  }

  hasColumnFilter(): boolean {
    return this.columns.some((col: any) => col.filter);
  }

  get shouldShowSkeleton(): boolean {
    return (
      !this.items ||
      (typeof this.items === 'object' &&
        !Array.isArray(this.items) &&
        Object.keys(this.items).length === 0)
    );
  }

  get isArrayItems(): boolean {
    return Array.isArray(this.items);
  }

  @HostListener('window:resize', [])
  onResize() {
    this.checkScreenSize();
  }

  checkScreenSize() {
    this.isSmallScreen = window.innerWidth < 991; // lg en PrimeFlex
    this.currentPageReportTemplate = this.isSmallScreen
      ? '{first}/{last}'
      : 'Showing {first} to {last} of {totalRecords} total.';
  }

  data(event: any) {
    console.log(event);
  }

  /**
   * Format date for set input
   * @param date
   * @returns
   */
  formatDateSet(date: any) {
    const opciones: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };
    const formateador = new Intl.DateTimeFormat('en-CA', opciones);
    const fechaFormateada = formateador.format(date);
    return fechaFormateada.replace(',', '');
  }
}
