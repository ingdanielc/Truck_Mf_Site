import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { SecurityService } from '../../services/security/security.service';

@Component({
  selector: 'g-password-card',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  templateUrl: './g-password-card.component.html',
  styleUrls: ['./g-password-card.component.scss'],
})
export class GPasswordCardComponent implements OnChanges {
  @Input() userEmail: string = '';
  @Input() requiresCurrentPasswordValidation: boolean = false;

  @Output() update = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  passwordForm: FormGroup;
  showCurrentPassword = false;
  showNewPassword = false;
  showConfirmPassword = false;
  isValidating = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly securityService: SecurityService,
  ) {
    this.passwordForm = this.fb.group(
      {
        currentPassword: [''],
        newPassword: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      {
        validators: this.passwordMatchValidator,
      },
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['requiresCurrentPasswordValidation'] || changes['userEmail']) {
      // Reset form to clean state when switching between users
      this.passwordForm.reset();
      this.showCurrentPassword = false;
      this.showNewPassword = false;
      this.showConfirmPassword = false;

      if (this.requiresCurrentPasswordValidation) {
        this.passwordForm
          .get('currentPassword')
          ?.setValidators([Validators.required]);
      } else {
        this.passwordForm.get('currentPassword')?.clearValidators();
      }
      this.passwordForm.get('currentPassword')?.updateValueAndValidity();
    }
  }

  public reset(): void {
    this.passwordForm.reset();
    this.showCurrentPassword = false;
    this.showNewPassword = false;
    this.showConfirmPassword = false;
    this.isValidating = false;

    // Re-apply validators if needed
    if (this.requiresCurrentPasswordValidation) {
      this.passwordForm
        .get('currentPassword')
        ?.setValidators([Validators.required]);
    } else {
      this.passwordForm.get('currentPassword')?.clearValidators();
    }
    this.passwordForm.get('currentPassword')?.updateValueAndValidity();
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

  async onSubmit(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    if (this.requiresCurrentPasswordValidation) {
      const currentPassword = this.passwordForm.get('currentPassword')?.value;
      this.isValidating = true;

      try {
        const hashedCurrentPassword =
          await this.securityService.getHashSHA512(currentPassword);

        this.securityService
          .authenticate(this.userEmail, hashedCurrentPassword)
          .subscribe({
            next: (response) => {
              this.isValidating = false;
              if (response.status === 200) {
                this.update.emit(this.passwordForm.value);
              } else {
                this.passwordForm
                  .get('currentPassword')
                  ?.setErrors({ invalidPassword: true });
              }
            },
            error: () => {
              this.isValidating = false;
              this.passwordForm
                .get('currentPassword')
                ?.setErrors({ invalidPassword: true });
            },
          });
      } catch {
        this.isValidating = false;
      }
    } else {
      this.update.emit(this.passwordForm.value);
    }
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
