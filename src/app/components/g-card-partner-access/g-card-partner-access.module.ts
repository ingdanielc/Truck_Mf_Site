import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { GModalModule } from '../g-modal/g-modal.module';
import { PanelModule } from 'primeng/panel';
import { GCardPartnerAccessComponent } from './g-card-partner-access.component';
import { ProgressBarModule } from 'primeng/progressbar';

export * from './g-card-partner-access.component';

@NgModule({
  declarations: [GCardPartnerAccessComponent],
  imports: [
    CommonModule,
    ButtonModule,
    GModalModule,
    PanelModule,
    ProgressBarModule,
  ],
  exports: [GCardPartnerAccessComponent],
})
export class GCardPartnerAccessModule {}
