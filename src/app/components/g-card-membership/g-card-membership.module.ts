import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCardMembershipComponent } from './g-card-membership.component';

export * from './g-card-membership.component';

@NgModule({
  declarations: [GCardMembershipComponent],
  imports: [CommonModule],
  exports: [GCardMembershipComponent],
})
export class GCardMembershipModule {}
