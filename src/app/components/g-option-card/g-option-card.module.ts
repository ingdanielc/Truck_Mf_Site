import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { GOptionCardComponent } from './g-option-card.component';

export * from './g-option-card.component';

@NgModule({
  declarations: [GOptionCardComponent],
  imports: [CommonModule, RouterModule],
  exports: [GOptionCardComponent],
})
export class GOptionCardModule {}
