import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom, forkJoin, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  DocumentHolder,
  ModelDocumentFile,
  ModelDocumentFileType,
} from 'src/app/models/document-model';
import {
  CommonService,
  DocumentUploadType,
} from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import {
  DocumentValidity,
  getDocumentTypeName,
  getDocumentValidity,
  needsRenewal,
} from 'src/app/utils/document-utils';
import {
  DocumentHolderIds,
  loadHolderDocuments,
} from 'src/app/utils/holder-documents';
import { GDocumentViewerComponent } from 'src/app/components/g-document-viewer/g-document-viewer.component';
import { PlatePipe } from '../../pipes/plate.pipe';
import { ModelDriver } from 'src/app/models/driver-model';
import { ModelOwner } from 'src/app/models/owner-model';

/** Sin tildes y en minúsculas: "Cédula" y "cedula" han de ser lo mismo. */
const normalizar = (texto: string): string =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Los ids de portador que trae un documento, sin los vacíos. */
function holderIdsOf(document: ModelDocumentFile): DocumentHolderIds {
  const ids: DocumentHolderIds = {};
  if (document.vehicleId != null) ids.vehicleId = document.vehicleId;
  if (document.driverId != null) ids.driverId = document.driverId;
  if (document.ownerId != null) ids.ownerId = document.ownerId;
  return ids;
}

/** Lo que acepta `/common/upload-document`. */
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];
/** `spring.servlet.multipart.max-file-size` del backend. */
const MAX_FILE_SIZE_MB = 5;

/** Documento con su nombre y vigencia ya resueltos para pintar. */
export interface DocumentRow {
  document: ModelDocumentFile;
  name: string;
  validity: DocumentValidity;
}

/**
 * Documentos de un vehículo, de un conductor o de un propietario que ya
 * existe. A diferencia del alta, aquí cada cambio se guarda contra el servidor
 * en el momento: el portador ya tiene id, así que no hay nada que diferir.
 *
 * **Una persona, dos portadores.** El propietario que también conduce tiene
 * documentos como propietario y como conductor, y se tienen que ver juntos
 * desde las dos fichas. Con `driverId` y `ownerId` a la vez se muestran los de
 * los dos; `mainHolder` dice desde cuál se está mirando. Cada documento se
 * sigue guardando con un solo portador: el que ya tenía, o el del catálogo del
 * tipo elegido si es nuevo.
 *
 * Al guardar un documento de un tipo que ya tenía uno vigente el backend
 * desactiva el anterior en lugar de perderlo, que es como se renueva un SOAT o
 * una tecnomecánica. El formulario lo avisa antes de guardar.
 */
@Component({
  selector: 'g-vehicle-documents',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    GDocumentViewerComponent,
    PlatePipe,
  ],
  templateUrl: './g-vehicle-documents.component.html',
  styleUrls: ['./g-vehicle-documents.component.scss'],
})
export class GVehicleDocumentsComponent implements OnInit {
  @Input() vehicleId: number | null = null;
  /** Documentos de este conductor. */
  @Input() driverId: number | null = null;
  /** Documentos de este propietario. */
  @Input() ownerId: number | null = null;
  /** Con conductor y propietario a la vez, desde cuál de los dos se mira. */
  @Input() mainHolder: 'DRIVER' | 'OWNER' | null = null;
  /** Placa del vehículo, solo para el encabezado. */
  @Input() plate: string = '';
  /** Nombre de la persona, solo para el encabezado. */
  @Input() holderName: string = '';
  /** Conductor portador: de aquí salen los datos que se precargan. */
  @Input() driver: ModelDriver | null = null;
  /** Propietario portador: también precarga, si no hay conductor. */
  @Input() owner: ModelOwner | null = null;
  /** Un conductor consulta los documentos pero no los modifica. */
  @Input() canEdit: boolean = true;

  @Output() close = new EventEmitter<void>();
  /** Lista vigente tras cada cambio, para que la vista de detalle se refresque. */
  @Output() changed = new EventEmitter<ModelDocumentFile[]>();

  documentForm!: FormGroup;
  documentTypes: ModelDocumentFileType[] = [];
  rows: DocumentRow[] = [];

  loading: boolean = true;
  loadingTypes: boolean = true;
  isSaving: boolean = false;
  deletingId: number | null = null;
  confirmDeleteId: number | null = null;

