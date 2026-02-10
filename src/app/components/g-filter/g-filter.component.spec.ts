import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GFilterComponent } from './g-filter.component';
import { AccordionModule } from 'primeng/accordion';
import { GDropdownModule } from 'gattaca-lib';

describe('GFilterComponent', () => {
  let component: GFilterComponent;
  let fixture: ComponentFixture<GFilterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GFilterComponent],
      imports: [AccordionModule, GDropdownModule],
    }).compileComponents();

    fixture = TestBed.createComponent(GFilterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
