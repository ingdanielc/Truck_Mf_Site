import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { ModelPartnerMembership } from 'src/app/models/partner-mermbership-model';
import { ModelPartner } from 'src/app/models/partner-model';
import { AccessControlService } from 'src/app/services/access-control.service';
import { CommonService } from 'src/app/services/common.service';
import { PartnerService } from 'src/app/services/partner.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-card-partner-detail',
  templateUrl: './g-card-partner-detail.component.html',
  styleUrls: ['./g-card-partner-detail.component.scss'],
})
export class GCardPartnerDetailComponent
  extends AutoUtils
  implements OnChanges
{
  @Input() partner?: ModelPartner;
  @Input() show: boolean = false;
  @Output() showEmiter: EventEmitter<any> = new EventEmitter<any>();

  listMembership: any[] = [];
  listAccessControl: any[] = [];
  listCities: any[] = [];

  constructor(
    public readonly partnerService: PartnerService,
    public readonly accessControlService: AccessControlService,
    public readonly commonService: CommonService
  ) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes && this.partner?.id && this.show) {
      this.getMembershipsByPartner();
      this.getListAccessControlByPartner(this.partner.id);
      if (this.partner.cityId) this.getCities();
    }
  }

  getCities() {
    this.addSubscription(
      this.commonService.getCities().subscribe({
        next: (res) => {
          if (res.data) {
            this.listCities = res.data;
            this.partner!.cityName = this.listCities.filter(
              (x: any) => x.cityId === this.partner?.cityId
            )[0].cityName;
          }
        },
        error: (err) => {
          console.error('Error al obtener las ciudades', err);
        },
      })
    );
  }

  getMembershipsByPartner() {
    this.listMembership = this.partner!.partnerMembership;
    this.listMembership = [...this.listMembership].sort(
      (a: any, b: any) =>
        new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime()
    );
  }

  getListAccessControlByPartner(partnerId: number) {
    let filtros: Filter[] = [];
    filtros.push(new Filter('partner.id', '=', partnerId.toString()));

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(10, 0),
      new Sort('accessTime', false)
    );
    this.addSubscription(
      this.accessControlService.getAccessControlFilter(filter).subscribe({
        next: (res: any) => {
          if (res?.data?.content) {
            this.listAccessControl = res.data.content;
          }
        },
        error: (err: Error) => {
          console.error(err);
          this.listAccessControl = [];
        },
      })
    );
  }

  toggleMembership(event: any, partnerMembership: ModelPartnerMembership) {
    event.stopPropagation();
    partnerMembership.status =
      partnerMembership.status === 'Active' ? 'Inactive' : 'Active';
    this.addSubscription(
      this.partnerService.setMembership(partnerMembership).subscribe({
        next: (res) => {
          if (res.data) {
            if (partnerMembership.status === 'Active') {
              this.partner!.status = 'Active';
            } else {
              let status = 'Inactive';
              for (let membership of this.listMembership) {
                if (
                  membership.status == 'Active' &&
                  membership.id !== partnerMembership.id
                ) {
                  status = 'Active';
                  break;
                }
              }
              this.partner!.status = status;
            }
          }
        },
        error: (err) => {
          console.log('Error al actualizar membresía.');
        },
      })
    );
  }

  isDisabled(membership: ModelPartnerMembership): boolean {
    if (this.show) {
      let expirationDate = new Date(membership.expirationDate!);
      if (expirationDate > new Date() && !membership.cantSessions) {
        return true;
      } else if (
        expirationDate > new Date() &&
        membership.cantSessions &&
        membership.cantSessions > 0
      )
        return true;
    }
    return false;
  }
}
