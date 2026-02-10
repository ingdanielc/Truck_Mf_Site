import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ModelAccessControl } from 'src/app/models/access-control-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ModelPartnerMembership } from 'src/app/models/partner-mermbership-model';
import { ModelPartner } from 'src/app/models/partner-model';
import { AccessControlService } from 'src/app/services/access-control.service';
import { PartnerService } from 'src/app/services/partner.service';
import { ToastService } from 'src/app/services/utils/toast.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'app-access-control',
  templateUrl: './access-control.component.html',
  styleUrls: ['./access-control.component.scss'],
})
export class AccessControlComponent extends AutoUtils implements OnInit {
  errorText: string = 'Este campo es obligatorio para continuar';
  errorNoExist: string =
    'No existe un socio registrado con esa identificación ó celular';
  errorManyPartners: string =
    'Existen varios socios registrados con este número de celular. Por favor utilice número de documento';
  identification?: number;
  partner: ModelPartner = new ModelPartner();
  listMembership: ModelPartnerMembership[] = [];
  accessForm: FormGroup = new FormGroup({});
  settings: any = [
    {
      title: 'Ingresos Permitidos',
      today: 0,
      yesterday: 0,
      icon: 'fa-solid fa-users',
      link: '/site/access-control/list-access-control',
    },
    {
      title: 'Ingresos Denegados',
      today: 0,
      yesterday: 0,
      icon: 'fa-solid fa-users-gear',
      link: '/site/access-control/list-access-control',
    },
    {
      title: 'Tiempo máximo',
      amountCreated: 4566,
      amountProgress: 268,
      icon: 'fa-solid fa-stopwatch',
      link: '/site/access-control/list-access-control',
    },
  ];
  showSetMembership: boolean = false;
  accessValid: boolean = false;
  showPartnerDetail: boolean = false;
  partnerNoExist: boolean = false;
  manyPartners: boolean = false;
  listAccessControl: any[] = [];
  lastAccess: ModelAccessControl = new ModelAccessControl();
  partnerMembership: ModelPartnerMembership = new ModelPartnerMembership();

  constructor(
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly partnerService: PartnerService,
    private readonly accessControlService: AccessControlService,
    private readonly toastService: ToastService,
    private readonly cdr: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.createForm();
    this.updateCounts();
  }

  updateCounts() {
    this.getTodayAccessCount('Granted');
    this.getYesterdayAccessCount('Granted');
    this.getTodayAccessCount('Denied');
    this.getYesterdayAccessCount('Denied');
  }

  createForm() {
    this.accessForm = this.fb.group({
      identification: ['', Validators.required],
    });
  }

  btnCreateNewPartner() {
    this.router.navigate([`/site/partners/create-partner`]);
  }

  btnSetMembership() {
    this.showSetMembership = true;
  }

  isInvalid(field: string) {
    if (
      this.accessForm.get(field)?.invalid &&
      this.accessForm.get(field)?.touched
    )
      this.partnerNoExist = false;
    return (
      this.accessForm.get(field)?.invalid && this.accessForm.get(field)?.touched
    );
  }

  validatePartner() {
    if (this.identification) {
      this.getPartnerByDocumentNumber(this.identification.toString());
    }
  }

  getPartnerByDocumentNumber(identification: string) {
    let listField: any[] = [];
    listField.push(new Filter('documentNumber', '=', identification));
    let filter = new ModelFilterTable(
      listField,
      new Pagination(10, 0),
      new Sort('id', true)
    );
    this.getPartner(filter, identification, true);
  }

  getPartnerByCellPhone(identification: string) {
    let listField: any[] = [];
    listField.push(new Filter('cellPhone', '=', identification));
    let filter = new ModelFilterTable(
      listField,
      new Pagination(10, 0),
      new Sort('id', true)
    );
    this.getPartner(filter, identification, false);
  }

