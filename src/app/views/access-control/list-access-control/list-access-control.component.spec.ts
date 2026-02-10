import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ListAccessControlComponent } from './list-access-control.component';

describe('ListAccessControlComponent', () => {
  let component: ListAccessControlComponent;
  let fixture: ComponentFixture<ListAccessControlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ListAccessControlComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ListAccessControlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
