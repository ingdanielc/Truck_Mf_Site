import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GVehicleDocumentsComponent } from './g-vehicle-documents.component';
import { CommonService } from 'src/app/services/common.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';

/* ==========================================================================
   La zona de carga de documentos iba en columna y ocupaba mucho mas que la
   ficha que la sustituye al elegir el archivo. Ahora mide lo que un campo,
   igual que en el formulario de gastos.

   El alto se mide de verdad: lo fija el SCSS del propio componente, que Karma
   compila, y la regla lleva su `box-sizing` explicito para no depender del
   reinicio de Bootstrap, que lo carga el shell y aqui no existe.
   ========================================================================== */

/** El alto de un campo, el mismo numero que fija `.field-height`. */
const ALTO = 62;

describe('GVehicleDocumentsComponent · alto de la zona de carga', () => {
  let fixture: ComponentFixture<GVehicleDocumentsComponent>;
  let component: GVehicleDocumentsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GVehicleDocumentsComponent],
      providers: [
        {
          provide: CommonService,
          useValue: {
            getDocumentFileTypes: () => of({ data: [] }),
            uploadDocument: () => of({ data: '' }),
          },
        },
        {
          provide: VehicleService,
          useValue: {
            getVehicleDocuments: () =>
              of({ data: { content: [], totalElements: 0 } }),
            saveVehicleDocument: () => of({ data: {} }),
          },
        },
        {
          provide: ToastService,
          useValue: {
            showError: () => undefined,
            showSuccess: () => undefined,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GVehicleDocumentsComponent);
    component = fixture.componentInstance;
    component.vehicleId = 5;
    fixture.detectChanges();

    /* El formulario solo existe con la hoja de alta abierta. */
    component.showForm = true;
    fixture.detectChanges();
  });

  function bloque(selector: string): HTMLElement {
    const el = fixture.nativeElement.querySelector(selector) as HTMLElement;
    expect(el).withContext(selector).toBeTruthy();
    return el;
  }

  function alto(selector: string): number {
    return bloque(selector).getBoundingClientRect().height;
  }

  it('la zona de carga mide lo que un campo', () => {
    expect(alto('.file-dropzone')).toBe(ALTO);
  });

  it('va en fila, no en columna: es lo que la hacia alta', () => {
    const zona = bloque('.file-dropzone');

    expect(zona.classList).toContain('d-flex');
    expect(zona.classList).not.toContain('flex-column');
    expect(zona.classList).toContain('align-items-center');
  });

  it('conserva el icono y las dos lineas de texto', () => {
    const zona = bloque('.file-dropzone');

    expect(zona.querySelector('i')!.classList).toContain('fa-cloud-arrow-up');
    expect(zona.textContent).toContain('Seleccionar archivo');
    expect(zona.textContent).toContain('MB');
  });

  it('la ficha del archivo cargado mide lo mismo que la zona de carga', () => {
    /* Si midieran distinto, el bloque saltaria justo al elegir el archivo. */
    const zona = alto('.file-dropzone');

    component.selectedFileName = 'soat.pdf';
    component.currentFileUrl = 'https://cdn/archivos/soat.pdf';
    fixture.detectChanges();

    expect(alto('.file-chip')).toBe(zona);
    expect(alto('.file-chip')).toBe(ALTO);
  });

  it('la barra de vigencia ocupa el ancho de la tarjeta', () => {
    /* Dentro de la columna de texto se cortaba donde empiezan los iconos.
       Como hija de la tarjeta, su unico margen es el relleno de esta. */
    component.rows = [
      {
        document: {
          id: 1,
          documentFileTypeId: 1,
          expiryDate: '2030-01-01',
          fileUrl: 'https://cdn/archivos/soat.pdf',
        },
        name: 'SOAT',
        validity: {
          state: 'vigente',
          daysLeft: 300,
          percent: 80,
          label: 'Vence en 300 dias',
        },
      },
    ] as any;
    fixture.detectChanges();

    const tarjeta = bloque('.draft-item');
    const barra = bloque('.validity-track');

    /* Hija directa de la tarjeta, no de la columna que comparten texto e
       iconos. */
    expect(barra.parentElement).toBe(tarjeta);
    expect(barra.closest('.draft-row')).toBeNull();

    /* Y ocupa todo lo que la tarjeta le deja. La relacion se sostiene con o
       sin el relleno de Bootstrap, que aqui no esta: lo que se compara es el
       ancho de la barra contra el hueco real de la tarjeta. */
    const caja = getComputedStyle(tarjeta);
    const hueco =
      tarjeta.clientWidth -
      Number.parseFloat(caja.paddingLeft) -
      Number.parseFloat(caja.paddingRight);
    expect(hueco).toBeGreaterThan(0);
    expect(Math.abs(barra.getBoundingClientRect().width - hueco))
      .withContext(`barra ${barra.getBoundingClientRect().width} vs ${hueco}`)
      .toBeLessThanOrEqual(1);
  });
});
