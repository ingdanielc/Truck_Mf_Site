import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GSearchComboboxComponent } from './g-search-combobox.component';

/**
 * Lo único que se prueba aquí con la plantilla montada: que el alto del teclado
 * llegue de verdad al estilo de la hoja. Es la pieza de la que depende que en
 * el teléfono la hoja se suba por encima de las teclas, y no se puede
 * comprobar sin dibujar.
 */
describe('GSearchComboboxComponent, el alto del teclado', () => {
  let fixture: ComponentFixture<GSearchComboboxComponent>;
  let combo: GSearchComboboxComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GSearchComboboxComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GSearchComboboxComponent);
    combo = fixture.componentInstance;
    combo.groups = [
      { state: 'Antioquia', cities: [{ id: 1, name: 'Medellín' }] },
    ];
    fixture.detectChanges();
  });

  const hoja = (): HTMLElement =>
    fixture.nativeElement.querySelector('.search-combobox-sheet');

  it('llega a la hoja como una medida en píxeles', () => {
    combo.abrir();
    combo.tecladoPx = 300;
    fixture.detectChanges();

    expect(hoja().style.getPropertyValue('--teclado')).toBe('300px');
  });

  it('sin teclado la hoja se queda apoyada abajo', () => {
    combo.abrir();
    fixture.detectChanges();

    expect(hoja().style.getPropertyValue('--teclado')).toBe('0px');
  });
});
