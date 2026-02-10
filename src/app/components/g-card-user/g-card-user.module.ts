import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GCardUserComponent } from './g-card-user.component';
import { GModalModule } from '../g-modal/g-modal.module';
import { ButtonModule } from 'primeng/button';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

export * from './g-card-user.component';

@NgModule({
  declarations: [GCardUserComponent],
  imports: [
    CommonModule,
    GModalModule,
    ButtonModule,
    FormsModule,
    ReactiveFormsModule,
  ],
  exports: [GCardUserComponent],
})
export class GCardUserModule {}
