import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardPartnerAccessComponent } from './g-card-partner-access.component';

describe('GCardPartnerAccessComponent', () => {
  let component: GCardPartnerAccessComponent;
  let fixture: ComponentFixture<GCardPartnerAccessComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GCardPartnerAccessComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GCardPartnerAccessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
