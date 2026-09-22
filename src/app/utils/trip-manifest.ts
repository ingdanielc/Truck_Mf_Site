import { Observable, firstValueFrom, map } from 'rxjs';
import {
  ModelDocumentFile,
  ModelDocumentFileType,
} from '../models/document-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../models/model-filter-table';
import { CommonService } from '../services/common.service';

/**
 * Manifiesto de carga del viaje.
 *
 * Es un `document_file` como los del vehículo, pero colgado del viaje por
 * `tripId`. Es opcional: uno por viaje, o dos en el redondo, que puede llevar
 * uno por trayecto. Todos llevan el número del campo "Manifiesto" del viaje,
 * que es uno solo: no se pide otra vez por archivo.
 */

/** Nombre con el que se muestra y se comparte. */
export const TRIP_MANIFEST_NAME = 'Manifiesto de Carga';

/** Cuántos manifiestos admite el viaje según su tipo. */
export function maxTripManifests(tripType: string | null | undefined): number {
  return tripType === 'REDONDO' ? 2 : 1;
}

/** "Manifiesto de Carga" para el primero, "Manifiesto de Carga 2" después. */
export function manifestLabel(index: number): string {
  return index === 0
    ? TRIP_MANIFEST_NAME
    : `${TRIP_MANIFEST_NAME} ${index + 1}`;
}

/** Lo que acepta `/common/upload-document`. */
export const MANIFEST_ALLOWED_EXTENSIONS = [
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'webp',
];
/** `spring.servlet.multipart.max-file-size` del backend. */
export const MANIFEST_MAX_SIZE_MB = 5;

const sinTildes = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * El tipo "Manifiesto de Carga" del catálogo del viaje. Se busca por nombre
 * para no depender del id de la base; si el catálogo trae uno solo, es ese.
 */
function pickManifestType(
  types: ModelDocumentFileType[],
): ModelDocumentFileType | null {
  const activos = types.filter((type) => type.isActive !== false);
  return (
    activos.find((type) => sinTildes(type.name).includes('manifiesto')) ??
    activos[0] ??
    null
  );
}

/** Los manifiestos del viaje, del primero que se cargó al último. */
export function loadTripManifests(
  commonService: CommonService,
  tripId: number,
): Observable<ModelDocumentFile[]> {
  return commonService
    .getDocuments(
      new ModelFilterTable(
        [new Filter('tripId', '=', String(tripId))],
        new Pagination(10, 0),
        new Sort('id', true),
      ),
    )
    .pipe(map((r: any) => (r?.data?.content || []) as ModelDocumentFile[]));
}

/** El archivo pasa lo que el backend admite; si no, el mensaje a mostrar. */
export function validateManifestFile(file: File): string | null {
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  if (!MANIFEST_ALLOWED_EXTENSIONS.includes(extension)) {
    return (
      'Formato no permitido. Se aceptan: ' +
      MANIFEST_ALLOWED_EXTENSIONS.join(', ')
    );
  }
  if (file.size > MANIFEST_MAX_SIZE_MB * 1024 * 1024) {
    return `El archivo supera los ${MANIFEST_MAX_SIZE_MB} MB permitidos y no se adjuntó.`;
  }
  return null;
}

/**
 * Sube el archivo del manifiesto y devuelve su URL. Va con el id del viaje,
 * así que el viaje tiene que estar guardado antes: al crear uno, primero
 * `/trip/save` y después esto.
 */
export async function uploadManifestFile(
  commonService: CommonService,
  file: File,
  tripId: number,
): Promise<string> {
  const subida: any = await firstValueFrom(
    commonService.uploadDocument(file, file.name, { type: 'trip', id: tripId }),
  );
  const url = subida?.data;
  if (!url) throw new Error('La carga del manifiesto no devolvió la URL.');
  return url;
}

/**
 * Crea o actualiza el manifiesto del viaje. Con `existing` se conserva su id
 * y, si no llega archivo nuevo, también el que ya tenía: así cambiar solo el
 * número del manifiesto no lo deja sin archivo.
 */
export async function saveTripManifest(
  commonService: CommonService,
  params: {
    tripId: number;
    manifestNumber: string | null | undefined;
    fileUrl: string | null;
    existing: ModelDocumentFile | null;
  },
): Promise<void> {
  let documentFileTypeId = params.existing?.documentFileTypeId;
  if (!documentFileTypeId) {
    const catalogo: any = await firstValueFrom(
      commonService.getDocumentFileTypes('TRIP'),
    );
    const tipo = pickManifestType(catalogo?.data || []);
    if (!tipo) {
      throw new Error('El catálogo no tiene el tipo Manifiesto de Carga.');
    }
    documentFileTypeId = tipo.id;
  }

  const payload: ModelDocumentFile = {
    ...(params.existing?.id ? { id: params.existing.id } : {}),
    documentFileTypeId,
    tripId: params.tripId,
    documentNumber: params.manifestNumber?.trim() || null,
    fileUrl: params.fileUrl ?? params.existing?.fileUrl ?? null,
  };
  await firstValueFrom(commonService.saveDocuments([payload]));
}

/** Nombre del archivo ya guardado, el último tramo de su URL. */
export function manifestFileNameOf(url: string | null | undefined): string {
  if (!url) return TRIP_MANIFEST_NAME;
  const limpio = url.split('?')[0];
  return decodeURIComponent(limpio.split('/').pop() || TRIP_MANIFEST_NAME);
}
