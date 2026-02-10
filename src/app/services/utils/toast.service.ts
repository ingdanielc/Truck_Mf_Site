import { Injectable } from '@angular/core';
import { MessageService } from 'primeng/api';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  constructor(private readonly msgService: MessageService) {}

  showSuccess(summary: string, detail: string) {
    this.msgService.add({
      severity: 'success',
      summary: summary,
      detail: detail,
    });
  }

  showInfo(summary: string, detail: string) {
    this.msgService.add({ severity: 'info', summary: summary, detail: detail });
  }

  showWarn(summary: string, detail: string) {
    this.msgService.add({ severity: 'warn', summary: summary, detail: detail });
  }

  showError(summary: string, detail: string) {
    this.msgService.add({
      severity: 'error',
      summary: summary,
      detail: detail,
    });
  }

  addAll(list: any[]) {
    this.clear();
    this.msgService.addAll(list);
  }

  clear() {
    this.msgService.clear();
  }
}
