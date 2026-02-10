import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GSidebarComponent } from './g-sidebar.component';

export * from './g-sidebar.component';

@NgModule({
  declarations: [GSidebarComponent],
  imports: [CommonModule],
  exports: [GSidebarComponent],
})
export class GSidebarModule {}
