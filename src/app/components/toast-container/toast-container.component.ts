import { Component } from '@angular/core';
import { ToastService } from '../../services/toast.service';
import { NgClass, NgFor } from '@angular/common';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [NgClass, NgFor],
  template: `
    <div
      class="toast-container position-fixed top-0 end-0 p-3"
      style="z-index: 1200"
    >
      <div
        *ngFor="let toast of toastService.toasts"
        class="toast show align-items-center border-0"
        [ngClass]="'text-bg-' + toast.type"
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
      >
        <div class="d-flex">
          <div class="toast-body">
            <strong>{{ toast.title }}</strong
            ><br />
            {{ toast.message }}
          </div>
          <button
            type="button"
            class="btn-close btn-close-white me-2 m-auto"
            (click)="toastService.remove(toast)"
            aria-label="Close"
          ></button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class ToastContainerComponent {
  constructor(public toastService: ToastService) {}
}
