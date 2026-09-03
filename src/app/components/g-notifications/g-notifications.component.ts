import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GNotificationCardComponent } from '../g-notification-card/g-notification-card.component';
import { NotificationsService } from '../../services/notifications.service';
import { SecurityService } from '../../services/security/security.service';
import { PushService } from '../../services/push.service';
import { forkJoin, Subscription, take } from 'rxjs';

/** Recuerda que el usuario descarto la invitacion a activar los push. */
const PUSH_DISMISSED_KEY = 'cashtruck.push.dismissed';

@Component({
  selector: 'app-g-notifications',
  standalone: true,
  imports: [CommonModule, GNotificationCardComponent],
  templateUrl: './g-notifications.component.html',
  styleUrl: './g-notifications.component.scss',
})
export class GNotificationsComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  isConfirmOpen = false;
  isClearing = false;

  /**
   * 'ask' invita a activar los push; 'ios' explica como instalar la PWA, que en
   * iPhone es la unica forma de recibirlos; 'none' no muestra nada.
   */
  pushState: 'none' | 'ask' | 'ios' = 'none';
  isSubscribing = false;

  private readonly notificationsService = inject(NotificationsService);
  private readonly securityService = inject(SecurityService);
  private readonly pushService = inject(PushService);

  private readonly userSub?: Subscription;

  notifications$ = this.notificationsService.notifications$;

  ngOnInit(): void {
    void this.refreshPushState();
  }

  // Component methods
  onClose(): void {
    this.close.emit();
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

    this.pushState =
      this.pushService.isSupported && !this.pushService.isDecided
        ? 'ask'
        : 'none';
  }

  private isPushDismissed(): boolean {
    try {
      return localStorage.getItem(PUSH_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  onMarkRead(id: number): void {
    const notification = this.notificationsService.getNotificationById(id);
    if (notification) {
      this.notificationsService.markAsRead(notification).subscribe();
    }
  }

  onRemove(id: number): void {
    const notification = this.notificationsService.getNotificationById(id);
    if (notification) {
      this.notificationsService.markAsDelete(notification).subscribe();
    }
  }

  onMarkAllRead(): void {
    this.notifications$.pipe(take(1)).subscribe((notifications) => {
      const unread = notifications.filter((n) => !n.isRead);
      if (unread.length === 0) return;

      const requests = unread.map((n) =>
        this.notificationsService.markAsRead(n),
      );
      forkJoin(requests).subscribe();
    });
  }

  onClearAll(): void {
    this.notifications$.pipe(take(1)).subscribe((notifications) => {
      if (notifications && notifications.length > 0) {
        this.isConfirmOpen = true;
      }
    });
  }

  confirmClearAll(): void {
    this.notifications$.pipe(take(1)).subscribe((notifications) => {
      if (notifications.length === 0) {
        this.isConfirmOpen = false;
        return;
      }

      this.isClearing = true;
      const requests = notifications.map((n) =>
        this.notificationsService.markAsDelete(n),
      );
      forkJoin(requests).subscribe({
        next: () => {
          this.isClearing = false;
          this.isConfirmOpen = false;
        },
        error: () => {
          this.isClearing = false;
          this.isConfirmOpen = false;
        },
      });
    });
  }

  cancelClearAll(): void {
    this.isConfirmOpen = false;
  }

  ngOnDestroy(): void {
    if (this.userSub) {
      this.userSub.unsubscribe();
    }
  }
}
