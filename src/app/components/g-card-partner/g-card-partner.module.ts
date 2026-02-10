import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCardPartnerComponent } from './g-card-partner.component';
import { ButtonModule } from 'primeng/button';
import { GCardSetMembershipModule } from '../g-card-set-membership/g-card-set-membership.module';

export * from './g-card-partner.component';

@NgModule({
  declarations: [GCardPartnerComponent],
  imports: [CommonModule, ButtonModule, GCardSetMembershipModule],
  exports: [GCardPartnerComponent],
})
export class GCardPartnerModule {}
