import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GAddExpenseComponent } from './g-add-expense.component';
import { VehicleService } from 'src/app/services/expense.service';
import { VehicleService as VehicleRealService } from 'src/app/services/vehicle.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { DriverService } from 'src/app/services/driver.service';
import { CommonService } from 'src/app/services/common.service';
import { Router } from '@angular/router';

/* ==========================================================================
   Los campos del formulario de gastos miden todos lo mismo: 62px.

   Esto sí se mide en pixeles, y la medida vale: el alto lo fija el SCSS del
   propio componente, que Karma sí compila, y la regla lleva su `box-sizing`
   explicito para no depender del reinicio de Bootstrap, que lo carga el shell
   y aqui no existe. Lo que sigue sin ser medible es lo que dependa de clases
   de Bootstrap; para eso estan las comprobaciones de estructura.
   ========================================================================== */

/** El alto unico, el mismo que fija `.expense-field` en el SCSS. */
const ALTO = 62;

describe('GAddExpenseComponent · alto del comprobante', () => {
  let fixture: ComponentFixture<GAddExpenseComponent>;
  let component: GAddExpenseComponent;

  beforeEach(async () => {
    const vacio = of({ data: { content: [] } });

    await TestBed.configureTestingModule({
      imports: [GAddExpenseComponent],
      providers: [
        {
          provide: VehicleService,
          useValue: { getExpenseCategoryFilter: () => vacio },
        },
        {
          provide: VehicleRealService,
          useValue: {
            getVehicleOwnerFilter: () => vacio,
            getVehicleFilter: () => vacio,
          },
        },
        { provide: SecurityService, useValue: { userData$: of(null) } },
        { provide: OwnerService, useValue: { getOwnerFilter: () => vacio } },
        { provide: DriverService, useValue: { getDriverFilter: () => vacio } },
        {
          provide: CommonService,
          useValue: {
            getSalaryTypes: () => of({ data: [] }),
            getListTypeDocument: () => of({ data: [] }),
          },
        },
        { provide: Router, useValue: { navigate: () => undefined } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GAddExpenseComponent);
    component = fixture.componentInstance;
    component.vehicleId = 5;
    fixture.detectChanges();
  });

  function bloque(selector: string): HTMLElement {
    const el = fixture.nativeElement.querySelector(selector) as HTMLElement;
    expect(el).withContext(selector).toBeTruthy();
    return el;
  }

  function conArchivo(): void {
    component.receiptFile = new File([new Uint8Array(8)], 'factura.jpg');
    component.receiptFileName = 'factura.jpg';
    fixture.detectChanges();
  }

  function alto(el: HTMLElement): number {
    return el.getBoundingClientRect().height;
  }

  it('la zona de carga y la ficha del archivo miden los 62px', () => {
    expect(alto(bloque('.file-dropzone'))).toBe(ALTO);

    conArchivo();

    expect(alto(bloque('.file-chip'))).toBe(ALTO);
  });

  it('fecha, monto y descripcion miden los mismos 62px', () => {
    component.trip = { startDate: '2020-01-01' } as any;
    fixture.detectChanges();

    for (const campo of ['#desc', '.input-group.expense-field']) {
      for (const el of Array.from(
        fixture.nativeElement.querySelectorAll(campo),
      )) {
        expect(alto(el as HTMLElement))
          .withContext(campo)
          .toBe(ALTO);
      }
    }
    /* Que esten los tres: el monto, la descripcion y la fecha, que solo sale
       con un viaje de dias pasados. */
    expect(
      fixture.nativeElement.querySelectorAll('.expense-field').length,
    ).toBeGreaterThanOrEqual(4);
  });

  it('las dos llevan dos lineas de texto, y del mismo tamano', () => {
    function lineas(el: HTMLElement): string[] {
      const nodos = Array.from(
        el.querySelectorAll('.small, [style*="0.72rem"]'),
      );
      return nodos.map((n) =>
        (n as HTMLElement).getAttribute('style')?.includes('0.72rem')
          ? 'menor'
          : 'small',
      );
    }

    const zona = lineas(bloque('.file-dropzone'));

    conArchivo();
    const ficha = lineas(bloque('.file-chip'));

    expect(zona).toEqual(['small', 'menor']);
    expect(ficha).toEqual(['small', 'menor']);
  });

  /* ---- Descripción --------------------------------------------------- */

  it('la descripcion no depende de `rows` para su alto', () => {
    /* Con el alto fijo manda el CSS, no el atributo: da igual con cuantas
       filas se declare, y por eso la prueba mide en vez de contarlas. */
    const desc = bloque('#desc') as HTMLTextAreaElement;
    const conLasSuyas = alto(desc);

    desc.rows = 4;
    expect(alto(desc)).toBe(conLasSuyas);
    expect(conLasSuyas).toBe(ALTO);
  });

  it('la descripcion mide 62px con la letra en su tamano normal', () => {
    /* El alto sale de `.expense-field`, no de agrandar la letra: la
       descripcion se lee como texto y no como una cifra. */
    const desc = bloque('#desc');

    expect(alto(desc)).toBe(ALTO);
    expect(desc.classList).not.toContain('form-control-lg');
  });

  it('el alto no lo pone el relleno, que es lo que los descuadraba', () => {
    /* El monto lleva letra mas grande y el comprobante botones: cuadrando
       rellenos cada uno acababa distinto. Manda `.expense-field`. */
    const desc = bloque('#desc');
    expect(desc.classList).toContain('expense-field');
    expect(desc.classList).not.toContain('p-3');
    expect(desc.classList).not.toContain('py-3');

    const monto = bloque('.input-group.expense-field .form-control');
    expect(monto.classList).not.toContain('py-3');
  });

  it('en mantenimiento la descripcion mide igual', () => {
    /* Mantenimiento es el mismo formulario con otro rotulo: si el alto
       dependiera de esa bandera, se habria escapado por ahi. */
    const antes = alto(bloque('#desc'));

    component.isMaintenance = true;
    fixture.detectChanges();

    expect(alto(bloque('#desc'))).toBe(antes);
    expect(antes).toBe(ALTO);
  });

  it('los botones de la ficha no mandan sobre el alto', () => {
    /* Miden 32px fijos, por debajo de las dos lineas de texto, asi que
       aparecer o no, el de abrir solo esta al editar, no mueve la caja. */
    conArchivo();
    const sinAbrir = bloque('.file-chip').querySelectorAll('.draft-btn').length;

    component.receiptFile = null;
    component.currentReceiptUrl = 'https://cdn/archivos/factura.pdf';
    component.receiptFileName = 'factura.pdf';
    fixture.detectChanges();

    expect(component.canViewReceipt).toBeTrue();
    expect(sinAbrir).toBe(2);
    expect(bloque('.file-chip').querySelectorAll('.draft-btn').length).toBe(3);
  });
});