  /** Documento que se está editando; null cuando el formulario es de alta. */
  editingId: number | null = null;
  /**
   * Documento vigente que se está renovando. Una renovación no modifica ese
   * documento: crea uno nuevo del mismo tipo, y el backend manda el anterior
   * al histórico. Por eso `editingId` queda en null mientras esto tiene valor.
   */
  renewingFrom: DocumentRow | null = null;
  showForm: boolean = false;
  /** Archivo rechazado por formato o tamaño; se muestra bajo la zona de carga. */
  fileError: string = '';
  selectedFile: File | null = null;
  selectedFileName: string = '';
  /** URL del escaneo ya guardado, cuando se edita sin reemplazarlo. */
  currentFileUrl: string | null = null;
  /**
   * Observaciones del documento que se edita. El formulario ya no las expone,
   * pero se conservan para no borrarlas al guardar.
   */
  currentObservations: string | null = null;

  /** Documento abierto en el visor; null cuando no hay ninguno. */
  viewerUrl: string | null = null;
  viewerName: string = '';

  readonly acceptedFiles = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(',');
  readonly maxFileSizeMb = MAX_FILE_SIZE_MB;
  /** Un documento no se expide después de hoy. */
  readonly maxIssueDate = new Date().toISOString().slice(0, 10);

  /** Lo último que se precargó, para reconocerlo al cambiar de tipo. */
  private prefilled = { documentNumber: '', expiryDate: '' };

  constructor(
    private readonly fb: FormBuilder,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.documentForm = this.fb.group({
      documentFileTypeId: [null, Validators.required],
      documentNumber: [''],
      issuer: [''],
      issueDate: [''],
      expiryDate: [''],
    });

    this.documentForm
      .get('documentFileTypeId')
      ?.valueChanges.subscribe(() => this.prefillFromPerson());

    this.loadDocumentTypes();
    this.loadDocuments();
  }

  /* ======================================================================
     Portadores
     ====================================================================== */

  /** Desde quién se miran los documentos: decide textos y portador por omisión. */
  get holder(): DocumentHolder {
    if (this.driverId == null && this.ownerId == null) return 'VEHICLE';
    if (this.mainHolder === 'OWNER' && this.ownerId != null) return 'OWNER';
    if (this.mainHolder === 'DRIVER' && this.driverId != null) return 'DRIVER';
    return this.driverId != null ? 'DRIVER' : 'OWNER';
  }

  /** Todos los portadores que se muestran juntos, el principal primero. */
  private get holders(): DocumentHolder[] {
    if (this.holder === 'VEHICLE') return ['VEHICLE'];
    const holders: DocumentHolder[] = [this.holder];
    if (this.holder !== 'DRIVER' && this.driverId != null)
      holders.push('DRIVER');
    if (this.holder !== 'OWNER' && this.ownerId != null) holders.push('OWNER');
    return holders;
  }

  private get holderIds(): DocumentHolderIds {
    return this.holder === 'VEHICLE'
      ? { vehicleId: this.vehicleId }
      : { driverId: this.driverId, ownerId: this.ownerId };
  }

  /** El sujeto del estado vacío: "Este conductor no tiene documentos." */
  get holderLabel(): string {
    switch (this.holder) {
      case 'DRIVER':
        return 'Este conductor';
      case 'OWNER':
        return 'Este propietario';
      default:
        return 'Este vehículo';
    }
  }

  /* ======================================================================
     Carga
     ====================================================================== */

  /**
   * El catálogo de cada portador, junto. Un tipo que está en los dos —la
   * cédula, por ejemplo— se ofrece una sola vez: el del portador principal.
   * Cada tipo guarda de qué catálogo vino, que es lo que decide con qué
   * portador se guarda un documento nuevo.
   */
  private loadDocumentTypes(): void {
    this.loadingTypes = true;
    const holders = this.holders;
    const varios = holders.length > 1;

    forkJoin(
      holders.map((holder) =>
        this.commonService.getDocumentFileTypes(holder).pipe(
          map((response: any) =>
            ((response?.data || []) as ModelDocumentFileType[]).map((type) => ({
              ...type,
              appliesTo: type.appliesTo ?? holder,
            })),
          ),
          // Con dos catálogos, que falle uno no deja sin el otro.
          catchError((error) => {
            if (!varios) return throwError(() => error);
            console.error(`Error loading ${holder} document types:`, error);
            return of([] as ModelDocumentFileType[]);
          }),
        ),
      ),
    ).subscribe({
      next: (catalogos) => {
        const vistos = new Set<string>();
        this.documentTypes = catalogos
          .flat()
          .filter((type) => type.isActive !== false)
          .filter((type) => {
            const clave = normalizar(type.name || '');
            if (vistos.has(clave)) return false;
            vistos.add(clave);
            return true;
          })
          // Alfabético, y después de quitar repetidos: el orden de llegada es
          // el que decide qué catálogo gana, así que no se toca antes.
          .sort((a, b) =>
            (a.name || '').localeCompare(b.name || '', 'es', {
              sensitivity: 'base',
            }),
          );
        this.loadingTypes = false;
      },
      error: (error: any) => {
        console.error('Error loading document types:', error);
        this.documentTypes = [];
        this.loadingTypes = false;
      },
    });
  }

