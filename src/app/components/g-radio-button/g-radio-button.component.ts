import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  OnInit,
  ChangeDetectorRef,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { PrimeNGConfig } from 'primeng/api';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-radio-button',
  templateUrl: './g-radio-button.component.html',
  styleUrls: ['./g-radio-button.component.scss'],
})
export class GRadioButtonComponent extends AutoUtils implements OnInit, OnChanges, OnDestroy {
  @Input() model: any;
  @Output() modelChange: EventEmitter<any> = new EventEmitter<any>();

  @Input() name: any;
  @Input() readonly: boolean = false;
  @Input() opcionTrue: any;
  @Input() opcionFalse: any;
  @Input() type: string = 'line';
  @Input() title: string = '';
  @Input() border: boolean = false;
  @Input() istextA: boolean = false;
  @Input() textA: string = '';
  @Input() istextB: boolean = false;
  @Input() textB: string = '';
  @Input() disabled: boolean = false;
  @Input() colorOption: string = '';
  @Input() regular: boolean = false;
  @Input() required: boolean = false;
  @Input() classContainer: string = '';
  @Input() classRadio: string = '';
  @Input() classTitle: string = '';
  @Input() classGeneral: string = '';
  @Input() styleGeneral: string = '';
  @Input() valueTrue: any = true;
  @Input() valueFalse: any = false;
  @Input() formGroup: FormGroup = new FormGroup({});

  @Input() valid: boolean = false;
  @Output() validChange: EventEmitter<any> = new EventEmitter();

  @Output() onBlur: EventEmitter<any> = new EventEmitter();
  @Output() onCLick: EventEmitter<any> = new EventEmitter();

  constructor(
    public readonly primeNgConfig: PrimeNGConfig,
    public readonly fb: FormBuilder,
    private readonly cd: ChangeDetectorRef
  ) {
    super();
  }

  ngOnInit(): void {
    this.primeNgConfig.ripple = true;
    this.generateFormat();
    this.generateControl();
  }

  // ngOnDestroy(): void {
  //   if (this.formGroup && this.name) {
  //     this.formGroup.removeControl(this.name);
  //   }
  //   this.formGroup = new FormGroup({});
  // }

  ngOnChanges(changes: any): void {
    if (changes.required) {
      this.updateControl();
    }
  }

  generateFormat(): void {
    if (!this.formGroup) {
      this.formGroup = this.fb.group({});
    }
  }

  updateControl() {
    const control = this.formGroup?.get(this.name);
    if (control) {
      this.onCLick.emit(this.model);
      control.setValue(this.model);
      control.markAsTouched();
      control.updateValueAndValidity();
      this.cd.detectChanges();
    }
  }

  generateControl(): void {
    if (this.formGroup) {
      if (!this.formGroup.get(this.name)) {
        this.name = this.getControlName();
        const control = this.fb.control(
          this.model || null,
          this.getValidators()
        );
        this.formGroup.addControl(this.name, control);
      } else {
        const control = this.formGroup.get(this.name);
        control?.setValidators(this.getValidators());
      }
      this.formGroup.get(this.name)?.updateValueAndValidity();
      this.updateControlAndValidate(this.formGroup, this.name);
    }
  }

  getValidators() {
    const validators = [];
    if (this.required) {
      validators.push(Validators.required);
    }
    validators.push(() => this.generateValidations());
    return Validators.compose(validators);
  }

  onModelChange(value: any): void {
    this.model = value;
    this.updateControl();
    this.modelChange.emit(this.model);
  }

  generateValidations() {
    if (this.validateRequired()) {
      return { errorRequired: true };
    }
    return null;
  }

  validateRequired(): boolean {
    if (this.required && this.formGroup && this.name) {
      const control = this.formGroup.get(this.name);
      return (
        control?.value === null ||
        control?.value === undefined ||
        control?.value === ''
      );
    }
    return false;
  }
}
