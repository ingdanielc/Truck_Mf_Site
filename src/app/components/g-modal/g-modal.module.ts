import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GModalComponent } from './g-modal.component';
import { SharedModule } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

export * from './g-modal.component';

@NgModule({
  declarations: [GModalComponent],
  imports: [CommonModule, DialogModule, ConfirmDialogModule, ButtonModule],
  exports: [GModalComponent, SharedModule],
})
export class GModalModule {}
