import { TestBed } from '@angular/core/testing';

import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { CommonService } from './common.service';

describe('CommonService', () => {
  let service: CommonService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [],
      providers: [
        CommonService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CommonService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('sube el PDF sin tocar, con type e id', async () => {
    const http = TestBed.inject(HttpTestingController);
    const pdf = new File(['%PDF-1.4'], 'manifiesto.pdf', {
      type: 'application/pdf',
    });

    const respuesta = firstValueFrom(
      service.uploadDocument(pdf, pdf.name, { type: 'trip', id: 4 }),
    );
    /* La preparación del archivo es asíncrona: la petición sale después. */
    await new Promise((resolve) => setTimeout(resolve));

    const req = http.expectOne(`${service.basePath}/upload-document`);
    const body = req.request.body as FormData;
    expect((body.get('file') as File).name).toBe('manifiesto.pdf');
    expect(body.get('type')).toBe('trip');
    expect(body.get('id')).toBe('4');
    req.flush({ data: 'https://x/manifiesto.pdf' });

    expect((await respuesta).data).toBe('https://x/manifiesto.pdf');
    http.verify();
  });

  it('en mantenimiento envía el tipo de gasto para que el id sea del vehículo', async () => {
    const http = TestBed.inject(HttpTestingController);
    const pdf = new File(['%PDF-1.4'], 'factura.pdf', {
      type: 'application/pdf',
    });

    const respuesta = firstValueFrom(
      service.uploadDocument(pdf, pdf.name, {
        type: 'expense',
        id: 12,
        expenseTypeId: 4,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve));

    const body = http.expectOne(`${service.basePath}/upload-document`).request
      .body as FormData;
    expect(body.get('type')).toBe('expense');
    expect(body.get('id')).toBe('12');
    expect(body.get('expenseTypeId')).toBe('4');
    http.match(() => true).forEach((req) => req.flush({}));
  });

  it('sin tipo de gasto no envía expenseTypeId', async () => {
    const http = TestBed.inject(HttpTestingController);
    const pdf = new File(['%PDF-1.4'], 'recibo.pdf', {
      type: 'application/pdf',
    });

    firstValueFrom(
      service.uploadDocument(pdf, pdf.name, { type: 'expense', id: 7 }),
    );
    await new Promise((resolve) => setTimeout(resolve));

    const req = http.expectOne(`${service.basePath}/upload-document`);
    expect((req.request.body as FormData).has('expenseTypeId')).toBeFalse();
    req.flush({});
  });
});
