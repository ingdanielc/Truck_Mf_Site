import { of } from 'rxjs';
import {
  loadTripManifests,
  manifestFileNameOf,
  manifestLabel,
  maxTripManifests,
  saveTripManifest,
  uploadManifestFile,
  validateManifestFile,
} from './trip-manifest';

describe('trip-manifest', () => {
  let commonService: jasmine.SpyObj<any>;

  beforeEach(() => {
    commonService = jasmine.createSpyObj('CommonService', [
      'getDocuments',
      'getDocumentFileTypes',
      'saveDocuments',
      'uploadDocument',
    ]);
    commonService.saveDocuments.and.returnValue(of({ data: [] }));
  });

  it('pide los manifiestos por tripId, del más antiguo al más nuevo', (done) => {
    commonService.getDocuments.and.returnValue(
      of({ data: { content: [{ id: 9, tripId: 4 }, { id: 11, tripId: 4 }] } }),
    );
    loadTripManifests(commonService, 4).subscribe((docs) => {
      const filtro = commonService.getDocuments.calls.argsFor(0)[0];
      expect(filtro.filter[0]).toEqual(
        jasmine.objectContaining({
          fieldFilter: 'tripId',
          compFilter: '=',
          valueFilter: '4',
        }),
      );
      expect(filtro.sort.sortAsc).toBeTrue();
      expect(docs.map((d) => d.id)).toEqual([9, 11]);
      done();
    });
  });

  it('sin documentos devuelve una lista vacía', (done) => {
    commonService.getDocuments.and.returnValue(of({ data: { content: [] } }));
    loadTripManifests(commonService, 4).subscribe((docs) => {
      expect(docs).toEqual([]);
      done();
    });
  });

  it('el redondo admite dos manifiestos y el resto uno', () => {
    expect(maxTripManifests('REDONDO')).toBe(2);
    expect(maxTripManifests('CARGADO')).toBe(1);
    expect(maxTripManifests(null)).toBe(1);
  });

  it('numera a partir del segundo manifiesto', () => {
    expect(manifestLabel(0)).toBe('Manifiesto de Carga');
    expect(manifestLabel(1)).toBe('Manifiesto de Carga 2');
  });

  it('sube con type=trip y el id del viaje', async () => {
    commonService.uploadDocument.and.returnValue(of({ data: 'https://x/m.pdf' }));
    const file = new File(['x'], 'm.pdf');
    const url = await uploadManifestFile(commonService, file, 4);
    expect(url).toBe('https://x/m.pdf');
    expect(commonService.uploadDocument).toHaveBeenCalledWith(file, 'm.pdf', {
      type: 'trip',
      id: 4,
    });
  });

  it('sin URL en la respuesta la subida falla', async () => {
    commonService.uploadDocument.and.returnValue(of({ data: null }));
    await expectAsync(
      uploadManifestFile(commonService, new File(['x'], 'm.pdf'), 4),
    ).toBeRejected();
  });

  it('crea el manifiesto con el tipo del catálogo TRIP y el número del viaje', async () => {
    commonService.getDocumentFileTypes.and.returnValue(
      of({
        data: [
          { id: 3, name: 'Otro', appliesTo: 'TRIP', isActive: true },
          { id: 7, name: 'Manifiesto de Carga', appliesTo: 'TRIP', isActive: true },
        ],
      }),
    );
    await saveTripManifest(commonService, {
      tripId: 4,
      manifestNumber: ' M-123 ',
      fileUrl: 'https://x/m.pdf',
      existing: null,
    });
    expect(commonService.getDocumentFileTypes).toHaveBeenCalledWith('TRIP');
    expect(commonService.saveDocuments).toHaveBeenCalledWith([
      {
        documentFileTypeId: 7,
        tripId: 4,
        documentNumber: 'M-123',
        fileUrl: 'https://x/m.pdf',
      },
    ]);
  });

  it('al actualizar conserva id, tipo y archivo si no llega uno nuevo', async () => {
    await saveTripManifest(commonService, {
      tripId: 4,
      manifestNumber: 'M-2',
      fileUrl: null,
      existing: {
        id: 9,
        documentFileTypeId: 7,
        tripId: 4,
        fileUrl: 'https://x/viejo.pdf',
      },
    });
    expect(commonService.getDocumentFileTypes).not.toHaveBeenCalled();
    expect(commonService.saveDocuments).toHaveBeenCalledWith([
      {
        id: 9,
        documentFileTypeId: 7,
        tripId: 4,
        documentNumber: 'M-2',
        fileUrl: 'https://x/viejo.pdf',
      },
    ]);
  });

  it('rechaza formatos y tamaños que el backend no admite', () => {
    expect(validateManifestFile(new File(['x'], 'm.docx'))).toContain(
      'Formato no permitido',
    );
    const grande = new File([new Uint8Array(6 * 1024 * 1024)], 'm.pdf');
    expect(validateManifestFile(grande)).toContain('5 MB');
    expect(validateManifestFile(new File(['x'], 'm.PDF'))).toBeNull();
  });

  it('nombra el archivo por el último tramo de la URL', () => {
    expect(manifestFileNameOf('https://x/documents/trip/mi%20manifiesto.pdf?v=1')).toBe(
      'mi manifiesto.pdf',
    );
    expect(manifestFileNameOf(null)).toBe('Manifiesto de Carga');
  });
});
