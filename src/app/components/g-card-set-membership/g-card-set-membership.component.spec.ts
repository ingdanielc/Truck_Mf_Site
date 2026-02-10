import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardSetMembershipComponent } from './g-card-set-membership.component';

describe('GCardSetMembershipComponent', () => {
  let component: GCardSetMembershipComponent;
  let fixture: ComponentFixture<GCardSetMembershipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GCardSetMembershipComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GCardSetMembershipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
