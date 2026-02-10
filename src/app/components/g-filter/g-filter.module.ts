import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GFilterComponent } from './g-filter.component';
import { ButtonModule } from 'primeng/button';
import { DropdownModule } from 'primeng/dropdown';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CalendarModule } from 'primeng/calendar';

export * from './g-filter.component';

@NgModule({
  declarations: [GFilterComponent],
  imports: [
    CommonModule,
    ButtonModule,
    DropdownModule,
    CheckboxModule,
    FormsModule,
    ReactiveFormsModule,
    CalendarModule,
  ],
  exports: [GFilterComponent],
})
export class GFilterModule {}
