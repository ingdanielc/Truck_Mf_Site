import { Component, EventEmitter, Input, Output } from '@angular/core';
import {
  MANIFEST_ALLOWED_EXTENSIONS,
  MANIFEST_MAX_SIZE_MB,
  validateManifestFile,
} from 'src/app/utils/trip-manifest';

/**
 * Campo para adjuntar un archivo: la zona de carga mientras no hay nada y la
 * ficha con sus acciones cuando lo hay. Es la misma ficha del comprobante del
 * gasto y de la carga de documentos del vehículo —mismas medidas, mismos
 * iconos—, porque es el mismo gesto y no debería verse distinto.
 *
 * No sube nada: avisa del archivo elegido y quien lo usa decide cuándo
 * subirlo. El formulario del viaje lo sube al guardar; el detalle, en el acto.
 */
@Component({
  selector: 'g-file-field',
  standalone: true,
  imports: [],
  templateUrl: './g-file-field.component.html',
  styleUrls: ['./g-file-field.component.scss'],
})
export class GFileFieldComponent {
  /** Id del `input` de archivo, para el `for` de la etiqueta. */
  @Input() inputId: string = 'file';
  /** Qué se adjunta, en minúsculas: "manifiesto". Va en los títulos. */
  @Input() subject: string = 'archivo';
  /** Recién elegido y todavía sin subir. */
  @Input() file: File | null = null;
  /** URL del que ya está guardado. */
  @Input() currentUrl: string | null = null;
  /** Nombre que se muestra en la ficha. */
  @Input() fileName: string = '';
  /** Segunda línea de la ficha cuando el archivo ya está guardado. */
  @Input() currentHint: string = 'Archivo actual';
  /** Segunda línea de la ficha con el archivo recién elegido. */
  @Input() pendingHint: string = 'Se subirá al guardar';
  @Input() optional: boolean = true;
  @Input() removable: boolean = true;
  @Input() disabled: boolean = false;
  /** Subiendo: la ficha enseña la espera y no deja tocar nada. */
  @Input() busy: boolean = false;

  @Output() fileSelected = new EventEmitter<File>();
  @Output() removed = new EventEmitter<void>();
  @Output() opened = new EventEmitter<void>();

  error = '';

  readonly accepted = MANIFEST_ALLOWED_EXTENSIONS.map((ext) => '.' + ext).join(
    ',',
  );
  readonly maxSizeMb = MANIFEST_MAX_SIZE_MB;

  get hasFile(): boolean {
    return !!this.file || !!this.currentUrl;
  }

  /** Uno recién elegido todavía no tiene URL: no hay nada que abrir. */
  get canOpen(): boolean {
    return !!this.currentUrl && !this.file;
  }

  /**
   * Un archivo inválido no borra el que ya estaba: quitar es un gesto aparte,
   * así que equivocarse al reemplazar no deja al usuario sin el que tenía.
   */
  onSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    /* Se limpia siempre para que volver a elegir el mismo archivo después de
       un error vuelva a disparar el change. */
    input.value = '';
    if (!file) return;

    const error = validateManifestFile(file);
    this.error = error ?? '';
    if (!error) this.fileSelected.emit(file);
  }

  remove(): void {
    this.error = '';
    this.removed.emit();
  }
}
