import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { PartnersRoutingModule } from './partners-routing.module';
import { CreateUpdateComponent } from './create-update/create-update.component';
import { ListComponent } from './list/list.component';
import { ButtonModule } from 'primeng/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/utils/toast.service';
import { InputNumberModule } from 'primeng/inputnumber';
import { CalendarModule } from 'primeng/calendar';
import { FileUploadModule } from 'primeng/fileupload';
import { WebcamModule } from 'ngx-webcam';
import { PaginatorModule } from 'primeng/paginator';
import { ComponentsModule } from 'src/app/components/components.module';
import { PanelModule } from 'primeng/panel';

@NgModule({
  declarations: [CreateUpdateComponent, ListComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PartnersRoutingModule,
    DropdownModule,
    ButtonModule,
    InputNumberModule,
    CalendarModule,
    FileUploadModule,
    WebcamModule,
    PaginatorModule,
    ComponentsModule,
    PanelModule,
  ],
  providers: [CommonService, ToastService],
})
export class PartnersModule {}
