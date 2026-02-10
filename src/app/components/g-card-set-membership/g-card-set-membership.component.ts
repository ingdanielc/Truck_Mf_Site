import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
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
import { ModelPartnerMembership } from 'src/app/models/partner-mermbership-model';
import { ModelPartner } from 'src/app/models/partner-model';
import { ModelPayment } from 'src/app/models/payment-model';
import { MembershipService } from 'src/app/services/membership.service';
import { PartnerService } from 'src/app/services/partner.service';
import { PaymentService } from 'src/app/services/payment.service';
import { ToastService } from 'src/app/services/utils/toast.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { NotificationsService } from 'src/app/services/notifications.service';
import { KeyValue, ModelNotification } from 'src/app/models/notification-model';
import { CommonService } from 'src/app/services/common.service';
import { TokenService } from 'src/app/services/utils/token.service';

@Component({
  selector: 'g-card-set-membership',
  templateUrl: './g-card-set-membership.component.html',
  styleUrls: ['./g-card-set-membership.component.scss'],
})
export class GCardSetMembershipComponent
  extends AutoUtils
  implements OnChanges
{
  @Input() show: boolean = false;
  @Input() partner: ModelPartner = new ModelPartner();
  @Input() goToPartners: boolean = true;
  @Output() showEmiter: EventEmitter<any> = new EventEmitter<any>();
  @Output() updateEmiter: EventEmitter<any> = new EventEmitter<any>();

  membershipForm: FormGroup = new FormGroup({});
  errorText: string = 'Este campo es obligatorio para continuar';
  showInfo: boolean = false;
  disabledFields: boolean = false;

  listPartner: ModelPartner[] = [];
  listMembership: ModelMembership[] = [];
  membership: ModelMembership = new ModelMembership();
  membershipId?: number;
  partnerMembership: ModelPartnerMembership = new ModelPartnerMembership();
  listExpires: any[] = [];

  payment: ModelPayment = new ModelPayment();

  constructor(
    private readonly membershipService: MembershipService,
    private readonly partnerService: PartnerService,
    private readonly paymentService: PaymentService,
    private readonly toastService: ToastService,
    private readonly notificationService: NotificationsService,
    private readonly commonService: CommonService,
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly tokenService: TokenService
  ) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show) {
      this.createForm();
      this.getListExpires();
      this.getListPartner();
      this.getListMembership();
      this.partnerMembership = new ModelPartnerMembership();
      this.membership = new ModelMembership();
      this.membershipId = undefined;
      if (this.partner.name) {
        this.membershipForm.get('partner')!.disable();
      }
    }
  }

  createForm() {
    this.membershipForm = this.fb.group({
      partner: ['', Validators.required],
      membership: ['', Validators.required],
      type: [''],
      cantSessions: [''],
      price: [''],
      startDate: [''],
      expirationDate: [''],
    });
  }

  getListPartner() {
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(1000, 0),
      new Sort('id', true)
    );
    this.addSubscription(
      this.partnerService.getPartnerFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listPartner = res.data.content;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.listPartner = [];
        },
      })
    );
  }

  getListMembership() {
    let filtros: Filter[] = [];
    let filter = new ModelFilterTable(
      filtros,
      new Pagination(1000, 0),
      new Sort('id', true)
    );
    this.addSubscription(
      this.membershipService.getMembershipFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listMembership = res.data.content;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.listMembership = [];
        },
      })
    );
  }

  isInvalid(field: string) {
    return (
      this.membershipForm.get(field)?.invalid &&
      this.membershipForm.get(field)?.touched
    );
  }

  toggleInfo() {
    this.showInfo = !this.showInfo;
  }

  goBack() {
    this.show = false;
    this.showEmiter.emit(false);
  }

  setMembership() {
    if (this.membershipId! >= 0) {
      this.membership = this.listMembership.filter(
        (x) => x.id === this.membershipId
      )[0];
      this.partnerMembership.membership.id = this.membership.id!;
      this.partnerMembership.cantSessions = this.membership.cantSessions!;
      this.partnerMembership.price = this.membership.price!;
      this.partnerMembership.startDate = new Date();

      if (this.membership.expiresId) {
        let expiresName = this.listExpires.find(
          (x) => x.expiresId === this.membership.expiresId
        ).expiresName;

        this.partnerMembership.expirationDate =
          this.createExpirationDate(expiresName);
      } else {
        this.partnerMembership.expirationDate = null;
      }

      this.membershipForm.get('type')!.disable();
      this.membershipForm.get('cantSessions')!.disable();
      this.membershipForm.get('price')!.disable();
    }
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

  createExpirationDate(expiresName: string): Date {
    let items = expiresName.split(' ');
    if (items[1].indexOf('día') >= 0) {
      let newDate = new Date();
      newDate.setDate(newDate.getDate() + Number(items[0]));
      return newDate;
    } else if (items[1].indexOf('mes') >= 0) {
      let newDate = new Date();
      if (items[0] == '1/2') items[0] = '0.5';
      newDate.setDate(newDate.getDate() + Number(items[0]) * 30);
      return newDate;
    } else if (items[1].indexOf('año') >= 0) {
      let newDate = new Date();
      newDate.setDate(newDate.getDate() + Number(items[0]) * 365);
      return newDate;
    }
    return new Date();
  }

  asociateMembership() {
    if (!this.membershipForm.valid) return;
    this.partnerMembership.partnerId = this.partner.id!;
    this.partnerMembership.status = 'Active';
    this.addSubscription(
      this.partnerService.setMembership(this.partnerMembership).subscribe({
        next: (res) => {
          if (res.data) {
            this.toastService.showSuccess(
              'Creación exitosa',
              'Membresía asociada al socio con éxito.'
            );
            this.sendNotification();
            if (this.membership.membershipTypeId !== 3) {
              this.savePayment(res.data.id);
            } else {
              if (this.goToPartners) {
                this.updateEmiter.emit(true);
              }
              this.show = false;
              this.showEmiter.emit(false);
            }
          }
        },
        error: (err) => {
          this.toastService.showError(
            'Creación fallida',
            'Error al asociar membresía.'
          );
        },
      })
    );
  }

  setPayment(event: any) {
    this.payment = event;
  }

  savePayment(partnerMembershipId: number) {
    this.payment.partnerMembership.id = partnerMembershipId;
    this.payment.partner.id = this.partner.id;
    const getInfo = this.tokenService.getPayload();
    this.payment.user.id = getInfo ? getInfo.id : 0;

    if (!this.payment.now) this.payment.amount = 0;
    this.addSubscription(
      this.paymentService.payMembership(this.payment).subscribe({
        next: (res) => {
          if (res.data) {
            if (this.payment.now) {
              this.toastService.showSuccess(
                'Pago exitoso',
                'Membresía pagada con éxito.'
              );
            }
            if (this.goToPartners) {
              this.updateEmiter.emit(true);
            }
            this.show = false;
            this.showEmiter.emit(false);
          }
        },
        error: (err) => {
          this.toastService.showError(
            'Pago fallido',
            'Error al pagar membresía.'
          );
          this.router.navigate(['/site/partners']);
        },
      })
    );
  }

  sendNotification() {
    let params = [];
    params.push(new KeyValue('partnerName', this.partner.name));
    params.push(
      new KeyValue(
        'startDate',
        this.formatDate(this.partnerMembership.startDate)
      )
    );
    params.push(
      new KeyValue(
        'endDate',
        this.formatDate(this.partnerMembership.expirationDate)
      )
    );
    params.push(new KeyValue('membershipName', this.membership.name));
    let message = new ModelNotification();
    message.medium = 'Whatsapp';
    message.messageType = 'COMPRA_MEMBRESIA';
    message.phone = '+57' + this.partner.cellPhone;
    message.data = params;
    message.recipients?.push('+57' + this.partner.cellPhone!);

    this.addSubscription(
      this.notificationService.sendMessages(message).subscribe({
        next: (res: any) => {
          console.log('Notificación enviada con exito.');
        },
        error: (err: Error) => {
          console.error(err);
        },
      })
    );
  }
}
