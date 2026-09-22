import { firstValueFrom, of } from 'rxjs';
import {
  findLinkedDriver,
  findLinkedOwner,
  loadHolderDocuments,
} from './holder-documents';

/* ==========================================================================
   Los documentos de un propietario solo se juntan con los de un conductor
   cuando son la misma persona y el propietario conduce. Si no, cada uno se
   ve solo en su ficha.
   ========================================================================== */

/** Respuesta de un filtro con estos registros. */
const pagina = (content: any[]) => of({ data: { content } });

describe('holder-documents · propietario y conductor', () => {
  describe('findLinkedDriver', () => {
    it('un propietario que no conduce no busca conductor', async () => {
      const driverService = jasmine.createSpyObj('DriverService', [
        'getDriverFilter',
      ]);

      const resultado = await firstValueFrom(
        findLinkedDriver(driverService, {
          id: 1,
          isDriver: false,
          user: { id: 10 },
        }),
      );

      expect(resultado).toBeNull();
      expect(driverService.getDriverFilter).not.toHaveBeenCalled();
    });

    it('sin la marca de conductor tampoco busca', async () => {
      const driverService = jasmine.createSpyObj('DriverService', [
        'getDriverFilter',
      ]);

      const resultado = await firstValueFrom(
        findLinkedDriver(driverService, { id: 1, user: { id: 10 } }),
      );

      expect(resultado).toBeNull();
      expect(driverService.getDriverFilter).not.toHaveBeenCalled();
    });

    it('el propietario que conduce encuentra su registro de conductor', async () => {
      const driverService = {
        getDriverFilter: () => pagina([{ id: 7, user: { id: 10 } }]),
      } as any;

      const resultado = await firstValueFrom(
        findLinkedDriver(driverService, {
          id: 1,
          isDriver: true,
          user: { id: 10 },
        }),
      );

      expect(resultado?.id).toBe(7);
    });
  });

  describe('findLinkedOwner', () => {
    it('no enlaza un propietario que no conduce, aunque sea la misma persona', async () => {
      const ownerService = {
        getOwnerFilter: () =>
          pagina([{ id: 1, isDriver: false, user: { id: 10 } }]),
      } as any;

      const resultado = await firstValueFrom(
        findLinkedOwner(ownerService, { id: 7, user: { id: 10 } }),
      );

      expect(resultado).toBeNull();
    });

    it('descarta lo que devuelva el servidor si no es la misma persona', async () => {
      /* Un filtro ignorado —o acotado a la sesión— devuelve otro propietario. */
      const ownerService = {
        getOwnerFilter: () =>
          pagina([
            {
              id: 1,
              isDriver: true,
              user: { id: 99 },
              documentNumber: '111',
            },
          ]),
      } as any;

      const resultado = await firstValueFrom(
        findLinkedOwner(ownerService, {
          id: 7,
          user: { id: 10 },
          documentNumber: '222',
        }),
      );

      expect(resultado).toBeNull();
    });

    it('enlaza al propietario que conduce y es la misma persona', async () => {
      const ownerService = {
        getOwnerFilter: () =>
          pagina([{ id: 1, isDriver: true, user: { id: 10 } }]),
      } as any;

      const resultado = await firstValueFrom(
        findLinkedOwner(ownerService, { id: 7, user: { id: 10 } }),
      );

      expect(resultado?.id).toBe(1);
    });

    it('reconoce a la misma persona por número de documento', async () => {
      const ownerService = {
        getOwnerFilter: () =>
          pagina([{ id: 1, isDriver: true, documentNumber: '1.020.304' }]),
      } as any;

      const resultado = await firstValueFrom(
        findLinkedOwner(ownerService, { id: 7, documentNumber: '1020304' }),
      );

      expect(resultado?.id).toBe(1);
    });
  });

  describe('loadHolderDocuments', () => {
    it('un conductor sin propietario enlazado solo pide sus documentos', async () => {
      const commonService = jasmine.createSpyObj('CommonService', [
        'getDocuments',
      ]);
      commonService.getDocuments.and.returnValue(pagina([]));

      await firstValueFrom(
        loadHolderDocuments(commonService, { driverId: 7, ownerId: null }),
      );

      expect(commonService.getDocuments).toHaveBeenCalledTimes(1);
      const filtro = commonService.getDocuments.calls.argsFor(0)[0];
      expect(JSON.stringify(filtro)).toContain('driverId');
      expect(JSON.stringify(filtro)).not.toContain('ownerId');
    });

    it('con los dos portadores junta sus documentos sin repetir', async () => {
      const commonService = jasmine.createSpyObj('CommonService', [
        'getDocuments',
      ]);
      commonService.getDocuments.and.returnValues(
        pagina([{ id: 1, documentFileTypeId: 1, driverId: 7 }]),
        pagina([
          { id: 1, documentFileTypeId: 1, driverId: 7 },
          { id: 2, documentFileTypeId: 2, ownerId: 3 },
        ]),
      );

      const documentos = await firstValueFrom(
        loadHolderDocuments(commonService, { driverId: 7, ownerId: 3 }),
      );

      expect(documentos.map((d) => d.id).sort()).toEqual([1, 2]);
    });
  });
});
