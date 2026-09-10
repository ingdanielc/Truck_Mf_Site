/**
 * Entregar un archivo generado en el navegador.
 *
 * **Por qué no basta con un enlace.** En iOS el `<a download>` sobre un `blob:`
 * —la vía por defecto de cualquier exportación— no descarga nada: se probaron
 * las cuatro formas posibles en un iPhone y esa es la única que falla en todas.
 * `window.open` deja el archivo en un sitio del que el usuario no lo puede
 * sacar. Las dos que funcionan son la hoja de compartir del sistema y el
 * enlace sobre un `data:` en base64.
 *
 * De ahí el orden: primero la hoja de compartir, que es la que deja elegir
 * destino —Archivos, WhatsApp, correo— y la que la gente espera en un
 * teléfono; y si no está, el enlace, que en iOS va en base64 y en el resto
 * sobre el `blob:` de siempre.
 *
 * **El toque del usuario.** `navigator.share` solo abre la hoja mientras el
 * gesto que la pidió sigue vivo. Cualquier espera de por medio lo gasta, así
 * que el archivo tiene que estar armado ANTES de llamar aquí: nada de pedirlo
 * al servidor y compartir después. Cuando el gesto se pierde igualmente, el
 * navegador rechaza la llamada y esto cae al enlace, que no lo necesita.
 */

/** Cómo terminó la entrega. `cancelled` es que el usuario cerró la hoja de
 *  compartir, que no es un fallo y no debe pintar ningún error. */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

/**
 * iPhone y iPad, incluido el iPad que se hace pasar por escritorio: desde
 * iPadOS 13 su `userAgent` dice "Macintosh", y solo lo delata que la pantalla
 * responda al tacto.
 */
function isIOS(): boolean {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && 'ontouchend' in document;
}

function toFile(blob: Blob, fileName: string): File | null {
  try {
    return new File([blob], fileName, { type: blob.type });
  } catch {
    /* `File` no se puede construir en navegadores viejos. Sin él no hay hoja
       de compartir, pero el enlace sigue sirviendo. */
    return null;
  }
}

function canShareFile(file: File): boolean {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** El archivo entero en base64 dentro de una URL. Pesa un tercio más que el
 *  original y vive en memoria, así que es el respaldo y no la vía principal. */
function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function downloadFile(
  blob: Blob,
  fileName: string,
): Promise<ShareOutcome> {
  const enIOS = isIOS();
  try {
    const href = enIOS ? await dataUrl(blob) : URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();

    /* Revocar la URL de inmediato corta la descarga antes de que empiece: el
       navegador aún no ha leído el blob. Se le da tiempo. */
    setTimeout(() => {
      a.remove();
      if (!enIOS) URL.revokeObjectURL(href);
    }, 8000);

    return 'downloaded';
  } catch (error) {
    console.error('Error downloading file:', error);
    return 'failed';
  }
}

/**
 * Entrega el archivo por la mejor vía que admita el dispositivo.
 *
 * El `blob` tiene que venir ya armado — ver la nota sobre el toque del usuario
 * arriba.
 */
export async function shareOrDownloadFile(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<ShareOutcome> {
  const file = toFile(blob, fileName);

  if (file && canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error: any) {
      // Cerrar la hoja de compartir no es un fallo: no se abre nada más.
      if (error?.name === 'AbortError') return 'cancelled';
      console.error('Error sharing file:', error);
      // Cualquier otro fallo cae al enlace, que no depende del gesto.
    }
  }

  return downloadFile(blob, fileName);
}
