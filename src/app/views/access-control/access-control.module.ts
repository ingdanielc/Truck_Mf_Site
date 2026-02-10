import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AccessControlRoutingModule } from './access-control-routing.module';
import { ButtonModule } from 'primeng/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/utils/toast.service';
import { InputNumberModule } from 'primeng/inputnumber';
import { AccessControlComponent } from './access-control/access-control.component';
import { ListAccessControlComponent } from './list-access-control/list-access-control.component';
import { PaginatorModule } from 'primeng/paginator';
import { ComponentsModule } from 'src/app/components/components.module';

@NgModule({
  declarations: [AccessControlComponent, ListAccessControlComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    AccessControlRoutingModule,
    ButtonModule,
    InputNumberModule,
    PaginatorModule,
    ComponentsModule,
  ],
  providers: [CommonService, ToastService],
})
export class AccessControlModule {}
