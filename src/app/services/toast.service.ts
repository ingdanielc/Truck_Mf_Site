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

  constructor() {
    const queuedToast = sessionStorage.getItem('pending_toast');
    if (queuedToast) {
      try {
        const toast = JSON.parse(queuedToast);
        if (toast.type === 'success') {
          this.showSuccess(toast.title, toast.message, toast.delay);
        } else {
          this.showError(toast.title, toast.message, toast.delay);
        }
      } catch (e) {
        console.error('Error parsing queued toast', e);
      } finally {
        sessionStorage.removeItem('pending_toast');
      }
    }
  }

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

  queueSuccess(title: string, message: string, delay: number = 5000) {
    sessionStorage.setItem(
      'pending_toast',
      JSON.stringify({ title, message, type: 'success', delay }),
    );
  }

  queueError(title: string, message: string, delay: number = 5000) {
    sessionStorage.setItem(
      'pending_toast',
      JSON.stringify({ title, message, type: 'danger', delay }),
    );
  }

  remove(toast: Toast) {
    this.toasts = this.toasts.filter((t) => t !== toast);
  }
}
