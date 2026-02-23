import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';

@Component({
  selector: 'g-password-card',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './g-password-card.component.html',
  styleUrls: ['./g-password-card.component.scss'],
})
export class GPasswordCardComponent {
  @Output() update = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  passwordForm: FormGroup;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;

  constructor(private readonly fb: FormBuilder) {
    this.passwordForm = this.fb.group(
      {
        currentPassword: ['', [Validators.required]],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  private passwordMatchValidator(g: FormGroup) {
    const newPwd = g.get('newPassword')?.value;
    const confirmPwd = g.get('confirmPassword')?.value;
    return newPwd === confirmPwd ? null : { mismatch: true };
  }

  get strength(): number {
    const pwd = this.passwordForm.get('newPassword')?.value || '';
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 8) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return s;
  }

  get strengthLabel(): string {
    const s = this.strength;
    if (s === 0) return '';
    if (s <= 1) return 'Débil';
    if (s === 2) return 'Media';
    if (s === 3) return 'Buena';
    return 'Fuerte';
  }

  toggleVisibility(field: 'current' | 'new' | 'confirm'): void {
    if (field === 'current')
      this.showCurrentPassword = !this.showCurrentPassword;
    if (field === 'new') this.showNewPassword = !this.showNewPassword;
    if (field === 'confirm')
      this.showConfirmPassword = !this.showConfirmPassword;
  }

  onSubmit(): void {
    if (this.passwordForm.valid) {
      this.update.emit(this.passwordForm.value);
    } else {
      this.passwordForm.markAllAsTouched();
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
