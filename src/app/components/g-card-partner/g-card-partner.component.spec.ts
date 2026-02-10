import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardPartnerComponent } from './g-card-partner.component';

describe('GCardPartnerComponent', () => {
  let component: GCardPartnerComponent;
  let fixture: ComponentFixture<GCardPartnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GCardPartnerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GCardPartnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
