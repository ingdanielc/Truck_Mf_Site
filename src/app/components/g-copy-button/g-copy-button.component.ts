import { Component, Input, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { copyToClipboard } from 'src/app/utils/clipboard';
import { ToastService } from 'src/app/services/toast.service';

/**
 * Botón para copiar un dato al portapapeles.
 *
 * Va al lado del dato —nombre, celular— y copia exactamente lo que recibe en
 * `value`, que no tiene por qué ser lo que se ve: el celular se muestra con
 * espacios para leerlo y se copia sin ellos para poder pegarlo en WhatsApp o
 * en el marcador.
 *
 * El icono cambia a un visto un par de segundos y esa es toda la confirmación:
 * la señal queda donde se tocó, y un aviso por cada copia terminaría tapando
 * la pantalla. Solo se avisa cuando falla, que es lo que no se ve.
 */
@Component({
  selector: 'g-copy-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-copy-button.component.html',
  styleUrls: ['./g-copy-button.component.scss'],
})
export class GCopyButtonComponent implements OnDestroy {
  /** Lo que se copia. Sin valor, el botón no se pinta. */
  @Input({ required: true }) value: string | null | undefined = '';

  /** Cómo se llama el dato: "Copiar nombre", y el aviso si la copia falla. */
  @Input() label: string = 'Dato';

  public copied = false;

  private timer: any = null;

  constructor(private readonly toastService: ToastService) {}

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  get hasValue(): boolean {
    return !!String(this.value ?? '').trim();
  }

  public async copy(): Promise<void> {
    if (!this.hasValue) return;

    const texto = String(this.value).trim();
    const copiado = await copyToClipboard(texto);

    if (!copiado) {
      this.toastService.showError(
        'No se pudo copiar',
        'El navegador no permitió usar el portapapeles.',
      );
      return;
    }

    /* Sin aviso de éxito: el visto en el propio botón ya lo dice, y un toast
       por cada copia tapa la pantalla en el celular. */
    this.copied = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.copied = false), 2000);
  }
}
