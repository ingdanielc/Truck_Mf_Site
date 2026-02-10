import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GRadioButtonComponent } from './g-radio-button.component';

describe('GRadioButtonComponent', () => {
  let component: GRadioButtonComponent;
  let fixture: ComponentFixture<GRadioButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GRadioButtonComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GRadioButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
