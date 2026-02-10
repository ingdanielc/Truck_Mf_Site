import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewsRoutingModule } from './views-routing.module';
import { HttpClientModule } from '@angular/common/http';
import { ComponentsModule } from '../components/components.module';
import { PaginatorModule } from 'primeng/paginator';
import { FileUploadModule } from 'primeng/fileupload';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RadioButtonModule } from 'primeng/radiobutton';
import { CheckboxModule } from 'primeng/checkbox';
import { CardModule } from 'primeng/card';
import { GModalModule } from '../components/g-modal/g-modal.module';
import { MembershipsComponent } from './memberships/memberships.component';
import { GOptionCardModule } from '../components/g-option-card/g-option-card.module';
import { PanelModule } from 'primeng/panel';
import { SecurityComponent } from './security/security.component';
import { GTableModule } from '../components/g-table/g-table.module';
import { SalesComponent } from './sales/sales.component';
import { CalendarModule } from 'primeng/calendar';
import { InputTextModule } from 'primeng/inputtext';

@NgModule({
  declarations: [MembershipsComponent, SecurityComponent, SalesComponent],
  imports: [
    CommonModule,
    ViewsRoutingModule,
    HttpClientModule,
    ComponentsModule,
    PaginatorModule,
    FileUploadModule,
    ReactiveFormsModule,
    FormsModule,
    RadioButtonModule,
    CheckboxModule,
    CardModule,
    GModalModule,
    GOptionCardModule,
    PanelModule,
    GTableModule,
    CalendarModule,
    InputTextModule,
  ],
  providers: [],
})
export class ViewsModule {}
