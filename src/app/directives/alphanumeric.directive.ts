import { Directive, HostListener, Input, inject } from '@angular/core';
import { NgControl } from '@angular/forms';
import { CustomValidators } from '../utils/custom-validators';

/**
 * Impide teclear lo que no sea letra, digito o espacio.
 *
 * El campo no admite el caracter y lo descarta, en vez de aceptarlo y regañar
 * al salir. Tambien cubre el pegado, que dispara este mismo evento.
 *
 * La regla no se escribe aqui: sale de `CustomValidators.cleanAlphanumeric`,
 * la misma que usa `alphanumericValidator`. Asi el campo nunca deja escribir
 * algo que luego el formulario no deje guardar.
 *
 * Uso: `gAlphanumeric` a secas, o con los caracteres que se admitan ademas,
 * como la placa, que lleva guion: `gAlphanumeric="-"`.
 */
@Directive({
  selector: '[gAlphanumeric]',
  standalone: true,
})
export class AlphanumericDirective {
  /** Caracteres admitidos ademas de letras, digitos y espacio. */
  @Input('gAlphanumeric') extra = '';

  /**
   * El control del formulario, si el campo esta enlazado a uno.
   *
   * Es opcional a proposito: la directiva tambien sirve en un campo suelto,
   * como el buscador de un desplegable, donde solo hay que limpiar el texto.
   */
  private readonly control = inject(NgControl, { optional: true, self: true });

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;

    const limpio = CustomValidators.cleanAlphanumeric(input.value, this.extra);
    if (limpio === input.value) return;

    /* El cursor se repone donde estaba menos lo que se quito: sin esto,
       corregir en mitad de una palabra lo mandaba al final. */
    const quitados = input.value.length - limpio.length;
    const cursor = (input.selectionStart ?? input.value.length) - quitados;

    /* Se corrige lo que se ve y, ademas, el valor del control. Un campo que se
       valide `onBlur` guarda lo tecleado y lo confirma al salir, asi que sin
       fijarlo se quedaria con el texto sucio por mucho que en pantalla se
       viera limpio. */
    input.value = limpio;

    /* Dos caminos porque hay dos formas de enlazar el campo. `setValue`
       corrige el control del formulario reactivo —un campo que se valide
       `onBlur` guarda lo tecleado y lo confirma al salir, asi que sin esto se
       quedaria con el texto sucio—. Y `viewToModelUpdate` es lo que empuja el
       valor a la propiedad enlazada con `[(ngModel)]`: un `setValue` silencioso
       no dispara `ngModelChange`, de modo que un buscador se quedaria con el
       texto sucio en su propiedad por muy limpia que se viera la caja, y lo
       sucio es justo lo que leeria al buscar. */
    this.control?.control?.setValue(limpio, { emitEvent: false });
    this.control?.viewToModelUpdate(limpio);

    input.setSelectionRange(cursor, cursor);
  }
}
