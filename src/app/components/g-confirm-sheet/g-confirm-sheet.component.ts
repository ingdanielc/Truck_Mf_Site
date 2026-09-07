import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Confirmación de una acción que no se deshace sola.
 *
 * Sube desde abajo y ocupa lo que ocupe su contenido, no la pantalla entera.
 * Se puede cerrar de tres formas —el botón, el fondo y arrastrándola hacia
 * abajo—, y las tres significan lo mismo: **cancelar**. Nada se guarda y quien
 * la abrió deja las cosas como estaban; por eso `cancel` sale también del
 * gesto, y no solo del botón.
 */
@Component({
  selector: 'g-confirm-sheet',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-confirm-sheet.component.html',
  styleUrls: ['./g-confirm-sheet.component.scss'],
})
export class GConfirmSheetComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() message = '';
  /** Clases del icono, p. ej. `fa-solid fa-ban`. */
  @Input() icon = 'fa-solid fa-circle-exclamation';
  /** Tiñe icono y botón de confirmar. */
  @Input() variant: 'primary' | 'danger' | 'warning' = 'primary';
  @Input() confirmLabel = 'Confirmar';
  @Input() cancelLabel = 'Cancelar';
  /** Guardando: bloquea los botones y también el cierre por gesto o fondo. */
  @Input() busy = false;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  /** Desplazamiento del arrastre en curso, en píxeles hacia abajo. */
  dragOffset = 0;
  private dragStartY: number | null = null;
  /** Hubo arrastre, no solo un toque. Ver `onGrabberClick`. */
  private dragged = false;

  /** Pasado este arrastre la hoja se va; por debajo vuelve a su sitio. */
  private readonly DISMISS_THRESHOLD_PX = 80;

  get iconColorClass(): string {
    return `text-${this.variant === 'primary' ? 'primary' : this.variant}`;
  }

  get iconBackgroundClass(): string {
    return `bg-${this.variant === 'primary' ? 'primary' : this.variant}`;
  }

  get confirmButtonClass(): string {
    return `btn-${this.variant}`;
  }

  onCancel(): void {
    if (this.busy) return;
    this.cancel.emit();
  }

  onConfirm(): void {
    if (this.busy) return;
    this.confirm.emit();
  }

  /* Escape cierra, como cualquier diálogo. Se escucha en el documento porque
     la hoja no recibe el foco: dentro de ella lo tiene un botón. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.onCancel();
  }

  // ── Arrastre hacia abajo ───────────────────────────────────────────

  onDragStart(event: PointerEvent): void {
    if (this.busy) return;
    this.dragStartY = event.clientY;
    this.dragged = false;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onDragMove(event: PointerEvent): void {
    if (this.dragStartY === null) return;
    /* Solo se sigue el dedo hacia abajo: hacia arriba la hoja ya está en su
       tope y estirarla no llevaría a ninguna parte. */
    this.dragOffset = Math.max(0, event.clientY - this.dragStartY);
    if (this.dragOffset > 0) this.dragged = true;
  }

  onDragEnd(): void {
    if (this.dragStartY === null) return;
    const recorrido = this.dragOffset;
    this.dragStartY = null;
    this.dragOffset = 0;

    if (recorrido > this.DISMISS_THRESHOLD_PX) this.onCancel();
  }

  /**
   * El asidero también responde al clic, para quien no arrastra —teclado
   * incluido—. Un arrastre termina en `click`, así que el que viene detrás de
   * un gesto se descarta: si no, soltar a mitad de camino cerraba la hoja que
   * `onDragEnd` acababa de devolver a su sitio.
   */
  onGrabberClick(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.onCancel();
  }
}
