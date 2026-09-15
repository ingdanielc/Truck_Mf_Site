import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { ModelDocumentFile } from '../models/document-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../models/model-filter-table';
import { ModelDriver } from '../models/driver-model';
import { ModelOwner } from '../models/owner-model';
import { VehicleService } from '../services/vehicle.service';
import { DriverService } from '../services/driver.service';
import { OwnerService } from '../services/owner.service';

/** De quién se piden los documentos. Un id nulo no se consulta. */
export interface DocumentHolderIds {
  vehicleId?: number | null;
  driverId?: number | null;
  ownerId?: number | null;
}

/**
 * Documentos vigentes de uno o varios portadores.
 *
 * Cada documento se guarda con un solo portador, pero una persona puede ser
 * propietario y conductor a la vez: sus documentos se reparten entre los dos y
 * tienen que verse juntos desde cualquiera de las dos fichas. Aquí se piden por
 * separado —vehículo, conductor y propietario comparten el endpoint de
 * vehículo— y se juntan sin repetidos.
 *
 * Con dos portadores, que falle uno no deja sin los documentos del otro: su
 * parte llega vacía y el error queda en la consola.
 */
export function loadHolderDocuments(
  vehicleService: VehicleService,
  holders: DocumentHolderIds,
): Observable<ModelDocumentFile[]> {
  const consultas = (
    [
      ['vehicleId', holders.vehicleId],
      ['driverId', holders.driverId],
      ['ownerId', holders.ownerId],
    ] as [string, number | null | undefined][]
  ).filter(([, id]) => id != null);

  if (!consultas.length) return of([]);
  const varios = consultas.length > 1;

  return forkJoin(
    consultas.map(([campo, id]) => {
      const peticion = vehicleService
        .getVehicleDocuments(
          new ModelFilterTable(
            [new Filter(campo, '=', String(id))],
            new Pagination(50, 0),
            new Sort('expiryDate', true),
          ),
        )
        .pipe(
          map((r: any) => (r?.data?.content || []) as ModelDocumentFile[]),
        );
      if (!varios) return peticion;
      return peticion.pipe(
        catchError((err) => {
          console.error(`Error loading documents by ${campo}:`, err);
          return of([] as ModelDocumentFile[]);
        }),
      );
    }),
  ).pipe(
    map((listas) => {
      const vistos = new Set<number>();
      // `isActive` se descarta aquí y no en el filtro: la comparación del
      // backend castea a texto y un booleano no sobrevive ese casteo.
      const vigentes = listas.flat().filter((doc) => {
        if (doc.isActive === false) return false;
        if (doc.id == null) return true;
        if (vistos.has(doc.id)) return false;
        vistos.add(doc.id);
        return true;
      });
      if (!varios) return vigentes;

      // Juntas pierden el orden del servidor: se vuelve a ordenar por
      // vencimiento, y los que no vencen al final.
      return vigentes.sort((a, b) => {
        if (!a.expiryDate) return b.expiryDate ? 1 : 0;
        if (!b.expiryDate) return -1;
        return a.expiryDate.localeCompare(b.expiryDate);
      });
    }),
  );
}

/** Lo que identifica a una persona en las dos tablas. */
interface PersonKeys {
  user?: { id?: number };
  documentNumber?: string;
}

/**
 * ¿Son la misma persona? Mismo usuario o mismo número de documento, que es el
 * criterio con el que el listado de conductores reconoce al propietario que
 * también conduce (`isSameUser`).
 */
function isSamePerson(a: PersonKeys, b: PersonKeys): boolean {
  if (a.user?.id && b.user?.id && a.user.id === b.user.id) return true;
  const docA = String(a.documentNumber || '').replaceAll(/\D/g, '');
  const docB = String(b.documentNumber || '').replaceAll(/\D/g, '');
  return docA !== '' && docA === docB;
}

/**
 * Busca la misma persona en la otra tabla: primero por usuario y, si no hay,
 * por número de documento. Nunca falla: sin coincidencia o con error, devuelve
 * `null`.
 *
 * Lo que devuelve el servidor no se da por bueno: se comprueba que de verdad
 * sea la misma persona. Si un filtro se ignorara —o el backend acotara la
 * consulta al usuario de la sesión—, llegaría otro registro, y los documentos
 * de un propietario acabarían mezclados con los de un conductor ajeno.
 */
function findSamePerson<T extends PersonKeys>(
  person: PersonKeys | null | undefined,
  search: (filter: ModelFilterTable) => Observable<any>,
): Observable<T | null> {
  if (!person) return of(null);

  const buscar = (campo: string, valor: string): Observable<T | null> =>
    search(
      new ModelFilterTable(
        [new Filter(campo, '=', valor)],
        new Pagination(5, 0),
        new Sort('id', true),
      ),
    ).pipe(
      map(
        (r: any) =>
          ((r?.data?.content || []) as T[]).find((candidata) =>
            isSamePerson(person, candidata),
          ) ?? null,
      ),
      catchError(() => of(null)),
    );

  const porUsuario = person.user?.id
    ? buscar('user.id', String(person.user.id))
    : of(null);

  return porUsuario.pipe(
    switchMap((encontrada) =>
      encontrada || !person.documentNumber
        ? of(encontrada)
        : buscar('documentNumber', String(person.documentNumber)),
    ),
  );
}

/**
 * El registro de conductor del propietario que también conduce.
 *
 * Solo si el propietario está marcado como conductor: los documentos de un
 * propietario que no conduce se ven únicamente en su ficha de propietario.
 */
export function findLinkedDriver(
  driverService: DriverService,
  owner: ModelOwner | null | undefined,
): Observable<ModelDriver | null> {
  if (!owner || owner.isDriver !== true) return of(null);
  return findSamePerson<ModelDriver>(owner, (f) =>
    driverService.getDriverFilter(f),
  );
}

/**
 * El registro de propietario del conductor que también es dueño.
 *
 * Solo cuenta el propietario marcado como conductor. Uno que no conduce no se
 * enlaza aunque coincidan usuario o documento: sus documentos no se muestran
 * junto a los de ningún conductor.
 */
export function findLinkedOwner(
  ownerService: OwnerService,
  driver: ModelDriver | null | undefined,
): Observable<ModelOwner | null> {
  return findSamePerson<ModelOwner>(driver, (f) =>
    ownerService.getOwnerFilter(f),
  ).pipe(map((owner) => (owner?.isDriver === true ? owner : null)));
}
