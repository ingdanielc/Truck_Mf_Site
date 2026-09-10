import { Injectable } from '@angular/core';

/** Lo que ejecuta la vista cuando el usuario tira hacia abajo. */
export type PullToRefreshHandler = () => void | Promise<void>;

/**
 * Quien manda en el gesto de "tirar para recargar".
 *
 * El gesto vive en el contenedor con scroll del shell, pero recargar solo lo
 * sabe hacer la vista que esta puesta. Cada vista que quiera el gesto se
 * registra al entrar y se borra al salir; mientras no haya nadie registrado la
 * directiva no hace nada, asi que las vistas sin adoptar siguen igual.
 */
@Injectable({ providedIn: 'root' })
export class PullToRefreshService {
  private handler: PullToRefreshHandler | null = null;

  register(handler: PullToRefreshHandler): void {
    this.handler = handler;
  }

  /**
   * Solo borra si el que pide es el que estaba puesto: al navegar, Angular crea
   * la vista nueva antes de destruir la vieja y el ngOnDestroy tardio borraria
   * el registro recien hecho.
   */
  unregister(handler: PullToRefreshHandler): void {
    if (this.handler === handler) this.handler = null;
  }

  get isEnabled(): boolean {
    return this.handler !== null;
  }

  async run(): Promise<void> {
    await this.handler?.();
  }
}
