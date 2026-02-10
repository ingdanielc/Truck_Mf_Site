import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { ModelAccessControl } from 'src/app/models/access-control-model';
import { ModelPartnerMembership } from 'src/app/models/partner-mermbership-model';
import { ModelPartner } from 'src/app/models/partner-model';
import { AccessControlService } from 'src/app/services/access-control.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-card-partner-access',
  templateUrl: './g-card-partner-access.component.html',
  styleUrls: ['./g-card-partner-access.component.scss'],
})
export class GCardPartnerAccessComponent
  extends AutoUtils
  implements OnChanges
{
  @Input() partner?: ModelPartner;
  @Input() accessValid?: boolean;
  @Input() show: boolean = false;
  @Input() lastAccess?: ModelAccessControl;
  @Input() partnerMembership?: ModelPartnerMembership;
  @Output() showEmiter: EventEmitter<any> = new EventEmitter<any>();

  private interval: any;
  seconds: number = 0;
  value: number = 0;
  listMembership: any[] = [];
  listAccessControl: any[] = [];

  constructor(public readonly accessControlService: AccessControlService) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.partner?.id) {
      this.value = 10;
      this.filterPartnerMembership();
      this.getListAccessControlByPartner(this.partner.id);
      this.startProgressbar();
    }
  }

  filterPartnerMembership() {
    this.listMembership = this.partner!.partnerMembership.filter(
      (x) => x.status === 'Active'
    );
    if (
      this.listMembership.length === 0 &&
      this.partner!.partnerMembership.filter((x) => x.status === 'Inactive')
        .length > 0
    ) {
      this.listMembership.push(
        this.partner!.partnerMembership.filter(
          (x) => x.status === 'Inactive'
        )[0]
      );
    }

    this.listMembership.forEach((x) => {
      if (
        x.id === this.partnerMembership!.id &&
        this.partnerMembership?.cantSessions
      )
        x.cantSessions = this.partnerMembership?.cantSessions - 1;
    });
  }

  getListAccessControlByPartner(partnerId: number) {
    this.addSubscription(
      this.accessControlService.getAccessControlByPartner(partnerId).subscribe({
        next: (res: any) => {
          if (res.data) {
            this.listAccessControl = res.data;
          }
        },
        error: (err: Error) => {
          console.error(err);
        },
      })
    );
  }

  startProgressbar() {
    let time = 8;
    this.seconds = time;
    this.interval = setInterval(() => {
      if (this.seconds === 0) {
        clearInterval(this.interval);
        this.show = false;
        this.showEmiter.emit(false);
      } else {
        this.seconds--;
        this.value += 100 / time;
      }
    }, 1000);
  }
}
