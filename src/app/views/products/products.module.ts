import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RadioButtonModule } from 'primeng/radiobutton';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ComponentsModule } from 'src/app/components/components.module';
import { ProductsComponent } from './products.component';

@NgModule({
  declarations: [ProductsComponent],
  imports: [
    CommonModule,
    RadioButtonModule,
    FormsModule,
    TableModule,
    ComponentsModule,
  ],
})
export class ProductsModule {}
