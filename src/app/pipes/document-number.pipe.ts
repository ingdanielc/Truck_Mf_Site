import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'documentNumber',
  standalone: true,
})
export class DocumentNumberPipe implements PipeTransform {
  transform(value: any): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    // Ensure it's a string and remove non-digit characters if any
    // However, for document numbers we usually want just digits.
    // If it's already a formatted string, we might want to be careful.
    const stringValue = String(value).replace(/\D/g, '');

    if (stringValue === '') {
      return String(value);
    }

    const numberValue = Number(stringValue);

    if (isNaN(numberValue)) {
      return String(value);
    }

    return new Intl.NumberFormat('es-CO').format(numberValue);
  }
}
