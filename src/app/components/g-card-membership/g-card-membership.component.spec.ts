import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardMembershipComponent } from './g-card-membership.component';

describe('GCardMembershipComponent', () => {
  let component: GCardMembershipComponent;
  let fixture: ComponentFixture<GCardMembershipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GCardMembershipComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GCardMembershipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
