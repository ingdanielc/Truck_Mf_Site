import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ModelPayment } from 'src/app/models/payment-model';
import { CommonService } from 'src/app/services/common.service';
import { MembershipService } from 'src/app/services/membership.service';
import { PartnerService } from 'src/app/services/partner.service';
import { PaymentService } from 'src/app/services/payment.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';
import { ToastService } from 'src/app/services/utils/toast.service';
import { TokenService } from 'src/app/services/utils/token.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-sales',
  templateUrl: './sales.component.html',
  styleUrls: ['./sales.component.scss'],
})
export class SalesComponent extends AutoUtils {
  environment = environment;
  paymentList: any[] = [];
  filterTable: ModelFilterTable = new ModelFilterTable();
  filterElements: { [key: string]: any } = {};
  filterValues: { [key: string]: any } = {};
  initialColumns: any[] = [];
  btnApplyFilterIsLoanding: boolean = false;
  btnCleanFilterIsLoanding: boolean = false;

  modalPayment: boolean = false;
  payment: ModelPayment = new ModelPayment();
  paymentDetail: ModelPayment = new ModelPayment();
  pendingValue?: number;
  listPaymentMethod: any[] = [];

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly paymentService: PaymentService,
    private readonly partnerService: PartnerService,
    private readonly membershipService: MembershipService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly router: Router,
    private readonly tokenService: TokenService
  ) {
    super();
  }

  ngOnInit() {
    this.initializeFilterValues();
    this.getListPartner();
    this.getListMembership();
    this.getListStatusSales();
    this.getListPaymentMethod();
  }

  initializeFilterValues() {
    this.initialColumns = [
      {
        header: 'Socio',
        field: 'partner.name',
        filter: true,
      },
      {
        header: 'Membresía',
        field: 'partnerMembership.membership.name',
        filter: true,
      },
      {
        header: 'Fecha',
        field: 'creationDate',
        filter: true,
        filterType: 'basic',
        pipe: 'date',
        type: 'date',
      },
      {
        header: 'Valor',
        field: 'amount',
        filter: false,
        close: true,
        type: 'number',
      },
      {
        header: 'Saldo',
        field: 'balance',
        filter: false,
        close: true,
        type: 'number',
      },
      {
        header: 'Status',
        field: 'status',
        pipe: 'status',
        filter: true,
        filterType: 'basic',
        type: 'text',
      },
    ];

    this.initialColumns.forEach((col) => {
      if (!this.filterValues[col.field]) {
        this.filterValues[col.field] = {
          valueSimilarTo: '',
          valueEqualTo: '',
          radioButtonModel: null,
        };
      }

      if (!this.filterElements[col.field]) {
        this.filterElements[col.field] = [];
      }
    });
  }

  btnCreateNewSale() {}

  btnGoSale(item: any) {
    this.paymentDetail = new ModelPayment();
    this.paymentDetail = item;
    this.paymentDetail.paymentDate = new Date(this.paymentDetail.paymentDate!);
    if (this.paymentDetail.status !== 'Completed') {
      this.pendingValue =
        this.paymentDetail.partnerMembership.membership.price! -
        this.paymentDetail.amount!;
    }

    this.modalPayment = true;
  }

  reqDataSale(event: ModelFilterTable) {
    event.pagination.pageSize == 0 ? (event.pagination.pageSize = 10) : '';
    if (event.sort.orderBy == 'balance') return;
    this.addSubscription(
      this.paymentService.getPaymentFilter(event).subscribe({
        next: (res: any) => {
          if (res && Array.isArray(res.data.content)) {
            this.paymentList = res.data;
            this.btnApplyFilterIsLoanding = false;
            this.btnCleanFilterIsLoanding = false;
            const filteredData = res.data.content.map((element: any) => {
              return {
                selectValue: element.branchName,
                selectID: element.branchCode,
              };
            });
            const uniqueFilteredData = this.removeDuplicates(filteredData);
            this.filterElements['partner'] = uniqueFilteredData;
          } else {
            console.error('Expected res.data to be an array');
          }
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error('Error fetching data: ', error);
          this.paymentList = [];
        },
      })
    );
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

  getListPartner() {
    let filter = new ModelFilterTable(
      [],
      new Pagination(500, 0),
      new Sort('name', true)
    );
    this.addSubscription(
      this.partnerService.getPartnerFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            const filteredData = res.data.content.map((element: any) => {
              return {
                selectValue: element.name,
                selectID: element.id,
              };
            });
            this.filterElements['partner.name'] =
              this.removeDuplicates(filteredData);
          }
        },
      })
    );
  }

  getListMembership() {
    let filter = new ModelFilterTable(
      [],
      new Pagination(500, 0),
      new Sort('name', true)
    );
    this.addSubscription(
      this.membershipService.getMembershipFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            const filteredData = res.data.content.map((element: any) => {
              return {
                selectValue: element.name,
                selectID: element.id,
              };
            });
            this.filterElements['partnerMembership.membership.name'] =
              this.removeDuplicates(filteredData);
          }
        },
      })
    );
  }

  getListStatusSales() {
    const filteredData = this.commonService
      .getListStatusSales()
      .map((element: any) => {
        return {
          selectValue: element.selectValue,
          selectID: element.selectId,
        };
      });
    this.filterElements['status'] = this.removeDuplicates(filteredData);
  }

  getListPaymentMethod() {
    this.addSubscription(
      this.paymentService.getListPaymentMethod().subscribe({
        next: (res) => {
          if (res.data) {
            this.listPaymentMethod = res.data;
          }
        },
        error: (err) => {
          console.error('Error al obtener metodos de pago', err);
        },
      })
    );
  }

  goBack() {
    this.modalPayment = false;
    this.payment = new ModelPayment();
  }

  setPayment(event: any) {
    this.payment = event;
  }

  savePayment() {
    this.completeInfo();
    this.addSubscription(
      this.paymentService.payMembership(this.payment).subscribe({
        next: (res) => {
          if (res.data) {
            this.toastService.showSuccess(
              'Pago exitoso',
              'Membresía pagada con éxito.'
            );
            this.modalPayment = false;
            this.router.navigate([`/site/sales`]);
          }
        },
        error: (err) => {
          this.toastService.showError(
            'Pago fallido',
            'Error al pagar membresía.'
          );
        },
      })
    );
  }

  completeInfo() {
    this.payment.id = this.paymentDetail.id;
    this.payment.partnerMembership = this.paymentDetail.partnerMembership;
    this.payment.partner = this.paymentDetail.partner;
    const getInfo = this.tokenService.getPayload();
    this.payment.user.id = getInfo ? getInfo.id : 0;

    if (this.paymentDetail.status === 'Partial') {
      this.payment.amount = this.paymentDetail.amount! + this.payment.amount!;
    }
    // Actualizar estado
    if (this.payment.amount !== this.payment.partnerMembership.price) {
      this.payment.status = 'Partial';
    } else if (this.payment.amount === this.payment.partnerMembership.price) {
      this.payment.status = 'Completed';
    }
  }
}
