import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCardSetMembershipComponent } from './g-card-set-membership.component';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DropdownModule } from 'primeng/dropdown';
import { GModalModule } from '../g-modal/g-modal.module';
import { GCardPaymentModule } from '../g-card-payment/g-card-payment.module';
import { CalendarModule } from 'primeng/calendar';

export * from './g-card-set-membership.component';

@NgModule({
  declarations: [GCardSetMembershipComponent],
  imports: [
    CommonModule,
    ButtonModule,
    PanelModule,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    InputNumberModule,
    DropdownModule,
    GModalModule,
    GCardPaymentModule,
    CalendarModule,
  ],
  exports: [GCardSetMembershipComponent],
})
export class GCardSetMembershipModule {}
