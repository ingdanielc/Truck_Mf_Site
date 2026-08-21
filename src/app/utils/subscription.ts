/**
 * Utilidades de la fecha fin de suscripcion del propietario.
 *
 * Regla acordada con el backend: se compara SOLO la fecha (sin hora) en la
 * zona horaria America/Bogota y el limite es inclusivo, es decir, el usuario
 * conserva el acceso durante todo el dia indicado y se bloquea al dia
 * siguiente. El control real vive en el login del backend; aqui solo se
 * calcula la presentacion.
 */
export class SubscriptionUtils {
  static readonly TIME_ZONE = 'America/Bogota';

  /** Umbral (en dias) a partir del cual se considera "proxima a vencer". */
  static readonly WARNING_DAYS = 30;

  /** Fecha de hoy en Bogota, en formato YYYY-MM-DD. */
  static today(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SubscriptionUtils.TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  /**
   * Normaliza cualquier valor recibido de la API (ISO con hora, Date, etc.)
   * a YYYY-MM-DD. Devuelve null si no hay fecha o no es interpretable.
   */
  static toDateOnly(value: any): string | null {
    if (!value) return null;

    const isoPrefix = /^\d{4}-\d{2}-\d{2}/.exec(String(value));
    if (isoPrefix) return isoPrefix[0];

    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) return null;

    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SubscriptionUtils.TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(parsed);
  }

  /** Suma meses a una fecha YYYY-MM-DD, ajustando el dia si el mes es mas corto. */
  static addMonths(dateOnly: string, months: number): string {
    const [year, month, day] = dateOnly.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1 + months, 1));
    const lastDay = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
    ).getUTCDate();
    target.setUTCDate(Math.min(day, lastDay));
    return target.toISOString().split('T')[0];
  }

  /** Fecha por defecto al crear un propietario: hoy + 12 meses. */
  static defaultEndDate(): string {
    return SubscriptionUtils.addMonths(SubscriptionUtils.today(), 12);
  }

  /**
   * Dias que faltan para el vencimiento. 0 = vence hoy (aun tiene acceso),
   * negativo = ya vencio. null cuando no hay fecha registrada.
   */
  static daysRemaining(value: any): number | null {
    const end = SubscriptionUtils.toDateOnly(value);
    if (!end) return null;

    const toUtc = (dateOnly: string) => {
      const [year, month, day] = dateOnly.split('-').map(Number);
      return Date.UTC(year, month - 1, day);
    };

    const millisPerDay = 86400000;
    return Math.round(
      (toUtc(end) - toUtc(SubscriptionUtils.today())) / millisPerDay,
    );
  }

  /** true solo si la fecha ya paso (el mismo dia del vencimiento aun accede). */
  static isExpired(value: any): boolean {
    const days = SubscriptionUtils.daysRemaining(value);
    return days !== null && days < 0;
  }

  /** true si vence dentro del umbral de aviso y todavia no ha vencido. */
  static isExpiringSoon(
    value: any,
    warningDays: number = SubscriptionUtils.WARNING_DAYS,
  ): boolean {
    const days = SubscriptionUtils.daysRemaining(value);
    return days !== null && days >= 0 && days <= warningDays;
  }

  /** Etiqueta corta para badges: "Vencida", "Vence hoy", "Vence en N dias". */
  static label(value: any): string {
    const days = SubscriptionUtils.daysRemaining(value);
    if (days === null) return 'Sin vencimiento';
    if (days < 0) return 'Suscripción vencida';
    if (days === 0) return 'Vence hoy';
    if (days === 1) return 'Vence mañana';
    return `Vence en ${days} días`;
  }
}
