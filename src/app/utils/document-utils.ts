import { ModelDocumentFile } from '../models/document-model';

/** Estado de vigencia de un documento con fecha de vencimiento. */
export type DocumentValidityState =
  | 'vigente'
  | 'por-vencer'
  | 'vencido'
  | 'sin-vigencia';

export interface DocumentValidity {
  state: DocumentValidityState;
  /** Días que faltan para vencer; negativo si ya venció. Null si no vence. */
  daysLeft: number | null;
  /** Porcentaje de la barra (0-100). 0 cuando no hay vigencia que mostrar. */
  percent: number;
  label: string;
}

/** Un mes de aviso antes del vencimiento, igual que en el resto de la app. */
const WARNING_DAYS = 30;
/** Ventana por defecto cuando el documento no trae fecha de expedición. */
const DEFAULT_WINDOW_DAYS = 365;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Las fechas llegan como `yyyy-MM-dd` y `new Date('2026-01-31')` las lee en
 * UTC: en Colombia eso adelanta el día y un documento que vence hoy aparece
 * vencido. Se arma la fecha en horario local a partir de las tres partes.
 */
function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function diffInDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Vigencia de un documento para la barra de la tarjeta. Sin fecha de
 * vencimiento —tarjeta de propiedad, por ejemplo— no hay barra que pintar y se
 * devuelve `sin-vigencia`.
 */
export function getDocumentValidity(
  document: ModelDocumentFile,
): DocumentValidity {
  const expiry = parseLocalDate(document.expiryDate);
  if (!expiry) {
    // Un documento que no vence esta cubierto siempre: la barra va llena, del
    // mismo verde que uno vigente, y no hay plazo del que informar.
    return {
      state: 'sin-vigencia',
      daysLeft: null,
      percent: 100,
      label: 'Sin vencimiento',
    };
  }

  const today = startOfToday();
  const daysLeft = diffInDays(today, expiry);

  if (daysLeft < 0) {
    return {
      state: 'vencido',
      daysLeft,
      percent: 0,
      label: `Venció hace ${Math.abs(daysLeft)} día${
        Math.abs(daysLeft) === 1 ? '' : 's'
      }`,
    };
  }

  // La barra mide lo que queda del periodo cubierto. Si no se registró la
  // expedición se asume un año, que es la vigencia habitual de estos papeles.
  const issue = parseLocalDate(document.issueDate);
  const totalDays = issue
    ? Math.max(diffInDays(issue, expiry), 1)
    : DEFAULT_WINDOW_DAYS;
  const percent = Math.min(100, Math.round((daysLeft / totalDays) * 100));

  return {
    state: daysLeft <= WARNING_DAYS ? 'por-vencer' : 'vigente',
    daysLeft,
    percent: Math.max(percent, 2),
    label:
      daysLeft === 0
        ? 'Vence hoy'
        : `Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`,
  };
}

/** Nombre visible del documento; el catálogo llega anidado en la respuesta. */
export function getDocumentTypeName(document: ModelDocumentFile): string {
  return document.documentFileType?.name || 'Documento';
}
