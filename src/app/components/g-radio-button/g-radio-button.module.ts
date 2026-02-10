import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RadioButtonModule } from 'primeng/radiobutton';
import { GRadioButtonComponent } from './g-radio-button.component';

export * from './g-radio-button.component';

@NgModule({
  declarations: [GRadioButtonComponent],
  imports: [CommonModule, RadioButtonModule, FormsModule, ReactiveFormsModule],
  exports: [GRadioButtonComponent],
})
export class GRadioButtonModule {}
