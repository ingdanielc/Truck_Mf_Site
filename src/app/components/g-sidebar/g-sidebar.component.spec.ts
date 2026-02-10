import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GSidebarComponent } from './g-sidebar.component';

describe('GSidebarComponent', () => {
  let component: GSidebarComponent;
  let fixture: ComponentFixture<GSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GSidebarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