  private loadDocuments(): void {
    this.loading = true;
    loadHolderDocuments(this.commonService, this.holderIds).subscribe({
      next: (actives) => {
        this.rows = actives.map((item) => ({
          document: item,
          name: getDocumentTypeName(item),
          validity: getDocumentValidity(item),
        }));
        this.loading = false;
        this.showForm = this.rows.length === 0 && this.canEdit;
        this.changed.emit(actives);
      },
      error: (err) => {
        console.error('Error loading documents:', err);
        this.rows = [];
        this.loading = false;
        this.showForm = this.canEdit;
      },
    });
  }

  /* ======================================================================
     Estado del formulario
     ====================================================================== */

  get selectedType(): ModelDocumentFileType | null {
    const typeId = Number(this.documentForm?.get('documentFileTypeId')?.value);
    return this.documentTypes.find((type) => type.id === typeId) || null;
  }

  /** El documento que se edita, con su fila. */
  private get editingRow(): DocumentRow | null {
    if (this.editingId === null) return null;
    return this.rows.find((row) => row.document.id === this.editingId) || null;
  }

  /** El backend exige la fecha cuando el tipo la declara obligatoria. */
  get expiryRequired(): boolean {
    return this.selectedType?.requiresExpiry === true;
  }

  /**
   * Falta la fecha que el tipo exige. No va en el aviso rojo: bajo el tipo ya
   * se lee que la exige, así que basta con marcar el campo.
   */
  get expiryMissing(): boolean {
    return this.expiryRequired && !this.documentForm?.getRawValue().expiryDate;
  }

  /**
   * Sin archivo y sin vencimiento el documento no registra nada. Bajo el tipo
   * ya se lee que exige uno de los dos; al intentar guardar se marcan ambos
   * campos en lugar de repetirlo en el aviso rojo.
   */
  get fileOrExpiryMissing(): boolean {
    return (
      !this.selectedFile &&
      !this.currentFileUrl &&
      !this.documentForm?.getRawValue().expiryDate
    );
  }

  /**
   * Vencimiento anterior a la expedición. Se avisa en el propio campo mientras
   * se llena, no en el aviso rojo del formulario. Las fechas van como
   * `yyyy-MM-dd`, así que compararlas como texto es compararlas como fecha.
   */
  get expiryBeforeIssue(): boolean {
    const value = this.documentForm?.getRawValue();
    return (
      !!value?.issueDate &&
      !!value?.expiryDate &&
      value.expiryDate < value.issueDate
    );
  }

  /**
   * El tipo es obligatorio. Falta se avisa bajo el campo, no en la alerta:
   * el botón ya queda deshabilitado mientras no se elija uno.
   */
  get typeMissing(): boolean {
    return !this.documentForm?.getRawValue().documentFileTypeId;
  }

  /**
   * Guardar se habilita en cuanto hay tipo. Las demás reglas no lo bloquean:
   * con el botón apagado no había forma de saber qué faltaba, así que se
   * revisan al pulsarlo y el motivo sale en el campo que falla.
   */
  get canSubmit(): boolean {
    if (!this.documentForm) return false;
    return !this.typeMissing;
  }

