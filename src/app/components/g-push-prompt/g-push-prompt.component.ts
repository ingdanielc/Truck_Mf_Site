import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PushService } from '../../services/push.service';

/** Recuerda que el usuario descarto la invitacion a activar los push. */
const PUSH_DISMISSED_KEY = 'cashtruck.push.dismissed';

/**
 * La invitacion a activar los push y, donde hace falta, el paso a paso para
 * instalar la PWA.
 *
 * Vive en dos sitios con la misma logica: el panel de la campana y el Inicio.
 * El descarte es uno solo -la misma llave de `localStorage`-, asi que decir
 * "Ahora no" en cualquiera de los dos lo apaga en ambos: son el mismo aviso
 * mostrado dos veces, no dos avisos.
 *
 * Si no hay nada que ofrecer no pinta nada, ni siquiera un margen: el `:host`
 * queda vacio y los margenes van dentro del bloque.
 */
@Component({
  selector: 'app-g-push-prompt',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-push-prompt.component.html',
  styleUrl: './g-push-prompt.component.scss',
})
export class GPushPromptComponent implements OnInit {
  /**
   * 'panel' lo separa con una linea, como el resto de secciones del offcanvas;
   * 'banner' lo dibuja como tarjeta suelta, que es lo que pide el Inicio.
   */
  @Input() variant: 'panel' | 'banner' = 'panel';

  /**
   * 'ask' invita a activar los push; 'ios' explica como instalar la PWA, que en
   * iPhone es la unica forma de recibirlos; 'android' sugiere instalarla, que
   * ahi no hace falta para recibirlos pero si los hace mas constantes; 'none'
   * no muestra nada.
   */
  pushState: 'none' | 'ask' | 'ios' | 'android' = 'none';
  isSubscribing = false;

  private readonly pushService = inject(PushService);

  /** El marco cambia con el sitio; el contenido del aviso no. */
  get wrapperClass(): string {
    return this.variant === 'banner'
      ? 'border rounded-4 bg-body-tertiary shadow-sm mb-4'
      : 'border-bottom';
  }

  ngOnInit(): void {
    void this.refreshPushState();
  }

  /**
   * Unico punto donde se pide el permiso, y siempre tras un clic. El navegador
   * solo lo permite una vez: si el usuario lo bloquea no hay como volver a
   * preguntarle desde el codigo.
   */
  async onEnablePush(): Promise<void> {
    this.isSubscribing = true;
    try {
      await this.pushService.requestAndSubscribe();
    } finally {
      this.isSubscribing = false;
      await this.refreshPushState();
    }
  }

  dismissPushPrompt(): void {
    try {
      localStorage.setItem(PUSH_DISMISSED_KEY, '1');
    } catch {
      // Modo privado o almacenamiento bloqueado: se oculta solo por esta sesion.
    }
    this.pushState = 'none';
  }

  private async refreshPushState(): Promise<void> {
    if (this.isPushDismissed()) {
      this.pushState = 'none';
      return;
    }

    // Sin llave VAPID el push no esta configurado todavia: no se invita a nadie
    // a activarlo, porque el permiso se concede una sola vez y se gastaria sin
    // que ninguna notificacion pueda llegar.
    if (!(await this.pushService.hasVapidKey())) {
      this.pushState = 'none';
      return;
    }

    if (this.pushService.needsIosInstall) {
      this.pushState = 'ios';
      return;
    }

    if (this.pushService.isSupported && !this.pushService.isDecided) {
      this.pushState = 'ask';
      return;
    }

    // La instalacion se sugiere DESPUES de activar, nunca antes: en Android
    // activar es un toque y los push ya funcionan en el navegador, asi que
    // pedir primero la instalacion estorbaria lo unico que hace falta. Si el
    // permiso quedo bloqueado no se muestra nada, porque instalar no lo
    // desbloquea.
    if (this.pushService.isGranted && this.pushService.needsAndroidInstall) {
      this.pushState = 'android';
      return;
    }

    this.pushState = 'none';
  }

  private isPushDismissed(): boolean {
    try {
      return localStorage.getItem(PUSH_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }
}
