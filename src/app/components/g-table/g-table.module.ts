import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GTableComponent } from './g-table.component';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { AutoFocusModule } from 'primeng/autofocus';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DropdownModule } from 'primeng/dropdown';
import { RadioButtonModule } from 'primeng/radiobutton';
import { StatusPipe } from 'src/app/pipes/status.pipe';
import { GRadioButtonModule } from '../g-radio-button/g-radio-button.module';
import { FormsModule } from '@angular/forms';
import { CalendarModule } from 'primeng/calendar';
import { ChipModule } from 'primeng/chip';
import { AccordionModule } from 'primeng/accordion';
import { GSidebarModule } from '../g-sidebar/g-sidebar.module';

export * from './g-table.component';

@NgModule({
  declarations: [GTableComponent, StatusPipe],
  exports: [GTableComponent],
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    DropdownModule,
    RadioButtonModule,
    GRadioButtonModule,
    SkeletonModule,
    AutoFocusModule,
    CalendarModule,
    ChipModule,
    AccordionModule,
    GSidebarModule,
  ],
})
export class GTableModule {}