  /**
   * Documento vigente del tipo elegido, distinto del que se edita. Guardar
   * sobre él no lo borra: lo manda al histórico. Se avisa antes.
   *
   * Se reconoce también por el nombre: la cédula del propietario y la del
   * conductor son tipos distintos en cada catálogo, pero para quien es las dos
   * cosas son el mismo papel.
   */
  get typeBeingRenewed(): DocumentRow | null {
    const type = this.selectedType;
    if (!type) return null;
    const clave = normalizar(type.name || '');
    return (
      this.rows.find(
        (row) =>
          (row.document.documentFileTypeId === type.id ||
            normalizar(row.name) === clave) &&
          row.document.id !== this.editingId,
      ) || null
    );
  }

  /**
   * Solo se renueva lo que está por vencer o ya venció: sobre un documento
   * vigente la acción no aplica —el anterior no tendría por qué ir al
   * histórico— y para corregir sus datos está editar. Mismo criterio que el
   * contador "por renovar" de la ficha del vehículo.
   */
  canRenew(row: DocumentRow): boolean {
    return needsRenewal(row.validity.state);
  }

  get formTitle(): string {
    if (this.renewingFrom) return 'Renovar documento';
    return this.editingId ? 'Editar documento' : 'Nuevo documento';
  }

  get submitLabel(): string {
    if (this.renewingFrom) return 'Guardar renovación';
    return this.editingId ? 'Guardar cambios' : 'Guardar documento';
  }

  /**
   * El tipo que se muestra en el selector para un documento guardado. Si su
   * tipo es el del otro catálogo —y por eso no está en la lista, que no repite
   * nombres— se elige el de igual nombre, para que el selector no quede vacío.
   */
  private typeIdForForm(row: DocumentRow): number {
    const propio = row.document.documentFileTypeId;
    if (this.documentTypes.some((type) => type.id === propio)) return propio;
    const clave = normalizar(row.name);
    return (
      this.documentTypes.find((type) => normalizar(type.name || '') === clave)
        ?.id ?? propio
    );
  }

  openForm(): void {
    this.editingId = null;
    this.renewingFrom = null;
    this.resetForm();
    this.documentForm.get('documentFileTypeId')?.enable();
    this.showForm = true;
  }

  editRow(row: DocumentRow): void {
    this.editingId = row.document.id ?? null;
    this.renewingFrom = null;
    this.documentForm.get('documentFileTypeId')?.enable();
    this.fileError = '';
    this.selectedFile = null;
    this.currentFileUrl = row.document.fileUrl || null;
    this.currentObservations = row.document.observations || null;
    this.selectedFileName = this.currentFileUrl
      ? this.fileNameOf(this.currentFileUrl)
      : '';
    this.documentForm.reset({
      documentFileTypeId: this.typeIdForForm(row),
      documentNumber: row.document.documentNumber || '',
      issuer: row.document.issuer || '',
      issueDate: row.document.issueDate || '',
      expiryDate: row.document.expiryDate || '',
    });
    this.showForm = true;
  }

  /**
   * Renueva un documento: el formulario arranca con los datos que suelen
   * repetirse —tipo, número y expedidor— y con las fechas y el archivo en
   * blanco, que es justo lo que cambia al renovar. El tipo queda fijo porque
   * es lo que identifica la renovación; para cambiarlo está "Descartar".
   */
  renewRow(row: DocumentRow): void {
    this.editingId = null;
    this.renewingFrom = row;
    this.fileError = '';
    this.selectedFile = null;
    this.selectedFileName = '';
    this.currentFileUrl = null;
    this.currentObservations = null;
    this.documentForm.reset({
      documentFileTypeId: this.typeIdForForm(row),
      documentNumber: row.document.documentNumber || '',
      issuer: row.document.issuer || '',
      issueDate: '',
      expiryDate: '',
    });
    this.documentForm.markAsUntouched();
    this.documentForm.get('documentFileTypeId')?.disable();
    this.showForm = true;
  }

  cancelForm(): void {
    this.editingId = null;
    this.renewingFrom = null;
    this.resetForm();
    this.documentForm.get('documentFileTypeId')?.enable();
    this.showForm = this.rows.length === 0;
  }

  private resetForm(): void {
    this.documentForm.reset({
      documentFileTypeId: null,
      documentNumber: '',
      issuer: '',
      issueDate: '',
      expiryDate: '',
    });
    this.documentForm.markAsUntouched();
    this.selectedFile = null;
    this.selectedFileName = '';
    this.currentFileUrl = null;
    this.currentObservations = null;
    this.fileError = '';
    this.prefilled = { documentNumber: '', expiryDate: '' };
  }

  /* ======================================================================
     Precarga
     ====================================================================== */

