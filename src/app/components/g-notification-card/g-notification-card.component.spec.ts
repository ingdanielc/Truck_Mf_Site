import { GNotification } from 'src/app/models/g-notification.model';
import { GNotificationCardComponent } from './g-notification-card.component';

/**
 * Rótulo e ícono de cada tipo de notificación.
 *
 * Se arma la tarjeta a mano, sin `TestBed`: lo que se prueba no toca la
 * plantilla.
 */
describe('GNotificationCardComponent, rótulo e ícono por tipo', () => {
  const tarjeta = (eventType: string): GNotificationCardComponent => {
    const card = new GNotificationCardComponent();
    card.notification = { eventType } as GNotification;
    return card;
  };

  const casos: { tipo: string; rotulo: string; icono: string }[] = [
    {
      tipo: 'DOCUMENT_EVENT',
      rotulo: 'DOCUMENTO POR VENCER',
      icono: 'fa-file-circle-exclamation text-danger',
    },
    {
      tipo: 'SUBSCRIPTION_EXPIRATION',
      rotulo: 'SUSCRIPCIÓN POR VENCER',
      icono: 'fa-calendar-xmark text-danger',
    },
    {
      tipo: 'PENDING_BALANCE_ALERT',
      rotulo: 'SALDO PENDIENTE',
      icono: 'fa-hand-holding-dollar text-warning',
    },
    {
      tipo: 'OWNER_EVENT',
      rotulo: 'PROPIETARIO',
      icono: 'fa-user-tie text-info',
    },
  ];

  for (const { tipo, rotulo, icono } of casos) {
    it(`${tipo} se muestra como "${rotulo}"`, () => {
      const card = tarjeta(tipo);

      expect(card.translatedType).toBe(rotulo);
      expect(card.getIconClass()).toBe(icono);
    });
  }

  /* Un evento de suscripción que no es de vencimiento sigue con su signo de
     pesos: el nuevo ícono va por nombre exacto y no se lo lleva. */
  it('SUBSCRIPTION_EVENT conserva su ícono', () => {
    expect(tarjeta('SUBSCRIPTION_EVENT').getIconClass()).toBe(
      'fa-dollar-sign text-primary',
    );
  });

  /* Un tipo que el front todavía no conoce se ve con su nombre técnico y el
     ícono genérico, en vez de romper la tarjeta. */
  it('un tipo desconocido cae en el nombre tal cual y el ícono genérico', () => {
    const card = tarjeta('ALGO_NUEVO');

    expect(card.translatedType).toBe('ALGO_NUEVO');
    expect(card.getIconClass()).toBe('fa-circle-info text-info');
  });
});
