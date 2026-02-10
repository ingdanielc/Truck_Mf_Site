import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { Router } from '@angular/router';
import { ModelAccessControl } from 'src/app/models/access-control-model';
import { ModelPartner } from 'src/app/models/partner-model';
import { AccessControlService } from 'src/app/services/access-control.service';
import { PartnerService } from 'src/app/services/partner.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-card-partner',
  templateUrl: './g-card-partner.component.html',
  styleUrls: ['./g-card-partner.component.scss'],
})
export class GCardPartnerComponent extends AutoUtils implements OnChanges {
  @Input() data?: ModelPartner;
  @Input() lastAccess?: ModelAccessControl;
  @Input() hover: boolean = false;
  @Input() showOptions: boolean = false;
  @Output() clickEmiter: EventEmitter<any> = new EventEmitter<any>();
  @Output() updateEmiter: EventEmitter<any> = new EventEmitter<any>();

  showSetMembership: boolean = false;
  listMembership: any[] = [];
  listAccessControl: any[] = [];

  constructor(
    private readonly router: Router,
    public readonly partnerService: PartnerService,
    public readonly accessControlService: AccessControlService
  ) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data?.id) {
      this.getListMembership();
      if (!this.showOptions) this.getListAccessControlByPartner(this.data.id);
    }
  }

  getListMembership() {
    this.listMembership = this.data!.partnerMembership.filter(
      (x) => x.status === 'Active'
    );
    if (
      this.listMembership.length === 0 &&
      this.data!.partnerMembership.filter((x) => x.status === 'Inactive')
        .length > 0
    ) {
      this.listMembership.push(
        this.data!.partnerMembership.filter((x) => x.status === 'Inactive')[0]
      );
    }
    this.listMembership = [...this.listMembership].sort(
      (a: any, b: any) =>
        new Date(b.creationDate).getTime() - new Date(a.creationDate).getTime()
    );
  }

  getListAccessControlByPartner(partnerId: number) {
    this.addSubscription(
      this.accessControlService.getAccessControlByPartner(partnerId).subscribe({
        next: (res: any) => {
          if (res.data) {
            this.listAccessControl = res.data.sort(
              (a: any, b: any) =>
                new Date(b.creationDate).getTime() -
                new Date(a.creationDate).getTime()
            );
          }
        },
        error: (err: Error) => {
          console.error(err);
        },
      })
    );
  }

  btnGoPartner(id: number) {
    this.router.navigate([`/site/partners/modify-partner`], {
      queryParams: { pc: id },
    });
  }

  btnGoSetMembership(event: any) {
    event.stopPropagation();
    this.showSetMembership = true;
  }

  btnGoSetRoutine(event: any) {
    event.stopPropagation();
  }

  btnGoSale(event: any) {
    event.stopPropagation();
  }
}
