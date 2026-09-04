import { Pipe, PipeTransform } from '@angular/core';
import { Formatters } from '../utils/formatters';

/**
 * Placa en formato ABC-123. Centraliza el formato en `Formatters.formatPlate`
 * para que todas las vistas la muestren igual, sin repetir `| uppercase` ni
 * armar el separador a mano.
 */
@Pipe({
  name: 'plate',
  standalone: true,
})
export class PlatePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return Formatters.formatPlate(value);
  }
}
