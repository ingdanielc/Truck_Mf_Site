import { ChangeDetectorRef, Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { ModelAccessControl } from 'src/app/models/access-control-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ModelPartner } from 'src/app/models/partner-model';
import { AccessControlService } from 'src/app/services/access-control.service';
import { CommonService } from 'src/app/services/common.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-list-access-control',
  templateUrl: './list-access-control.component.html',
  styleUrls: ['./list-access-control.component.scss'],
})
export class ListAccessControlComponent extends AutoUtils {
  environment = environment;
  filterTable: ModelFilterTable = new ModelFilterTable();
  filterElements: { [key: string]: any } = {};
  filterValues: { [key: string]: any } = {};
  initialColumns: any[] = [];
  btnApplyFilterIsLoanding: boolean = false;
  btnCleanFilterIsLoanding: boolean = false;
  startDate: any;
  endDate: any;

  hover: boolean = false;
  listAccessControl: ModelAccessControl[] = [];
  listAllAccessControl: ModelAccessControl[] = [];
  partner: ModelPartner = new ModelPartner();
  partnerFilter?: string;
  totalElements: number = 0;
  isSmallScreen: boolean = false;
  currentPageReportTemplate: string =
    'Mostrando {first} a {last} de {totalRecords} total.';
  rows: number = 10;
  first: number = 0;
  page: number = 0;
  listStatus: any[] = [
    { label: 'Permitido', value: 'Granted' },
    { label: 'Denegado', value: 'Denied' },
  ];
  status: string = '';
  statusFilter: any[] = [];
  listTypes: any[] = [];
  types: string = '';
  typesFilter: any[] = [];
  showFilters: boolean = false;
  labelFiltro: string = '';

  showModalDetail: boolean = false;

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly commonService: CommonService,
    private readonly accessControlService: AccessControlService
  ) {
    super();
  }

  ngOnInit() {
    this.labelFiltro = 'Tipo de membresía';
    this.getListStatus();
    if (!this.startDate && !this.endDate) {
      this.startDate = new Date();
      this.endDate = new Date();
    }
    this.getListAccessControl();
  }

  btnCreateAccess() {
    this.router.navigate([`/site/access-control`]);
  }

  btnCreateNewPartner() {
    this.router.navigate([`/site/partners/create-partner`]);
  }

  detailPartner(item: any) {
    this.showModalDetail = true;
    this.partner = item;
  }

  removeDuplicates(array: any[]) {
    const uniqueObjects = new Set();
    const filteredArray = array.filter((item: any) => {
      const serializedObject = item.selectValue
        ? item.selectValue.trim()
        : item.selectValue;
      if (uniqueObjects.has(serializedObject)) {
        return false;
      } else {
        uniqueObjects.add(serializedObject);
        return true;
      }
    });
    return filteredArray;
  }

  getListStatus() {
    const filteredData = this.commonService.getListStatus();
    this.filterElements['status'] = this.removeDuplicates(filteredData);
  }

  getListAccessControl() {
    let filtros: Filter[] = [];
    if (this.status !== '') {
      filtros.push(new Filter('status', 'in', this.status));
    }
    if (this.startDate && this.endDate) {
      this.startDate.setHours(0, 0, 0);
      let start = this.formatDateSet(this.startDate);
      this.endDate.setHours(23, 59, 59);
      let end = this.formatDateSet(this.endDate);
      if (start == end) {
        let newEndDate = new Date(this.endDate);
        newEndDate.setDate(newEndDate.getDate() + 1);
        end = this.formatDateSet(newEndDate);
      }
      filtros.push(new Filter('accessTime', '>=', start));
      filtros.push(new Filter('accessTime', '<', end));
    } else if (this.startDate) {
      filtros.push(
        new Filter('accessTime', '>=', this.formatDateSet(this.startDate))
      );
    } else if (this.endDate) {
      this.endDate.setHours(23, 59, 59);
      filtros.push(
        new Filter('accessTime', '<=', this.formatDateSet(this.endDate))
      );
    }

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('accessTime', false)
    );
    this.addSubscription(
      this.accessControlService.getAccessControlFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listAccessControl = res.data.content;
            this.listAllAccessControl = [...this.listAccessControl];
            this.totalElements = res.data.totalElements;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.listAccessControl = [];
          this.totalElements = 0;
        },
      })
    );
  }

  onPageChange(event: any) {
    this.page = event.page;
    this.rows = event.rows;
    this.getListAccessControl();
  }

  applyFilterPartner(filter: string) {
    if (!filter) {
      this.listAccessControl = [...this.listAllAccessControl];
    } else {
      this.listAccessControl = [...this.listAllAccessControl];
      this.listAccessControl = this.listAccessControl.filter((item) =>
        item.partner!.name!.toLowerCase().includes(filter.toLowerCase())
      );
    }
  }

  cleanFilter() {
    this.statusFilter = [];
    this.typesFilter = [];
    this.startDate = new Date();
    this.endDate = new Date();
    this.showFilters = false;
    this.getStringFilters();
    this.getListAccessControl();
  }

  applyFilter() {
    this.showFilters = true;
    this.page = 0;
    this.getStringFilters();
    this.getListAccessControl();
  }

  getStringFilters() {
    this.status = '';
    for (let i = 0; i < this.statusFilter.length; i++) {
      this.status += this.statusFilter[i];
      if (i < this.statusFilter.length - 1) {
        this.status += ', ';
      }
    }
    this.types = '';
    for (let i = 0; i < this.typesFilter.length; i++) {
      this.types += this.typesFilter[i];
      if (i < this.typesFilter.length - 1) {
        this.types += ', ';
      }
    }
  }

  @HostListener('window:resize', [])
  onResize() {
    this.checkScreenSize();
  }

  checkScreenSize() {
    this.isSmallScreen = window.innerWidth < 991; // lg en PrimeFlex
    this.currentPageReportTemplate = this.isSmallScreen
      ? '{first} / {last}'
      : 'Mostrando {first} a {last} de {totalRecords} total.';
  }
}
