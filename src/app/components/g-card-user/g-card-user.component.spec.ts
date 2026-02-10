import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GCardUserComponent } from './g-card-user.component';

describe('GCardUserComponent', () => {
  let component: GCardUserComponent;
  let fixture: ComponentFixture<GCardUserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GCardUserComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GCardUserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
