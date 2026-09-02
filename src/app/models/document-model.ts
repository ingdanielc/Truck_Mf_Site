/**
 * Documentos archivados (SOAT, tecnomecánica, tarjeta de propiedad…). Espejo de
 * `DocumentFile` / `DocumentFileType` del backend; no confundir con
 * `documentTypeId` de personas, que es el tipo de identificación.
 */

export type DocumentHolder = 'VEHICLE' | 'DRIVER' | 'OWNER';

/** Catálogo de `/common/getDocumentFileTypes?appliesTo=VEHICLE` */
export interface ModelDocumentFileType {
  id: number;
  name: string;
  appliesTo: DocumentHolder;
  /** Cuando es true el backend exige `expiryDate` al guardar. */
  requiresExpiry: boolean;
  isActive: boolean;
  creationDate?: string;
  updateDate?: string;
}

/** Fila de `document_file`. Las fechas viajan como `yyyy-MM-dd`. */
export interface ModelDocumentFile {
  id?: number;
  documentFileTypeId: number;
  documentFileType?: ModelDocumentFileType;
  vehicleId?: number | null;
  driverId?: number | null;
  ownerId?: number | null;
  documentNumber?: string | null;
  /** Aseguradora o CDA que lo expide. */
  issuer?: string | null;
  issueDate?: string | null;
  /** Nulo cuando el tipo no vence, como la tarjeta de propiedad. */
  expiryDate?: string | null;
  /** Nulo cuando se registró solo para recordar el vencimiento. */
  fileUrl?: string | null;
  observations?: string | null;
  isActive?: boolean;
  creationDate?: string;
  updateDate?: string;
}
