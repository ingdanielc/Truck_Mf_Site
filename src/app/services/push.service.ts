import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, firstValueFrom, timeout } from 'rxjs';
import { environment } from 'src/environments/environment';

/**
 * Suscripcion a notificaciones push (Web Push + VAPID).
 *
 * Reglas de este servicio:
 * - Nada de lo que hace puede tumbar la app. Si el navegador no soporta push,
 *   si no hay llave VAPID o si el backend no responde, todo falla en silencio y
 *   la app sigue funcionando exactamente como antes.
 * - El permiso se pide UNA sola vez en la vida del usuario: si lo bloquea no se
 *   puede volver a pedir por codigo. Por eso `requestAndSubscribe()` solo debe
 *   llamarse tras un gesto explicito, nunca en el arranque.
 *
 * El service worker que recibe los push vive en el shell (`/sw.js` de
 * Truck_Mf_Single_Spa), no en este micro-frontend.
 */
@Injectable({
  providedIn: 'root',
})
export class PushService {
  private readonly basePath: string = environment._APIUrl + '/push';

  private readonly permissionSubject = new BehaviorSubject<
    NotificationPermission | 'unsupported'
  >(this.readPermission());

  /** Estado del permiso, para que la UI reaccione sin consultar el navegador. */
  permission$ = this.permissionSubject.asObservable();

  private readonly http = inject(HttpClient);

  /** Llave publica cacheada: environment o, si esta vacia, la que da el backend. */
  private vapidPublicKey: string | null = null;

  /** Evita repetir la consulta al backend cuando ya se sabe que no hay llave. */
  private vapidLookupDone = false;

  /**
   * Hay llave VAPID disponible, es decir, el push esta realmente configurado.
   *
   * La UI DEBE consultarlo antes de invitar al usuario a activar: el permiso se
   * concede una sola vez en la vida y sin llave se gastaria sin que ninguna
   * notificacion pueda llegar, dejandolo bloqueado para siempre.
   */
  async hasVapidKey(): Promise<boolean> {
    return (await this.getVapidPublicKey()) !== null;
  }

