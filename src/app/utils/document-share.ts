import { ModelDocumentFile } from '../models/document-model';

/** Lo que hace falta de una fila de documento para compartirla. */
export interface ShareableDocument {
  document: ModelDocumentFile;
  name: string;
}

/**
 * Comparte los documentos por WhatsApp. El adjunto es lo que vale, así que
 * el mensaje se arma despues de bajar los archivos: cada documento aporta
 * solo su nombre, y el enlace aparece unicamente para los que no se pudieron
 * descargar, como respaldo. Web Share es la unica via del navegador para
 * entregar ficheros, y pide HTTPS, soporte de archivos y que el
 * almacenamiento responda con CORS.
 *
 * `header` son las primeras lineas del mensaje —quien porta los documentos—,
 * `filePrefix` antecede al nombre de cada archivo y `onPreparing` avisa
 * mientras se descargan, para que la vista pinte su espera.
 */
export async function shareDocumentFiles(
  rows: ShareableDocument[],
  header: string[],
  filePrefix: string | null | undefined,
  onPreparing: (preparing: boolean) => void,
): Promise<void> {
  if (rows.length === 0) return;

  const attachments = await downloadDocumentFiles(
    rows,
    filePrefix,
    onPreparing,
  );
  const files = Array.from(attachments.values());

  if (files.length > 0 && navigator.canShare?.({ files })) {
    try {
      await navigator.share({
        files,
        text: buildDocumentsMessage(rows, header, attachments),
      });
      return;
    } catch (err: any) {
      // Cerrar el selector de app no es un fallo: no se abre nada mas.
      if (err?.name === 'AbortError') return;
      console.error('Error sharing documents:', err);
    }
  }

  // Sin adjuntos posibles, el enlace es lo unico que queda por compartir.
  const text = buildDocumentsMessage(rows, header, new Map());
  window.open(
    `https://wa.me/?text=${encodeURIComponent(text)}`,
    '_blank',
    'noopener',
  );
}

/**
 * Mensaje del chat: encabezado y el nombre de cada documento. Ni numero ni
 * vigencia —son datos que viajan en el propio archivo— y el enlace solo para
 * lo que no va adjunto.
 */
function buildDocumentsMessage(
  rows: ShareableDocument[],
  header: string[],
  attached: Map<ShareableDocument, File>,
): string {
  const body = rows.map((row) => {
    if (attached.has(row) || !row.document.fileUrl) {
      return `• ${row.name}`;
    }
    return `• ${row.name}\n  ${row.document.fileUrl}`;
  });

  return [...header.filter(Boolean), '', ...body].join('\n');
}

/**
 * Baja los archivos para adjuntarlos, sin perder de vista a que documento
 * pertenece cada uno: el mensaje necesita saber cuales quedaron fuera para
 * ponerles el enlace. Los que no tienen archivo o no se dejan descargar no
 * entran en el mapa.
 */
async function downloadDocumentFiles(
  rows: ShareableDocument[],
  filePrefix: string | null | undefined,
  onPreparing: (preparing: boolean) => void,
): Promise<Map<ShareableDocument, File>> {
  const attached = new Map<ShareableDocument, File>();
  const withFile = rows.filter((row) => !!row.document.fileUrl);
  if (withFile.length === 0 || !navigator.canShare) return attached;

  onPreparing(true);
  try {
    const files = await Promise.all(
      withFile.map((row) => fetchDocumentFile(row, filePrefix)),
    );
    files.forEach((file, index) => {
      if (file) attached.set(withFile[index], file);
    });
    return attached;
  } finally {
    onPreparing(false);
  }
}

async function fetchDocumentFile(
  row: ShareableDocument,
  filePrefix: string | null | undefined,
): Promise<File | null> {
  try {
    const response = await fetch(row.document.fileUrl!);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], buildFileName(row, filePrefix, blob.type), {
      type: blob.type || 'application/octet-stream',
    });
  } catch (err) {
    console.error('Error downloading document file:', err);
    return null;
  }
}

/** Nombre legible en el chat: prefijo, documento y extension del original. */
function buildFileName(
  row: ShareableDocument,
  filePrefix: string | null | undefined,
  mimeType: string,
): string {
  const path = (row.document.fileUrl ?? '').split(/[?#]/)[0];
  const original = path.substring(path.lastIndexOf('/') + 1);
  let extension = original.includes('.')
    ? original.substring(original.lastIndexOf('.'))
    : '';
  if (!extension && mimeType.includes('pdf')) extension = '.pdf';

  const base = [filePrefix, row.name]
    .filter(Boolean)
    .join(' - ')
    .replace(/[\\\/:*?"<>|]/g, '')
    .trim();
  return `${base || 'documento'}${extension}`;
}
