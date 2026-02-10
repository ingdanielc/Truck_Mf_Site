import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { GFilterModule } from './g-filter/g-filter.module';
import { GMenuModule } from './g-menu/g-menu.module';
import { GCardMembershipModule } from './g-card-membership/g-card-membership.module';
import { GCardPartnerModule } from './g-card-partner/g-card-partner.module';
import { GCardPartnerDetailModule } from './g-card-partner-detail/g-card-partner-detail.module';
import { GCardSetMembershipModule } from './g-card-set-membership/g-card-set-membership.module';
import { GCardPaymentModule } from './g-card-payment/g-card-payment.module';
import { GCardPartnerAccessModule } from './g-card-partner-access/g-card-partner-access.module';
import { GTitleModule } from './g-title/g-title.module';
import { GOptionCardModule } from './g-option-card/g-option-card.module';
import { GCardUserModule } from './g-card-user/g-card-user.module';

export * from './g-card-membership/g-card-membership.module';

@NgModule({
  imports: [CommonModule],
  exports: [
    HttpClientModule,
    GOptionCardModule,
    GFilterModule,
    GTitleModule,
    GMenuModule,
    GCardMembershipModule,
    GCardPartnerModule,
    GCardPartnerDetailModule,
    GCardSetMembershipModule,
    GCardPaymentModule,
    GCardPartnerAccessModule,
    GCardUserModule,
  ],
  declarations: [],
})
export class ComponentsModule {}
