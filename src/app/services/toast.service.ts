import { Injectable } from '@angular/core';

export interface Toast {
  title: string;
  message: string;
  type: 'success' | 'danger' | 'info';
  delay?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  toasts: Toast[] = [];

  showSuccess(title: string, message: string, delay: number = 5000) {
    const toast: Toast = { title, message, type: 'success', delay };
    this.toasts.push(toast);
    setTimeout(() => this.remove(toast), delay);
  }

  showError(title: string, message: string, delay: number = 5000) {
    const toast: Toast = { title, message, type: 'danger', delay };
    this.toasts.push(toast);
    setTimeout(() => this.remove(toast), delay);
  }

  remove(toast: Toast) {
    this.toasts = this.toasts.filter((t) => t !== toast);
  }
}
