import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { GCardPartnerDetailComponent } from './g-card-partner-detail.component';
import { GModalModule } from '../g-modal/g-modal.module';
import { PanelModule } from 'primeng/panel';

export * from './g-card-partner-detail.component';

@NgModule({
  declarations: [GCardPartnerDetailComponent],
  imports: [CommonModule, ButtonModule, GModalModule, PanelModule],
  exports: [GCardPartnerDetailComponent],
})
export class GCardPartnerDetailModule {}
