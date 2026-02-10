import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GMenuComponent } from './g-menu.component';

describe('GMenuComponent', () => {
  let component: GMenuComponent;
  let fixture: ComponentFixture<GMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GMenuComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
