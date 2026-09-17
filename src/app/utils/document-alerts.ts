import { ModelDocumentFile } from '../models/document-model';
import {
  DocumentValidityState,
  getDocumentTypeName,
  getDocumentValidity,
  needsRenewal,
} from './document-utils';

/** Estado de un documento en el aviso: su vigencia, o que falta agregarlo. */
export type DocumentAlertState = DocumentValidityState | 'faltante';

/** Un documento vencido, por vencer o requerido sin agregar. */
export interface DocumentAlertItem {
  name: string;
  state: DocumentAlertState;
  /** "Venció hace 5 días", "Vence en 12 días", "Falta agregar"… */
  label: string;
  /** Vencimiento en `dd/MM/yyyy`. Vacío si falta el documento. */
  expiryDate: string;
}

/** Los documentos con novedades de un mismo portador: un vehículo o un conductor. */
export interface DocumentAlertGroup {
  /** "Vehículo ABC-123", "Conductor Juan Pérez". */
  label: string;
  items: DocumentAlertItem[];
}

export interface DocumentAlertSummary {
  expired: number;
  expiring: number;
  missing: number;
  /** Hay algo en rojo: vencido, en sus últimos días o requerido sin agregar. */
  isCritical: boolean;
  /** "2 documentos vencidos y 1 por vencer". Vacío si no hay. */
  text: string;
  /** "Falta agregar 1 documento requerido". Vacío si no hay. */
  missingText: string;
}

/** Documento que el portador debe tener; los demás del catálogo son opcionales. */
export interface RequiredDocument {
  name: string;
  /** Recibe el nombre del tipo ya normalizado (ver `normalizeTypeName`). */
  matches: (typeName: string) => boolean;
}

/**
 * Minúsculas, sin tildes ni nada que no sea letra: "Revisión Técnico-Mecánica"
 * queda "revisiontecnicomecanica". Los tipos vienen del catálogo y no hay un
 * código fijo por el que reconocerlos, solo el nombre.
 */
function normalizeTypeName(value: string): string {
  return value
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z]/g, '');
}

const LICENSE: RequiredDocument = {
  name: 'Licencia de conducción',
  matches: (name) => name.includes('licencia'),
};

export const REQUIRED_VEHICLE_DOCUMENTS: RequiredDocument[] = [
  { name: 'SOAT', matches: (name) => name.includes('soat') },
  {
    name: 'Revisión tecnomecánica',
    matches: (name) =>
      name.includes('tecnomecanica') || name.includes('tecnicomecanica'),
  },
];

export const REQUIRED_DRIVER_DOCUMENTS: RequiredDocument[] = [LICENSE];

/** `yyyy-MM-dd` (o con hora) a `dd/MM/yyyy`, sin pasar por `Date` y su UTC. */
function formatExpiry(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function toAlertItem(
  name: string,
  document: ModelDocumentFile,
): DocumentAlertItem | null {
  const validity = getDocumentValidity(document);
  if (!needsRenewal(validity.state)) return null;
  return {
    name,
    state: validity.state,
    label: validity.label,
    expiryDate: formatExpiry(document.expiryDate!),
  };
}

function hasDocument(
  documents: ModelDocumentFile[],
  required: RequiredDocument,
): boolean {
  return documents.some((doc) =>
    required.matches(normalizeTypeName(getDocumentTypeName(doc))),
  );
}

function missingItems(
  documents: ModelDocumentFile[],
  required: RequiredDocument[],
): DocumentAlertItem[] {
  return required
    .filter((req) => !hasDocument(documents, req))
    .map((req) => ({
      name: req.name,
      state: 'faltante',
      label: 'Falta agregar',
      expiryDate: '',
    }));
}

function expiryItems(documents: ModelDocumentFile[]): DocumentAlertItem[] {
  return documents
    .map((doc) => toAlertItem(getDocumentTypeName(doc), doc))
    .filter((item): item is DocumentAlertItem => item !== null);
}

/**
 * Grupo de un portador: los requeridos que faltan y los que toca renovar.
 * Devuelve `null` si no hay novedades, para que el aviso no muestre portadores
 * al día.
 */
export function buildDocumentAlertGroup(
  label: string,
  documents: ModelDocumentFile[],
  required: RequiredDocument[] = [],
): DocumentAlertGroup | null {
  const items = [
    ...missingItems(documents, required),
    ...expiryItems(documents),
  ];
  return items.length ? { label, items } : null;
}

/**
 * Grupo del conductor a partir de `licenseExpiry`, que ya viene en el listado
 * de conductores: la licencia se revisa sin pedir sus documentos.
 */
export function buildLicenseAlertGroup(
  label: string,
  licenseExpiry: string | null | undefined,
): DocumentAlertGroup | null {
  const item = licenseExpiryItem(licenseExpiry);
  return item ? { label, items: [item] } : null;
}

function licenseExpiryItem(
  licenseExpiry: string | null | undefined,
): DocumentAlertItem | null {
  if (!licenseExpiry) return null;
  return toAlertItem(LICENSE.name, {
    documentFileTypeId: 0,
    expiryDate: String(licenseExpiry).slice(0, 10),
  });
}

/**
 * Grupo del conductor. Con sus documentos, revisa los requeridos y los que
 * vencen; si la licencia no está entre ellos solo se avisa que falta, sin
 * sumar el vencimiento de `licenseExpiry`, que diría lo contrario. Sin
 * documentos —aún cargando o si falló la consulta— solo se revisa
 * `licenseExpiry`: no se puede saber qué falta.
 */
export function buildDriverAlertGroup(
  label: string,
  documents: ModelDocumentFile[] | null,
  licenseExpiry: string | null | undefined,
): DocumentAlertGroup | null {
  if (!documents) return buildLicenseAlertGroup(label, licenseExpiry);

  return buildDocumentAlertGroup(label, documents, REQUIRED_DRIVER_DOCUMENTS);
}

const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`;

export function summarizeDocumentAlerts(
  groups: DocumentAlertGroup[],
): DocumentAlertSummary {
  const items = groups.flatMap((group) => group.items);
  const missing = items.filter((item) => item.state === 'faltante').length;
  const expired = items.filter((item) => item.state === 'vencido').length;
  const expiring = items.length - expired - missing;

  const parts: string[] = [];
  if (expired) {
    parts.push(
      `${plural(expired, 'documento')} vencido${expired === 1 ? '' : 's'}`,
    );
  }
  if (expiring) {
    parts.push(
      expired
        ? `${expiring} por vencer`
        : `${plural(expiring, 'documento')} por vencer`,
    );
  }

  return {
    expired,
    expiring,
    missing,
    isCritical: items.some(
      (item) =>
        item.state === 'vencido' ||
        item.state === 'critico' ||
        item.state === 'faltante',
    ),
    text: parts.join(' y '),
    missingText: missing
      ? `Falta agregar ${plural(missing, 'documento')} requerido${missing === 1 ? '' : 's'}`
      : '',
  };
}
