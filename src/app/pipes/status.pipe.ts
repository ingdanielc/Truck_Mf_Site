import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'status',
    standalone: false
})
export class StatusPipe implements PipeTransform {
  transform(value: unknown, ...args: unknown[]): unknown {
    let status = '';
    switch (value) {
      case 'Completed':
        status = 'Finalizada';
        break;
      case 'Pending':
        status = 'Pendiente';
        break;
      case 'Cancelled':
        status = 'Rechazada';
        break;
      case 'Partial':
        status = 'Parcial';
        break;
    }
    return status;
  }
}
