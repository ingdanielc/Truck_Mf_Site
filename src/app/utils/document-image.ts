/**
 * Prepara un documento antes de subirlo a `/common/upload-document`.
 *
 * El celular suele guardar la foto "acostada" y anotar en el EXIF que hay que
 * girarla. El backend convierte las imágenes a WebP sin mirar esa marca, así
 * que una foto vertical podía quedar girada. Al pasarla por el canvas el
 * navegador aplica el giro y lo deja fijo en los píxeles, igual que se hace
 * con las fotos de perfil (`CustomValidators.readPhotoFile`).
 *
 * A diferencia de las fotos de perfil, no se reduce el tamaño y la calidad es
 * más alta: un documento tiene que seguir leyéndose. Los PDF se suben tal
 * cual.
 */

/** `spring.servlet.multipart.max-file-size` del backend. */
export const DOCUMENT_MAX_SIZE_MB = 5;

/**
 * Más alta que la de las fotos de perfil (0.8): la imagen se comprime dos
 * veces, a JPEG aquí y a WebP en el backend, y con menos calidad el texto
 * pequeño de un documento queda borroso tras la segunda.
 */
const DOCUMENT_IMAGE_QUALITY = 0.92;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

/** La imagen, ya procesada, pasa del límite del backend. */
export class DocumentFileTooLargeError extends Error {
  constructor() {
    super(
      `La imagen supera los ${DOCUMENT_MAX_SIZE_MB} MB después de procesarla. Intenta con una foto de menor resolución.`,
    );
    this.name = 'DocumentFileTooLargeError';
  }
}

/** El mensaje para el usuario si el error es el del tamaño; si no, `fallback`. */
export function documentUploadErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof DocumentFileTooLargeError ? error.message : fallback;
}

function extensionOf(name: string): string {
  return (name.split('.').pop() || '').toLowerCase();
}

function isImage(file: Blob, name: string): boolean {
  if (file.type) return file.type.startsWith('image/');
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
}

/** El mismo nombre con extensión `.jpg`, que es lo que sale del canvas. */
function jpgName(name: string): string {
  const base = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
  return `${base || 'documento'}.jpg`;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Error al cargar la imagen.'));
    };
    img.src = url;
  });
}

/** Dibuja la imagen a su tamaño real; el giro del EXIF lo aplica el navegador. */
async function redrawImage(file: Blob): Promise<Blob> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo obtener el contexto del canvas.');

  /* El PNG puede traer transparencia y el JPEG no la tiene: sin fondo, lo
     transparente saldría negro. */
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Error al generar el blob de la imagen.')),
      'image/jpeg',
      DOCUMENT_IMAGE_QUALITY,
    );
  });
}

/**
 * El archivo listo para subir: los PDF sin cambios y las imágenes redibujadas.
 * Lanza `DocumentFileTooLargeError` si la imagen procesada pasa del límite.
 */
export async function prepareDocumentFile(
  file: Blob,
  fileName: string,
): Promise<{ blob: Blob; name: string }> {
  if (!isImage(file, fileName)) return { blob: file, name: fileName };

  const blob = await redrawImage(file);
  if (blob.size > DOCUMENT_MAX_SIZE_MB * 1024 * 1024) {
    throw new DocumentFileTooLargeError();
  }
  return { blob, name: jpgName(fileName) };
}
