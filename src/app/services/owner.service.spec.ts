import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { OwnerService } from './owner.service';

describe('OwnerService', () => {
  let service: OwnerService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OwnerService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(OwnerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
