import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GModalComponent } from './g-modal.component';

describe('GModalComponent', () => {
  let component: GModalComponent;
  let fixture: ComponentFixture<GModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GModalComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('debería establecer show en false y emitir showChange cuando se llama a closeModal sin parámetros', () => {
    spyOn(component.showChange, 'emit');

    component.closeModal();

    expect(component.show).toBe(false);
    expect(component.showChange.emit).toHaveBeenCalledWith(false);
  });

  it('debería emitir closeEvent cuando se llama a closeModal con isClickCloseIcon en true', () => {
    spyOn(component.closeEvent, 'emit');

    component.closeModal(undefined, true);

    expect(component.show).toBe(false);
    expect(component.closeEvent.emit).toHaveBeenCalledWith(false);
  });

  it('no debería emitir closeEvent cuando se llama a closeModal con isClickCloseIcon en false', () => {
    spyOn(component.closeEvent, 'emit');

    component.closeModal(undefined, false);

    expect(component.show).toBe(false);
    expect(component.closeEvent.emit).not.toHaveBeenCalled();
  });
});