  /**
   * Al elegir el tipo de un documento nuevo de una persona se precarga lo que
   * ya se sabe de ella: la cédula lleva su número de identificación, y la
   * licencia ese mismo número —en Colombia es la identificación— y el
   * vencimiento registrado. Los datos salen del conductor y, si no hay, del
   * propietario, que también guarda la licencia cuando conduce.
   *
   * Solo se escribe sobre un campo vacío o sobre lo que se precargó antes: lo
   * que el usuario escribió no se pisa. Editar y renovar ya traen sus propios
   * datos.
   */
  private prefillFromPerson(): void {
    if (this.holder === 'VEHICLE' || (!this.driver && !this.owner)) return;
    if (this.editingId !== null || this.renewingFrom) return;

    const name = normalizar(this.selectedType?.name || '');
    const isCedula = name.includes('cedula');
    const isLicencia = name.includes('licencia');

    const identificacion =
      this.driver?.documentNumber ?? this.owner?.documentNumber ?? '';
    const vencimientoLicencia =
      this.driver?.licenseExpiry ?? this.owner?.licenseExpiry;

    const documentNumber =
      isCedula || isLicencia ? String(identificacion).trim() : '';
    const expiryDate =
      isLicencia && vencimientoLicencia
        ? String(vencimientoLicencia).split('T')[0]
        : '';

    this.prefillControl('documentNumber', documentNumber);
    this.prefillControl('expiryDate', expiryDate);
  }

  private prefillControl(
    field: 'documentNumber' | 'expiryDate',
    value: string,
  ): void {
    const control = this.documentForm.get(field);
    if (!control) return;

    const current = control.value || '';
    if (current && current !== this.prefilled[field]) return;

    control.setValue(value);
    this.prefilled[field] = value;
  }

  /* ======================================================================
     Archivo
     ====================================================================== */

  private fileNameOf(url: string): string {
    return url.split('/').pop() || 'documento';
  }

  triggerFileInput(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // El input se limpia siempre para que volver a elegir el mismo archivo
    // después de un error dispare el change de nuevo.
    input.value = '';
    if (!file) return;

    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      this.fileError =
        'Formato no permitido. Se aceptan: ' + ALLOWED_EXTENSIONS.join(', ');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      this.fileError =
        'El archivo supera los ' + MAX_FILE_SIZE_MB + ' MB permitidos.';
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;
    this.fileError = '';
  }

  removeFile(): void {
    this.selectedFile = null;
    this.selectedFileName = '';
    this.currentFileUrl = null;
  }

  /**
   * El documento se muestra en el visor de la app. Abrirlo con `window.open`
   * dejaba al usuario fuera y sin retorno cuando la PWA corre instalada.
   */
  openFile(url: string | null | undefined, event?: Event, name?: string): void {
    event?.stopPropagation();
    if (!url) return;
    this.viewerUrl = url;
    this.viewerName = name || 'Documento';
  }

  closeViewer(): void {
    this.viewerUrl = null;
    this.viewerName = '';
  }

  /* ======================================================================
     Guardar y eliminar
     ====================================================================== */

  /**
   * Con qué tipo y qué portador se guarda.
   *
   * Si ya hay un documento de ese mismo papel —el que se edita, el que se
   * renueva o el vigente que se va a reemplazar— se guarda con su tipo y su
   * portador: así el backend manda el anterior al histórico aunque se haya
   * cargado desde la otra ficha. Un documento nuevo va con el portador del
   * catálogo del tipo elegido.
   */
  private resolveTypeAndHolder(): {
    documentFileTypeId: number;
    holderIds: DocumentHolderIds;
  } {
    const elegido = Number(this.documentForm.getRawValue().documentFileTypeId);
    const base =
      this.editingRow ?? this.renewingFrom ?? this.typeBeingRenewed ?? null;
    const mismoPapel =
      !!base &&
      normalizar(this.selectedType?.name || '') === normalizar(base.name);

    if (base && mismoPapel) {
      const ids = holderIdsOf(base.document);
      if (Object.keys(ids).length) {
        return {
          documentFileTypeId: base.document.documentFileTypeId,
          holderIds: ids,
        };
      }
    }

    return { documentFileTypeId: elegido, holderIds: this.holderIdsForType() };
  }

