import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GTitleComponent } from './g-title.component';

describe('GTitleComponent', () => {
  let component: GTitleComponent;
  let fixture: ComponentFixture<GTitleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GTitleComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GTitleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
