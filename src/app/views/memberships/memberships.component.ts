import {
  ChangeDetectorRef,
  Component,
  HostListener,
  OnInit,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ModelMembership } from 'src/app/models/mermbership-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { CommonService } from 'src/app/services/common.service';
import { MembershipService } from 'src/app/services/membership.service';
import { ToastService } from 'src/app/services/utils/toast.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'app-memberships',
  templateUrl: './memberships.component.html',
  styleUrls: ['./memberships.component.scss'],
})
export class MembershipsComponent extends AutoUtils implements OnInit {
  hover: boolean = false;
  listMemberships: ModelMembership[] = [];
  listAllMemberships: ModelMembership[] = [];
  membershipFilter?: string;
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
  listTypesFilter: any[] = [];
  types: string = '';
  typesFilter: any[] = [];
  showFilters: boolean = false;
  labelFiltro: string = '';

  modalCreate: boolean = false;
  principalTitle: string = 'Crear membresía';
  newMembership: ModelMembership = new ModelMembership();
  listTypes: any[] = [];
  listExpires: any[] = [];
  merbershipForm: FormGroup = new FormGroup({});
  errorText: string = 'Este campo es obligatorio para continuar';
  showInfo: boolean = false;
  isModify: boolean = false;

  constructor(
    private readonly membershipService: MembershipService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly fb: FormBuilder
  ) {
    super();
  }

  ngOnInit(): void {
    this.labelFiltro = 'Tipo de membresía';
    this.getListTypes();
    this.getListMembership();
  }

  getListMembership() {
    let filtros: Filter[] = [];
    if (this.status !== '') {
      filtros.push(new Filter('status', 'in', this.status));
    }
    if (this.types !== '') {
      filtros.push(new Filter('membershipTypeId', 'in', this.types));
    }
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(this.rows, this.page),
      new Sort('id', true)
    );
    this.addSubscription(
      this.membershipService.getMembershipFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listMemberships = res.data.content;
            this.listAllMemberships = [...this.listMemberships];
            this.totalElements = res.data.totalElements;
          }
        },
        error: (err: Error) => {
          this.listMemberships = [];
          this.totalElements = 0;
        },
      })
    );
  }

  onPageChange(event: any) {
    this.page = event.page;
    this.rows = event.rows;
    this.getListMembership();
  }

  cleanFilter() {
    this.statusFilter = [];
    this.typesFilter = [];
    this.showFilters = false;
    this.getStringFilters();
    this.getListMembership();
  }

  applyFilter() {
    this.showFilters = true;
    this.page = 0;
    this.getStringFilters();
    this.getListMembership();
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

  createNewMembership() {
    this.principalTitle = 'Crear membresía';
    this.createForm();
    this.getListTypes();
    this.getListExpires();
    this.newMembership = new ModelMembership();
    this.modalCreate = true;
    this.isModify = false;
  }

  createForm() {
    this.merbershipForm = this.fb.group({
      name: ['', Validators.required],
      membershipTypeId: ['', Validators.required],
      cantSessions: [''],
      price: [''],
      expiresId: [''],
    });
  }

  applyFilterMembresia(filter: string) {
    if (!filter) {
      this.listMemberships = [...this.listAllMemberships];
    } else {
      this.listMemberships = [...this.listAllMemberships];
      this.listMemberships = this.listMemberships.filter((item) =>
        item.name!.toLowerCase().includes(filter.toLowerCase())
      );
    }
  }

  isInvalid(field: string) {
    return (
      this.merbershipForm.get(field)?.invalid &&
      this.merbershipForm.get(field)?.touched
    );
  }

  getListTypes() {
    this.addSubscription(
      this.membershipService.getListMembershipTypes().subscribe({
        next: (res) => {
          if (res.data) {
            this.listTypes = res.data;
            let types = res.data.map(
              (type: {
                membershipTypeId: number;
                membershipTypeName: string;
              }) => ({
                id: type.membershipTypeId,
                name: type.membershipTypeName,
              })
            );
            this.listTypesFilter = types;
          }
        },
        error: (err) => {
          console.error('Error al obtener los tipos de membresías', err);
        },
      })
    );
  }

  getListExpires() {
    this.addSubscription(
      this.commonService.getExpires().subscribe({
        next: (res) => {
          if (res.data) {
            this.listExpires = res.data;
          }
        },
        error: (err) => {
          console.error('Error al obtener los vencimientos', err);
        },
      })
    );
  }

  setType() {
    if (this.newMembership.membershipTypeId === 1) {
      this.merbershipForm
        .get('cantSessions')
        ?.setValidators([Validators.required]);
      this.merbershipForm.get('price')?.setValidators([Validators.required]);
      this.merbershipForm
        .get('expiresId')
        ?.setValidators([Validators.required]);
    } else if (this.newMembership.membershipTypeId === 2) {
      this.merbershipForm.get('cantSessions')?.clearValidators();
      this.merbershipForm.get('price')?.setValidators([Validators.required]);
      this.merbershipForm
        .get('expiresId')
        ?.setValidators([Validators.required]);
    } else {
      this.merbershipForm.get('cantSessions')?.clearValidators();
      this.merbershipForm.get('price')?.clearValidators();
      this.merbershipForm.get('expiresId')?.clearValidators();
    }
    this.cdr.detectChanges();
  }

  toggleInfo() {
    this.showInfo = !this.showInfo;
  }

  goBack() {
    this.modalCreate = false;
  }

  completeInfo() {
    if (this.newMembership.membershipTypeId)
      this.newMembership.membershipTypeName = this.listTypes.find(
        (x) => x.membershipTypeId == this.newMembership.membershipTypeId
      ).membershipTypeName;

    if (this.newMembership.expiresId)
      this.newMembership.expiresName = this.listExpires.find(
        (x) => x.expiresId == this.newMembership.expiresId
      ).expiresName;
  }

  openDetail(id: number) {
    if (id !== undefined) {
      this.createNewMembership();
      this.principalTitle = 'Modificar membresía';
      this.newMembership = this.listMemberships.filter((x) => x.id === id)[0];
      this.setType();
      this.merbershipForm.get('membershipTypeId')!.disable();
      this.isModify = true;
    } else {
      this.modalCreate = false;
    }
  }

  createMembership() {
    if (this.merbershipForm.valid) {
      this.completeInfo();
      this.newMembership.status = 'Active';
      this.addSubscription(
        this.membershipService.createMemberhip(this.newMembership).subscribe({
          next: (res) => {
            if (res.data) {
              this.modalCreate = false;
              this.getListMembership();
              if (!this.isModify) {
                this.toastService.showSuccess(
                  'Creación exitosa',
                  'Membresía creada con éxito.'
                );
              } else {
                this.toastService.showSuccess(
                  'Modificación exitosa',
                  'Membresía modificada con éxito.'
                );
              }
            }
          },
          error: (err) => {
            let detail = !this.isModify
              ? 'Error al crear membresía.'
              : 'Error al modificar membresía.';
            let title = !this.isModify
              ? 'Creación fallida'
              : 'Modificación fallida';
            if (err.error.code == 409)
              detail = 'Existe una membresía con el mismo nombre y tipo';

            this.toastService.showError(title, detail);
          },
        })
      );
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
