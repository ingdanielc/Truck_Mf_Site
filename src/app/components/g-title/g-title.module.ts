import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GTitleComponent } from './g-title.component';

export * from './g-title.component';

@NgModule({
  declarations: [
    GTitleComponent
  ],
  imports: [
    CommonModule
  ],
  exports: [GTitleComponent]
})
export class GTitleModule { }