  getPartner(filter: any, identification: string, reSearch: boolean) {
    this.addSubscription(
      this.partnerService.getPartnerFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content && res?.data?.totalElements > 0) {
            if (res?.data?.totalElements > 1) {
              this.manyPartners = true;
            } else {
              this.partner = res.data.content[0];
              this.partnerNoExist = false;
              this.getMembershipsByPartner(this.partner.id!);
            }
          } else {
            if (reSearch) this.getPartnerByCellPhone(identification);
            else this.partnerNoExist = true;
          }
        },
        error: (err: Error) => {
          console.error(err);
          if (reSearch) this.getPartnerByCellPhone(identification);
          else this.partnerNoExist = true;
        },
      })
    );
  }

  getMembershipsByPartner(partnerId: number) {
    this.addSubscription(
      this.partnerService.getMembershipByPartner(partnerId).subscribe({
        next: (res: any) => {
          if (res.data) {
            this.listMembership = res.data;
            // Se valida el estado de las membresias, para verificar acceso
            this.validateAccessControl();
          }
        },
        error: (err: Error) => {
          console.error(err);
        },
      })
    );
  }

  validateAccessControl() {
    this.accessValid = false;
    for (let membership of this.listMembership) {
      this.accessValid = membership.status === 'Active';
      if (this.accessValid) {
        if (
          membership.cantSessions !== null &&
          membership.cantSessions !== undefined
        ) {
          this.accessValid = membership?.cantSessions > 0;
          if (this.accessValid) {
            this.partnerMembership = membership;
            break;
          }
        } else {
          this.partnerMembership = membership;
          break;
        }
      }
    }
    this.showPartnerDetail = true;
    this.identification = undefined;
    this.cdr.detectChanges();

    // TODO: Disparar apertura de puerta
    this.validateRecentAccess();
  }

  validateRecentAccess() {
    this.addSubscription(
      this.accessControlService
        .getAccessControlByPartner(this.partner.id!)
        .subscribe({
          next: (res: any) => {
            if (res.data) {
              this.listAccessControl = res.data.sort(
                (a: any, b: any) =>
                  new Date(b.creationDate).getTime() -
                  new Date(a.creationDate).getTime()
              );

              let yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              let previousDate = this.listAccessControl[0]
                ? new Date(this.listAccessControl[0].creationDate)
                : yesterday;
              let actualDate = new Date();
              const difference = actualDate.getTime() - previousDate.getTime();
              // const hoursDiff = difference / (1000 * 60 * 60); // TODO: se debe dejar en horas
              const hoursDiff = difference / (1000 * 60); // minutos
              if (hoursDiff > 1) this.saveAccessControl();
            }
          },
          error: (err: Error) => {
            console.error(err);
          },
        })
    );
  }

  saveAccessControl() {
    let accessControl = new ModelAccessControl();
    accessControl.partner.id = this.partner.id!;
    accessControl.accessTime = new Date();
    accessControl.status = this.accessValid ? 'Granted' : 'Denied';
    this.addSubscription(
      this.accessControlService.createAccessControl(accessControl).subscribe({
        next: (res: any) => {
          if (res.data) {
            this.lastAccess = res.data;
            this.toastService.showSuccess(
              'Creación exitosa',
              'Ingrreso de socio realizado con éxito.'
            );
            this.updatePartnerMembership();
            this.updateCounts();
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.toastService.showError(
            'Creación fallida',
            'Error al ingresar socio.'
          );
        },
      })
    );
  }

  updatePartnerMembership() {
    if (!this.partnerMembership.id) return;
    let expirationDate = new Date(this.partnerMembership.expirationDate!);
    this.partnerMembership.status =
      expirationDate < new Date() ? 'Inactive' : 'Active';

    this.partnerMembership.cantSessions = this.partnerMembership.cantSessions
      ? this.partnerMembership.cantSessions - 1
      : this.partnerMembership.cantSessions;

    if (
      this.partnerMembership.cantSessions !== null &&
      this.partnerMembership.cantSessions !== undefined
    ) {
      this.partnerMembership.status =
        this.partnerMembership.cantSessions > 0 ? 'Active' : 'Inactive';
    }

    this.addSubscription(
      this.partnerService.setMembership(this.partnerMembership).subscribe({
        next: (res: any) => {
          if (res.data) {
            console.log('Actualización exitosa de membresía');
          }
        },
        error: (err: Error) => {
          console.error('Error al actualizar membresía');
        },
      })
    );
    this.cdr.detectChanges();
  }

  getTodayAccessCount(status: string) {
    let filtros: Filter[] = [];
    filtros.push(new Filter('status', 'in', status));

    let startDate = new Date();
    startDate.setHours(0, 0, 0);
    let start = this.formatDateSet(startDate);
    let endDate = new Date();
    endDate.setDate(endDate.getDate() + 1);
    endDate.setHours(23, 59, 59);
    let end = this.formatDateSet(endDate);
    filtros.push(new Filter('accessTime', '>=', start));
    filtros.push(new Filter('accessTime', '<', end));

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(1000, 0),
      new Sort('accessTime', false)
    );
    this.accessControlService
      .getCountAccessControlFilter(filter)
      .subscribe((res) => {
        if (res.data) {
          if (status === 'Granted') {
            this.settings.find((s: any) => {
              if (s.title == 'Ingresos Permitidos') {
                s.today = res.data;
              }
            });
          } else {
            this.settings.find((s: any) => {
              if (s.title == 'Ingresos Denegados') {
                s.today = res.data;
              }
            });
          }
        }
      });
  }

  getYesterdayAccessCount(status: string) {
    let filtros: Filter[] = [];
    filtros.push(new Filter('status', 'in', status));

    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(0, 0, 0);
    let start = this.formatDateSet(startDate);
    let endtDate = new Date();
    endtDate.setHours(0, 0, 0);
    let end = this.formatDateSet(endtDate);
    filtros.push(new Filter('accessTime', '>=', start));
    filtros.push(new Filter('accessTime', '<', end));

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(1000, 0),
      new Sort('accessTime', false)
    );
    this.accessControlService
      .getCountAccessControlFilter(filter)
      .subscribe((res) => {
        if (res.data) {
          if (status === 'Granted') {
            this.settings.find((s: any) => {
              if (s.title == 'Ingresos Permitidos') {
                s.yesterday = res.data;
              }
            });
          } else {
            this.settings.find((s: any) => {
              if (s.title == 'Ingresos Denegados') {
                s.yesterday = res.data;
              }
            });
          }
        }
      });
  }
}
