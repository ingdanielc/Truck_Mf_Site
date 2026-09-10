import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  Renderer2,
} from '@angular/core';

import { PullToRefreshService } from '../../services/pull-to-refresh.service';

/** Cuanto hay que tirar, en pixeles de pantalla, para que suelte la recarga. */
const UMBRAL = 64;
/** Tope del arrastre: mas alla el dedo sigue pero el indicador ya no baja. */
const MAXIMO = 96;
/** El indicador avanza a la mitad que el dedo; asi el gesto se siente con peso. */
const RESISTENCIA = 0.55;
/** Posicion del indicador escondido sobre el borde superior. */
const REPOSO = -48;
/** Donde se queda clavado mientras recarga. */
const CARGANDO = 16;
/** Un parpadeo del spinner se lee como error; se le da un minimo de presencia. */
const MINIMO_VISIBLE = 400;

/**
 * Tirar para recargar, como en las apps moviles.
 *
 * Va sobre el contenedor con scroll del shell, no sobre el documento: en esta
 * app el documento no se mueve, asi que el gesto nativo del navegador nunca
 * dispara. Y mejor asi, porque el nativo recarga la pagina entera y aqui basta
 * con volver a pedir los datos de la vista.
 *
 * Solo actua si hay una vista registrada en PullToRefreshService. Las vistas
 * que no se registraron se comportan igual que antes.
 */
@Directive({
  selector: '[gPullToRefresh]',
  standalone: true,
})
export class PullToRefreshDirective implements OnInit, OnDestroy {
  private indicador!: HTMLElement;
  private icono!: HTMLElement;

