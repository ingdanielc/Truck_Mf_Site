import { Component, Input } from '@angular/core';
import {
  DocumentAlertGroup,
  DocumentAlertSummary,
  summarizeDocumentAlerts,
} from 'src/app/utils/document-alerts';

/**
 * Aviso compacto de documentos vencidos o por vencer. Muestra el conteo y, con
 * "Ver detalle", despliega la lista agrupada por vehículo y conductor.
 *
 * Solo pinta: quien lo usa arma los grupos (ver `utils/document-alerts`). Sin
 * grupos no se muestra nada.
 */
@Component({
  selector: 'g-document-alert',
  standalone: true,
  templateUrl: './g-document-alert.component.html',
  styleUrls: ['./g-document-alert.component.scss'],
})
export class GDocumentAlertComponent {
  /** Nota al pie del detalle, según la pantalla que lo usa. */
  @Input() hint: string = '';

  groups: DocumentAlertGroup[] = [];
  summary: DocumentAlertSummary | null = null;
  expanded: boolean = false;

  /** El resumen se calcula al recibir los grupos y no en la plantilla. */
  @Input('groups') set groupsInput(value: DocumentAlertGroup[] | null) {
    this.groups = value ?? [];
    this.summary = this.groups.length
      ? summarizeDocumentAlerts(this.groups)
      : null;
    if (!this.groups.length) this.expanded = false;
  }

  toggle(): void {
    this.expanded = !this.expanded;
  }
}
