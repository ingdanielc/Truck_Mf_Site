import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from 'src/environments/environment';
import { TollService } from './toll.service';
import { TollEstimateRequest } from '../models/toll-model';

/** La consulta mínima que arma el panel del trayecto. */
const request = (extra: Partial<TollEstimateRequest> = {}): TollEstimateRequest =>
  ({
    origin: { lat: 4.711, lng: -74.072, cityId: '11001' },
    destination: { lat: 6.244, lng: -75.581, cityId: '05001' },
    vehicleId: 1,
    travelDate: '2026-09-07',
    ...extra,
  }) as TollEstimateRequest;

describe('TollService', () => {
  let service: TollService;
  let httpMock: HttpTestingController;
  const url = `${environment._APIUrl}/trip/tolls`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TollService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(TollService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('devuelve la estimación que trae el sobre de la API', () => {
    let result: any = 'sin respuesta';
    service.estimate(request()).subscribe((estimate) => (result = estimate));

    const call = httpMock.expectOne(url);
    expect(call.request.method).toBe('POST');
    call.flush({
      data: { total: 189500, tolls: [{ id: 45, name: 'CHUSACÁ', amount: 27100 }] },
    });

    expect(result.total).toBe(189500);
    expect(result.tolls.length).toBe(1);
  });

  it('devuelve null ante un error, sin propagarlo', () => {
    let result: any = 'sin respuesta';
    let failed = false;
    service.estimate(request()).subscribe({
      next: (estimate) => (result = estimate),
      error: () => (failed = true),
    });

    httpMock
      .expectOne(url)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(failed).toBeFalse();
    expect(result).toBeNull();
  });

  it('no repite la consulta del mismo trayecto', () => {
    service.estimate(request()).subscribe();
    httpMock.expectOne(url).flush({ data: { total: 1, tolls: [] } });

    let cached: any = 'sin respuesta';
    service.estimate(request()).subscribe((estimate) => (cached = estimate));

    httpMock.expectNone(url);
    expect(cached.total).toBe(1);
  });

  it('distingue el viaje redondo del sencillo en la caché', () => {
    service.estimate(request()).subscribe();
    httpMock.expectOne(url).flush({ data: { total: 1, tolls: [] } });

    service
      .estimate(
        request({
          returnDestination: { lat: 4.711, lng: -74.072, cityId: '11001' },
        }),
      )
      .subscribe();

    httpMock.expectOne(url).flush({ data: { total: 2, tolls: [] } });
  });

  it('manda el trayecto sin trazado cuando la polilínea excede el tope', () => {
    const oversized = 'a'.repeat(service.MAX_POLYLINE_LENGTH + 1);
    service
      .estimate(
        request({
          route: { provider: 'GOOGLE_ROUTES', encodedPolyline: oversized },
        }),
      )
      .subscribe();

    const call = httpMock.expectOne(url);
    expect(JSON.parse(call.request.body).route).toBeUndefined();
    call.flush({ data: { total: 0, tolls: [] } });
  });
});
