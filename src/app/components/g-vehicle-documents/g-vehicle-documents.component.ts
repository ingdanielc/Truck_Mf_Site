import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  ModelDocumentFile,
  ModelDocumentFileType,
} from 'src/app/models/document-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { CommonService } from 'src/app/services/common.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import {
  DocumentValidity,
  getDocumentTypeName,
  getDocumentValidity,
  needsRenewal,
} from 'src/app/utils/document-utils';
import { GDocumentViewerComponent } from 'src/app/components/g-document-viewer/g-document-viewer.component';
import { PlatePipe } from '../../pipes/plate.pipe';

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
 * Documentos de un vehículo que ya existe. A diferencia del alta, aquí cada
 * cambio se guarda contra el servidor en el momento: el vehículo ya tiene id,
 * así que no hay nada que diferir.
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
  @Input({ required: true }) vehicleId!: number;
  /** Placa del vehículo, solo para el encabezado. */
  @Input() plate: string = '';
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
  formError: string = '';
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

  constructor(
    private readonly fb: FormBuilder,
    private readonly commonService: CommonService,
    private readonly vehicleService: VehicleService,
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

    this.loadDocumentTypes();
    this.loadDocuments();
  }

  private loadDocumentTypes(): void {
    this.loadingTypes = true;
    this.commonService.getDocumentFileTypes('VEHICLE').subscribe({
      next: (response: any) => {
        this.documentTypes = (response?.data || []).filter(
          (type: ModelDocumentFileType) => type.isActive !== false,
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
    const filter = new ModelFilterTable(
      [new Filter('vehicleId', '=', this.vehicleId.toString())],
      new Pagination(50, 0),
      new Sort('expiryDate', true),
    );

    this.vehicleService.getVehicleDocuments(filter).subscribe({
      next: (response: any) => {
        // `isActive` se descarta aquí y no en el filtro: la comparación del
        // backend castea a texto y un booleano no sobrevive ese casteo.
        const actives: ModelDocumentFile[] = (
          response?.data?.content || []
        ).filter((item: ModelDocumentFile) => item.isActive !== false);

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
        console.error('Error loading vehicle documents:', err);
        this.rows = [];
        this.loading = false;
        this.showForm = this.canEdit;
      },
    });
  }

  get selectedType(): ModelDocumentFileType | null {
    const typeId = Number(this.documentForm?.get('documentFileTypeId')?.value);
    return this.documentTypes.find((type) => type.id === typeId) || null;
  }

  /** El backend exige la fecha cuando el tipo la declara obligatoria. */
  get expiryRequired(): boolean {
    return this.selectedType?.requiresExpiry === true;
  }

  /**
   * El tipo es obligatorio. Falta se avisa bajo el campo, no en la alerta:
   * el botón ya queda deshabilitado mientras no se elija uno.
   */
  get typeMissing(): boolean {
    return !this.documentForm?.getRawValue().documentFileTypeId;
  }

  /**
   * Guardar se habilita solo cuando el formulario pasa las mismas reglas que
   * validaría el backend, para no ofrecer una acción que va a fallar.
   */
  get canSubmit(): boolean {
    if (!this.documentForm) return false;
    return !this.typeMissing && !this.validate();
  }

  /**
   * Documento vigente del tipo elegido, distinto del que se edita. Guardar
   * sobre él no lo borra: lo manda al histórico. Se avisa antes.
   */
  get typeBeingRenewed(): DocumentRow | null {
    const type = this.selectedType;
    if (!type) return null;
    return (
      this.rows.find(
        (row) =>
          row.document.documentFileTypeId === type.id &&
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
    this.formError = '';
    this.selectedFile = null;
    this.currentFileUrl = row.document.fileUrl || null;
    this.currentObservations = row.document.observations || null;
    this.selectedFileName = this.currentFileUrl
      ? this.fileNameOf(this.currentFileUrl)
      : '';
    this.documentForm.reset({
      documentFileTypeId: row.document.documentFileTypeId,
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
    this.formError = '';
    this.selectedFile = null;
    this.selectedFileName = '';
    this.currentFileUrl = null;
    this.currentObservations = null;
    this.documentForm.reset({
      documentFileTypeId: row.document.documentFileTypeId,
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
    this.formError = '';
  }

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
      this.formError =
        'Formato no permitido. Se aceptan: ' + ALLOWED_EXTENSIONS.join(', ');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      this.formError =
        'El archivo supera los ' + MAX_FILE_SIZE_MB + ' MB permitidos.';
      return;
    }

    this.selectedFile = file;
    this.selectedFileName = file.name;
    this.formError = '';
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

  /**
   * Mismas reglas que valida el backend, adelantadas aquí para no gastar un
   * viaje ni perder la carga: el portador y el tipo los pone el formulario, así
   * que lo que queda por revisar es la coherencia de fechas y que la fila sirva
   * para algo.
   */
  private validate(): string {
    const value = this.documentForm.getRawValue();
    if (this.expiryRequired && !value.expiryDate) {
      return (
        'El documento "' +
        (this.selectedType?.name || '') +
        '" exige fecha de vencimiento.'
      );
    }
    if (!this.selectedFile && !this.currentFileUrl && !value.expiryDate) {
      return 'Agrega el archivo o la fecha de vencimiento: con ninguno de los dos el documento no registra nada.';
    }
    if (
      value.issueDate &&
      value.expiryDate &&
      value.expiryDate < value.issueDate
    ) {
      return 'La fecha de vencimiento es anterior a la de expedición.';
    }
    return '';
  }

  async saveDocument(): Promise<void> {
    if (this.isSaving) return;

    this.documentForm.markAllAsTouched();
    if (this.typeMissing) return;

    const error = this.validate();
    if (error) {
      this.formError = error;
      return;
    }

    this.formError = '';
    this.isSaving = true;

    try {
      let fileUrl = this.currentFileUrl;
      if (this.selectedFile) {
        const uploadRes = await firstValueFrom(
          this.commonService.uploadDocument(
            this.selectedFile,
            this.selectedFileName,
          ),
        );
        fileUrl = uploadRes?.data || null;
      }

      const value = this.documentForm.getRawValue();
      const payload: ModelDocumentFile = {
        documentFileTypeId: Number(value.documentFileTypeId),
        vehicleId: this.vehicleId,
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

      await firstValueFrom(this.vehicleService.saveVehicleDocuments([payload]));

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
      console.error('Error saving vehicle document:', err);
      this.isSaving = false;
      this.formError =
        err?.error?.message ||
        'No se pudo guardar el documento. Intenta de nuevo.';
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
    this.vehicleService.deleteVehicleDocument(id).subscribe({
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
        console.error('Error deleting vehicle document:', err);
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
