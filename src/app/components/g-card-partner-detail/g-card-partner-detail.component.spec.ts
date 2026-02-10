import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardPartnerDetailComponent } from './g-card-partner-detail.component';

describe('GCardPartnerDetailComponent', () => {
  let component: GCardPartnerDetailComponent;
  let fixture: ComponentFixture<GCardPartnerDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GCardPartnerDetailComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GCardPartnerDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
