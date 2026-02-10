import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ModelPayment } from 'src/app/models/payment-model';
import { PaymentService } from 'src/app/services/payment.service';
import { AutoUtils } from 'src/app/services/utils/auto-utils.service';

@Component({
  selector: 'g-card-payment',
  templateUrl: './g-card-payment.component.html',
  styleUrls: ['./g-card-payment.component.scss'],
})
export class GCardPaymentComponent extends AutoUtils implements OnChanges {
  @Input() price?: number;
  @Input() status?: string;
  @Output() modelEmiter: EventEmitter<ModelPayment> =
    new EventEmitter<ModelPayment>();

  listPayment: any[] = [];
  payment: ModelPayment = new ModelPayment();
  errorText: string = 'Este campo es obligatorio para continuar';
  maxValue?: number;

  paymentForm: FormGroup = new FormGroup({});

  constructor(
    private readonly paymentService: PaymentService,
    private readonly fb: FormBuilder
  ) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes) {
      this.createForm();
      this.getListPaymentMethod();
      this.payment.now = true;
      this.payment.paymentMethodId = 1;
      this.payment.amount = this.price;
      this.payment.paymentDate = new Date();
      this.maxValue = this.payment.amount;
      this.setNow(true);
    }
  }

  createForm() {
    this.paymentForm = this.fb.group({
      payment: ['', Validators.required],
      price: ['', Validators.required],
    });
  }

  getListPaymentMethod() {
    this.addSubscription(
      this.paymentService.getListPaymentMethod().subscribe({
        next: (res) => {
          if (res.data) {
            this.listPayment = res.data;
          }
        },
        error: (err) => {
          console.error('Error al obtener metodos de pago', err);
        },
      })
    );
  }

  isInvalid(field: string) {
    return (
      this.paymentForm.get(field)?.invalid &&
      this.paymentForm.get(field)?.touched
    );
  }

  setNow(event: any) {
    this.payment.now = event;
    this.payment.paymentMethodId = 1;
    if (this.payment.now == true) {
      if (this.payment.amount === this.price) this.payment.status = 'Completed';
      else if (this.payment.amount !== 0) this.payment.status = 'Partial';
      else this.payment.status = 'Pending';
      this.paymentForm.get('price')!.enable();
    } else {
      this.payment.status = 'Pending';
      this.paymentForm.get('price')!.disable();
    }
    this.modelEmiter.emit(this.payment);
  }

  setValue(event: any) {
    if (this.payment.now == true) {
      if (this.payment.amount === this.price) this.payment.status = 'Completed';
      else if (this.payment.amount !== 0) this.payment.status = 'Partial';
      else this.payment.status = 'Pending';
    } else {
      this.payment.status = 'Pending';
    }
    this.modelEmiter.emit(this.payment);
  }
}