  /** El navegador puede recibir push (Android, escritorio, iOS ya instalado). */
  get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in globalThis &&
      'Notification' in globalThis
    );
  }

  /** iOS abierto en Safari, sin instalar: ahi el push no existe todavia. */
  get needsIosInstall(): boolean {
    if (typeof navigator === 'undefined') return false;

    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      // iPadOS 13+ se reporta como Mac; se distingue por el soporte tactil.
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    return isIos && !this.isInstalled;
  }

  /** La app corre como PWA instalada (pantalla de inicio), no en el navegador. */
  get isInstalled(): boolean {
    const iosStandalone = (navigator as any).standalone === true;
    const displayMode = globalThis.matchMedia?.(
      '(display-mode: standalone)',
    )?.matches;
    return iosStandalone || displayMode === true;
  }

  /** Ya se decidio el permiso: no hay nada que preguntarle al usuario. */
  get isDecided(): boolean {
    const current = this.permissionSubject.value;
    return current === 'granted' || current === 'denied';
  }

  /**
   * Re-sincroniza la suscripcion al arrancar la app. Los push services rotan
   * los endpoints en silencio, asi que una suscripcion vieja deja de servir sin
   * avisar. Solo actua si el usuario YA dio permiso: nunca lo pide.
   */
  async syncSubscription(): Promise<void> {
    if (!this.isSupported || this.readPermission() !== 'granted') {
      return;
    }

    // Sin llave configurada el push simplemente no esta habilitado todavia: es
    // un estado normal y se sale en silencio. El aviso queda reservado para
    // `requestAndSubscribe()`, donde si seria anomalo.
    if (!(await this.hasVapidKey())) {
      return;
    }

    try {
      const registration = await this.getRegistration();
      if (!registration) return;

      const existing = await registration.pushManager.getSubscription();
      if (existing) {
        this.sendSubscription(existing);
        return;
      }

      // Permiso concedido pero sin suscripcion: el navegador la revoco. Se
      // vuelve a crear sin molestar al usuario, porque el permiso ya esta dado.
      await this.createSubscription(registration);
    } catch (error) {
      console.warn('[push] no se pudo sincronizar la suscripcion', error);
    }
  }

  /**
   * Pide el permiso y crea la suscripcion. Llamar SOLO desde un gesto del
   * usuario. Devuelve true unicamente si quedo suscrito de verdad.
   */
  async requestAndSubscribe(): Promise<boolean> {
    if (!this.isSupported) return false;

    try {
      const permission = await Notification.requestPermission();
      this.permissionSubject.next(permission);

      if (permission !== 'granted') return false;

      const registration = await this.getRegistration();
      if (!registration) return false;

      return await this.createSubscription(registration);
    } catch (error) {
      console.warn('[push] no se pudo completar la suscripcion', error);
      return false;
    }
  }

  /**
   * Da de baja el dispositivo. Se llama al cerrar sesion para que el siguiente
   * usuario del mismo celular no reciba notificaciones ajenas.
   */
  async unsubscribe(): Promise<void> {
    if (!this.isSupported) return;

    try {
      const registration = await this.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;

      // Primero se avisa al backend: despues de `unsubscribe()` el endpoint ya
      // no esta disponible para enviarlo.
      this.http
        .post(`${this.basePath}/unsubscribe`, {
          endpoint: subscription.endpoint,
        })
        .subscribe({ error: () => undefined });

      await subscription.unsubscribe();
    } catch (error) {
      console.warn('[push] no se pudo cancelar la suscripcion', error);
    }
  }

  // ── Internos ──────────────────────────────────────────────────────────

  private async createSubscription(
    registration: ServiceWorkerRegistration,
  ): Promise<boolean> {
    const key = await this.getVapidPublicKey();
    if (!key) {
      console.warn('[push] sin llave VAPID: la suscripcion queda desactivada');
      return false;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: this.urlBase64ToUint8Array(key),
    });

    this.sendSubscription(subscription);
    return true;
  }

  /**
   * Envio a la API en modo "fire and forget": si el backend todavia no tiene el
   * endpoint (404) o esta caido, no se propaga el error. El usuario ya concedio
   * el permiso y `syncSubscription()` reintentara en el proximo arranque.
   */
  private sendSubscription(subscription: PushSubscription): void {
    const payload = {
      ...subscription.toJSON(),
      userAgent: navigator.userAgent,
    };

    this.http.post(`${this.basePath}/subscribe`, payload).subscribe({
      error: (error) =>
        console.warn('[push] el backend no registro la suscripcion', error),
    });
  }

  /**
   * El service worker lo registra el shell. `ready` no resuelve nunca si no hay
   * ninguno, por eso el timeout: sin el, un `await` se quedaria colgado.
   */
  private async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);
    } catch {
      return null;
    }
  }

  private async getVapidPublicKey(): Promise<string | null> {
    if (this.vapidPublicKey) return this.vapidPublicKey;

    if (environment.vapidPublicKey) {
      this.vapidPublicKey = environment.vapidPublicKey;
      return this.vapidPublicKey;
    }

    // Sin llave en el environment se consulta al backend, que permite rotarla
    // sin volver a construir el frontend.
    try {
      const response = await firstValueFrom(
        this.http
          .get<{ data: string }>(`${this.basePath}/public-key`)
          .pipe(timeout(5000)),
      );
      this.vapidPublicKey = response?.data || null;
      return this.vapidPublicKey;
    } catch {
      return null;
    }
  }

  private readPermission(): NotificationPermission | 'unsupported' {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
  }

  /** La API del navegador exige la llave VAPID como bytes, no como base64url. */
  private urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const raw = atob(base64);

    // Se parte de un ArrayBuffer explicito: `applicationServerKey` no acepta un
    // Uint8Array respaldado por SharedArrayBuffer.
    const output = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) {
      output[i] = raw.charCodeAt(i);
    }
    return output;
  }
}