  private inicioY = 0;
  private tirando = false;
  private desplazamiento = 0;
  private recargando = false;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
    private readonly zone: NgZone,
    private readonly servicio: PullToRefreshService,
  ) {}

  ngOnInit(): void {
    this.crearIndicador();

    // Fuera de la zona: el touchmove dispara decenas de veces por segundo y no
    // toca nada que Angular tenga que redibujar.
    this.zone.runOutsideAngular(() => {
      const el = this.host.nativeElement;
      el.addEventListener('touchstart', this.alTocar, { passive: true });
      el.addEventListener('touchmove', this.alArrastrar, { passive: false });
      el.addEventListener('touchend', this.alSoltar, { passive: true });
      el.addEventListener('touchcancel', this.alCancelar, { passive: true });
    });
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.alTocar);
    el.removeEventListener('touchmove', this.alArrastrar);
    el.removeEventListener('touchend', this.alSoltar);
    el.removeEventListener('touchcancel', this.alCancelar);
    this.indicador?.remove();
  }

  private crearIndicador(): void {
    const el = this.host.nativeElement;
    this.renderer.addClass(el, 'ptr-host');

    this.indicador = this.renderer.createElement('div');
    this.renderer.addClass(this.indicador, 'ptr-indicator');
    this.renderer.setAttribute(this.indicador, 'aria-hidden', 'true');

    this.icono = this.renderer.createElement('i');
    this.renderer.addClass(this.icono, 'fa-solid');
    this.renderer.addClass(this.icono, 'fa-arrow-down');

    this.renderer.appendChild(this.indicador, this.icono);
    this.renderer.appendChild(el, this.indicador);
    this.pintar(REPOSO, 0);
  }

  /**
   * El gesto solo nace en la cima del scroll, con un dedo, en pantalla de movil
   * y sin nada abierto encima. Cualquier otra cosa es scroll normal.
   */
  private puedeIniciar(evento: TouchEvent): boolean {
    if (this.recargando || !this.servicio.isEnabled) return false;
    if (evento.touches.length !== 1) return false;
    if (!globalThis.matchMedia?.('(max-width: 767.98px)').matches) return false;
    if (this.host.nativeElement.scrollTop > 0) return false;
    if (this.hayCapaEncima()) return false;
    return !this.vieneDeUnScrollInterno(evento.target as HTMLElement | null);
  }

  /** Panel lateral, modal o menu movil desplegado: el gesto no es para ellos. */
  private hayCapaEncima(): boolean {
    return !!document.querySelector(
      '.custom-offcanvas.open, .offcanvas.show, .modal.show, .mobile-backdrop',
    );
  }

  /**
   * Listas y paneles con scroll propio mandan sobre el gesto mientras no esten
   * en su propia cima.
   */
  private vieneDeUnScrollInterno(desde: HTMLElement | null): boolean {
    let el = desde;
    while (el && el !== this.host.nativeElement) {
      const overflow = getComputedStyle(el).overflowY;
      const scrollea = overflow === 'auto' || overflow === 'scroll';
      if (scrollea && el.scrollTop > 0) return true;
      el = el.parentElement;
    }
    return false;
  }

  private readonly alTocar = (evento: TouchEvent): void => {
    if (!this.puedeIniciar(evento)) return;
    this.inicioY = evento.touches[0].clientY;
    this.tirando = true;
    this.desplazamiento = 0;
    this.renderer.removeClass(this.indicador, 'ptr-animado');
  };

  private readonly alArrastrar = (evento: TouchEvent): void => {
    if (!this.tirando) return;

    const avance = evento.touches[0].clientY - this.inicioY;

    // Subir cancela: el usuario cambio de idea y quiere ver el contenido.
    if (avance <= 0) {
      this.tirando = false;
      this.pintar(REPOSO, 0);
      return;
    }

    // Sin esto el navegador se lleva el gesto como scroll o como rebote.
    evento.preventDefault();

    this.desplazamiento = Math.min(avance * RESISTENCIA, MAXIMO);
    this.pintar(REPOSO + this.desplazamiento, this.desplazamiento / UMBRAL);
  };

  private readonly alSoltar = (): void => {
    if (!this.tirando) return;
    this.tirando = false;
    this.renderer.addClass(this.indicador, 'ptr-animado');

    if (this.desplazamiento >= UMBRAL) {
      void this.recargar();
    } else {
      this.pintar(REPOSO, 0);
    }
  };

  private readonly alCancelar = (): void => {
    if (!this.tirando) return;
    this.tirando = false;
    this.renderer.addClass(this.indicador, 'ptr-animado');
    this.pintar(REPOSO, 0);
  };

  private async recargar(): Promise<void> {
    this.recargando = true;
    this.pintar(CARGANDO, 1);
    this.renderer.removeClass(this.icono, 'fa-arrow-down');
    this.renderer.addClass(this.icono, 'fa-arrow-rotate-right');
    this.renderer.addClass(this.indicador, 'ptr-cargando');

    const espera = new Promise<void>((listo) =>
      setTimeout(listo, MINIMO_VISIBLE),
    );

    try {
      // Dentro de la zona: la vista va a tocar sus datos y hay que redibujar.
      await Promise.all([this.zone.run(() => this.servicio.run()), espera]);
    } catch (error) {
      console.error('Error al recargar la vista:', error);
    } finally {
      this.recargando = false;
      this.desplazamiento = 0;
      this.renderer.removeClass(this.indicador, 'ptr-cargando');
      this.renderer.removeClass(this.icono, 'fa-arrow-rotate-right');
      this.renderer.addClass(this.icono, 'fa-arrow-down');
      this.pintar(REPOSO, 0);
    }
  }

  /** Unico sitio que toca el DOM del indicador: posicion, opacidad y giro. */
  private pintar(y: number, progreso: number): void {
    const avance = Math.min(Math.max(progreso, 0), 1);
    this.renderer.setStyle(
      this.indicador,
      'transform',
      `translate(-50%, ${y}px)`,
    );
    this.renderer.setStyle(this.indicador, 'opacity', `${avance}`);
    this.renderer.setStyle(
      this.icono,
      'transform',
      `rotate(${avance >= 1 ? 180 : avance * 180}deg)`,
    );
  }
}
