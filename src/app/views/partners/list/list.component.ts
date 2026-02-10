import { ChangeDetectorRef, Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ModelPartner } from 'src/app/models/partner-model';
import { MembershipService } from 'src/app/services/membership.service';
import { PartnerService } from 'src/app/services/partner.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-list',
  templateUrl: './list.component.html',
  styleUrls: ['./list.component.scss'],
})
export class ListComponent extends AutoUtils {
  environment = environment;
  filterTable: ModelFilterTable = new ModelFilterTable();
  filterValues: { [key: string]: any } = {};
  initialColumns: any[] = [];
  btnApplyFilterIsLoanding: boolean = false;
  btnCleanFilterIsLoanding: boolean = false;

  hover: boolean = false;
  listAllPartner: ModelPartner[] = [];
  listPartner: ModelPartner[] = [];
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
    { label: 'Activo', value: 'Active' },
    { label: 'Inactivo', value: 'Inactive' },
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
    private readonly partnerService: PartnerService,
    private readonly membershipService: MembershipService
  ) {
    super();
  }

  ngOnInit() {
    this.labelFiltro = 'Membresía';
    this.getListMembership();
    this.getListPartner();
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

  getListMembership() {
    let filtros: Filter[] = [];
    if (this.status !== '') {
      filtros.push(new Filter('status', 'in', 'Active'));
    }
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true)
    );
    this.addSubscription(
      this.membershipService.getMembershipFilter(filter).subscribe({
        next: (res) => {
          if (res.data) {
            let memberships = res.data.content.map(
              (membership: { id: number; name: string }) => ({
                id: membership.id,
                name: membership.name,
              })
            );
            this.listTypes = memberships;
          }
        },
        error: (err) => {
          console.error('Error al obtener las membresías', err);
        },
      })
    );
  }

  getListPartner() {
    let filtros: Filter[] = [];
    if (this.status !== '') {
      filtros.push(new Filter('status', 'in', this.status));
    }
    if (this.types !== '') {
      filtros.push(
        new Filter('partnerMembership.membership.id', 'in', this.types)
      );
    }
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true)
    );
    this.addSubscription(
      this.partnerService.getPartnerFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listPartner = res.data.content;
            this.listAllPartner = [...this.listPartner];
            this.totalElements = res.data.totalElements;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.listPartner = [];
          this.totalElements = 0;
        },
      })
    );
  }

  onPageChange(event: any) {
    this.page = event.page;
    this.rows = event.rows;
    this.getListPartner();
  }

  applyFilterPartner(filter: string) {
    if (!filter) {
      this.listPartner = [...this.listAllPartner];
    } else {
      this.listPartner = [...this.listAllPartner];
      this.listPartner = this.listPartner.filter((item) =>
        item.name!.toLowerCase().includes(filter.toLowerCase())
      );
    }
  }

  cleanFilter() {
    this.statusFilter = [];
    this.typesFilter = [];
    this.showFilters = false;
    this.getStringFilters();
    this.getListPartner();
  }

  applyFilter() {
    this.showFilters = true;
    this.page = 0;
    this.getStringFilters();
    this.getListPartner();
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