  /** El portador del catálogo del tipo elegido, o el principal si no aplica. */
  private holderIdsForType(): DocumentHolderIds {
    switch (this.selectedType?.appliesTo) {
      case 'OWNER':
        if (this.ownerId != null) return { ownerId: this.ownerId };
        break;
      case 'DRIVER':
        if (this.driverId != null) return { driverId: this.driverId };
        break;
      case 'VEHICLE':
        if (this.vehicleId != null) return { vehicleId: this.vehicleId };
        break;
    }
    switch (this.holder) {
      case 'OWNER':
        return { ownerId: this.ownerId };
      case 'DRIVER':
        return { driverId: this.driverId };
      default:
        return { vehicleId: this.vehicleId };
    }
  }

  /**
   * El `type` de la subida sale del mismo portador con el que se guarda la
   * fila, para que el archivo quede en la carpeta de quien lo lleva.
   */
  private uploadHolder(ids: DocumentHolderIds): {
    type: DocumentUploadType;
    id?: number | null;
  } {
    if (ids.driverId != null) return { type: 'driver', id: ids.driverId };
    if (ids.ownerId != null) return { type: 'owner' };
    return { type: 'vehicle' };
  }

  async saveDocument(): Promise<void> {
    if (this.isSaving) return;

    this.documentForm.markAllAsTouched();
    if (
      this.typeMissing ||
      this.expiryMissing ||
      this.expiryBeforeIssue ||
      this.fileOrExpiryMissing
    ) {
      return;
    }

    this.fileError = '';
    this.isSaving = true;

    try {
      const { documentFileTypeId, holderIds } = this.resolveTypeAndHolder();
      let fileUrl = this.currentFileUrl;
      if (this.selectedFile) {
        const uploadRes = await firstValueFrom(
          this.commonService.uploadDocument(
            this.selectedFile,
            this.selectedFileName,
            this.uploadHolder(holderIds),
          ),
        );
        fileUrl = uploadRes?.data || null;
      }

      const value = this.documentForm.getRawValue();
      const payload: ModelDocumentFile = {
        documentFileTypeId,
        ...holderIds,
        documentNumber: value.documentNumber?.trim() || null,
        issuer: value.issuer?.trim() || null,
        issueDate: value.issueDate || null,
        expiryDate: value.expiryDate || null,
        fileUrl: fileUrl,
        observations: this.currentObservations,
        isActive: true,
      };
      if (this.editingId !== null) {
        payload.id = this.editingId;
      }

      // Vehículo, conductor y propietario comparten endpoint: el portador lo
      // dice el id que lleva el documento.
      await firstValueFrom(this.commonService.saveDocuments([payload]));

      let message = 'Documento cargado exitosamente!';
      if (this.renewingFrom) {
        message = 'Documento renovado exitosamente!';
      } else if (this.editingId !== null) {
        message = 'Documento actualizado exitosamente!';
      }
      this.toastService.showSuccess('Documentos', message);

      this.editingId = null;
      this.renewingFrom = null;
      this.resetForm();
      this.documentForm.get('documentFileTypeId')?.enable();
      this.showForm = false;
      this.isSaving = false;
      this.loadDocuments();
    } catch (err: any) {
      console.error('Error saving document:', err);
      this.isSaving = false;
      this.toastService.showError(
        'Error',
        err?.error?.message ||
          'No se pudo guardar el documento. Intenta de nuevo.',
      );
    }
  }

  askDelete(row: DocumentRow): void {
    this.confirmDeleteId = row.document.id ?? null;
  }

  cancelDelete(): void {
    this.confirmDeleteId = null;
  }

  confirmDelete(): void {
    const id = this.confirmDeleteId;
    if (id == null || this.deletingId != null) return;

    this.deletingId = id;
    this.commonService.deleteDocument(id).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Documentos',
          'Documento eliminado exitosamente!',
        );
        this.deletingId = null;
        this.confirmDeleteId = null;
        if (this.editingId === id || this.renewingFrom?.document.id === id) {
          this.cancelForm();
        }
        this.loadDocuments();
      },
      error: (err) => {
        console.error('Error deleting document:', err);
        this.toastService.showError(
          'Error',
          err?.error?.message || 'No se pudo eliminar el documento.',
        );
        this.deletingId = null;
        this.confirmDeleteId = null;
      },
    });
  }

  dismiss(): void {
    this.close.emit();
  }

  trackByRow(_index: number, row: DocumentRow): number {
    return row.document.id ?? _index;
  }
}
