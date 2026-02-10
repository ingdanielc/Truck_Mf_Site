import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardPaymentComponent } from './g-card-payment.component';

describe('GCardPaymentComponent', () => {
  let component: GCardPaymentComponent;
  let fixture: ComponentFixture<GCardPaymentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GCardPaymentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GCardPaymentComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
