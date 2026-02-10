import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCardPaymentComponent } from './g-card-payment.component';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { GRadioButtonModule } from '../g-radio-button/g-radio-button.module';

export * from './g-card-payment.component';

@NgModule({
  declarations: [GCardPaymentComponent],
  imports: [
    CommonModule,
    DropdownModule,
    InputNumberModule,
    GRadioButtonModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  exports: [GCardPaymentComponent],
})
export class GCardPaymentModule {}
