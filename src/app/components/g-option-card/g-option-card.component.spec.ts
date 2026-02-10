import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GOptionCardComponent } from './g-option-card.component';
import { RouterTestingModule } from '@angular/router/testing';

describe('GOptionCardComponent', () => {
  let component: GOptionCardComponent;
  let fixture: ComponentFixture<GOptionCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GOptionCardComponent],
      imports: [RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(GOptionCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
