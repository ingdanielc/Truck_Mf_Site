import { Component, Input } from '@angular/core';
import { ModelMembership } from 'src/app/models/mermbership-model';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-card-membership',
  templateUrl: './g-card-membership.component.html',
  styleUrls: ['./g-card-membership.component.scss'],
})
export class GCardMembershipComponent extends AutoUtils {
  @Input() data?: ModelMembership;
  @Input() hover: boolean = false;
}
