import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

type DocumentKind = 'image' | 'pdf' | 'other';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];

/**
 * Visor de documentos dentro de la aplicación.
 *
 * Existe por un problema concreto: la app se instala como PWA en modo
 * `standalone` y su manifiesto no declara `scope`, así que el ámbito es todo el
 * dominio. Los documentos se sirven de ese mismo dominio, de modo que abrirlos
 * con `window.open` no lanzaba una pestaña nueva sino una navegación dentro de
 * la propia ventana instalada —sin barra de direcciones ni botón atrás— y no
 * había forma de volver. Mostrarlos aquí evita salir de la app.
 *
 * Las imágenes y los PDF comparten origen con el sitio, así que se incrustan
 * sin CORS de por medio. La excepción es el PDF en Android, que ningún
 * navegador de la plataforma pinta dentro de un `iframe`: ahí, en lugar de un
 * marco en blanco, se ofrecen descargar —el atributo `download` sí funciona
 * porque el archivo es del mismo origen— o abrir fuera, que es una salida
 * anunciada y no una trampa.
 */
@Component({
  selector: 'g-document-viewer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-document-viewer.component.html',
  styleUrls: ['./g-document-viewer.component.scss'],
})
export class GDocumentViewerComponent implements OnInit, OnDestroy {
  @Input({ required: true }) url!: string;
  /** Nombre del documento; encabeza el visor y nombra la descarga. */
  @Input() name: string = 'Documento';

  @Output() close = new EventEmitter<void>();

  kind: DocumentKind = 'other';
  /** URL saneada del `iframe`; null cuando el documento no se incrusta. */
  safeUrl: SafeResourceUrl | null = null;
  /** El visor no puede pintar el documento y ofrece descargar o abrir fuera. */
  cannotEmbed: boolean = false;
  loading: boolean = true;
  failed: boolean = false;

  private previousOverflow: string = '';

  constructor(
    private readonly sanitizer: DomSanitizer,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  ngOnInit(): void {
    this.kind = this.resolveKind(this.url);

    // Android no pinta PDF en un `iframe`. Se detecta antes de intentarlo para
    // no dejar al usuario mirando un marco vacío sin explicación.
    this.cannotEmbed = this.kind !== 'image' && this.isAndroid;

    if (!this.cannotEmbed && this.kind !== 'image') {
      this.safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.url);
    }
    if (this.cannotEmbed) {
      this.loading = false;
    }

    // El visor se cuelga del `body`. Sin esto quedaría preso de su contenedor:
    // el offcanvas de documentos se anima con `transform`, y un ancestro
    // transformado pasa a ser el marco de referencia de `position: fixed`, así
    // que la capa cubriría solo el panel en vez de la pantalla.
    document.body.appendChild(this.host.nativeElement);

    // El fondo no debe desplazarse mientras el visor está abierto.
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
    this.host.nativeElement.remove();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.dismiss();
  }

  private get isAndroid(): boolean {
    return /android/i.test(navigator.userAgent);
  }

  private resolveKind(url: string): DocumentKind {
    const path = (url || '').split(/[?#]/)[0];
    const extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase();
    if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
    if (extension === 'pdf') return 'pdf';
    return 'other';
  }

  /** Nombre del archivo guardado: el del documento con su extensión real. */
  get downloadName(): string {
    const path = (this.url || '').split(/[?#]/)[0];
    const original = path.substring(path.lastIndexOf('/') + 1);
    const extension = original.includes('.')
      ? original.substring(original.lastIndexOf('.'))
      : '';
    const base = (this.name || 'documento').replace(/[\\/:*?"<>|]/g, '').trim();
    return `${base || 'documento'}${extension}`;
  }

  onLoaded(): void {
    this.loading = false;
  }

  onError(): void {
    this.loading = false;
    this.failed = true;
  }

  /** Salida anunciada: se abre fuera solo si el usuario lo pide. */
  openExternally(): void {
    window.open(this.url, '_blank', 'noopener');
  }

  dismiss(): void {
    this.close.emit();
  }

  /** El clic en el fondo cierra; el del contenido no debe propagarse. */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.dismiss();
    }
  }
}
