import { convertToParamMap } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { ExpensesComponent } from './expenses.component';
import { ModelVehicle } from 'src/app/models/vehicle-model';

/* ==========================================================================
   El carrusel de gastos pide el parque por páginas. Antes lo pedía entero,
   con tope de 9999, y recortaba y ordenaba en el cliente. Lo que se prueba
   aquí es que el resultado que ve el usuario es el mismo que daba ese
   recorte —mismo orden, mismo total, mismo vehículo seleccionado— y que ya
   no se piden miles de filas, con los tres roles.

   El backend falso de abajo emula lo que ahora se le delega: el filtro de
   estado, el orden y el corte por página. Así las pruebas fallan tanto si se
   rompe el componente como si se le deja de pasar un filtro al servidor.
   ========================================================================== */

interface Peticion {
  endpoint: 'filter' | 'filterVehicleOwner';
  filter: any;
}

function vehiculo(
  id: number,
  plate: string,
  extra: Partial<ModelVehicle> = {},
): ModelVehicle {
  return {
    id,
    plate,
    vehicleBrandId: 1,
    model: 'M',
    year: 2020,
    color: 'Rojo',
    engineNumber: 'E' + id,
    chassisNumber: 'C' + id,
    numberOfAxles: 2,
    status: 'Activo',
    currentDriverId: null,
    ...extra,
  };
}

/** Parque de prueba: 30 activos con placas desordenadas respecto al id, más
 *  dos vendidos, que el servidor tiene que descartar. */
function parqueDePrueba(): ModelVehicle[] {
  const placas = [
    'TZZ001',
    'MAA002',
    'ABB003',
    'QCC004',
    'HDD005',
    'ZEE006',
    'BFF007',
    'LGG008',
    'CHH009',
    'YII010',
    'DJJ011',
    'NKK012',
    'ELL013',
    'XMM014',
    'FNN015',
    'OOO016',
    'GPP017',
    'WQQ018',
    'IRR019',
    'PSS020',
    'JTT021',
    'VUU022',
    'KVV023',
    'RWW024',
    'SXX025',
    'UYY026',
    'AZZ027',
    'BAA028',
    'CBB029',
    'DCC030',
  ];
  const activos = placas.map((placa, i) =>
    vehiculo(100 + i, placa, {
      ownerId: i < 20 ? 7 : 8,
      currentDriverId: i === 0 ? 55 : i === 1 ? 55 : 99,
    }),
  );
  return [
    ...activos,
    vehiculo(900, 'AAA000', { ownerId: 7, status: 'Vendido' }),
    vehiculo(901, 'ZZZ999', { ownerId: 8, status: 'Vendido' }),
  ];
}

/**
 * El servidor: aplica los filtros que el componente envía, ordena y corta.
 *
 * `filterVehicleOwner` consulta la relación vehículo-propietario, y el estado
 * es un campo del vehículo, así que ese endpoint no lo filtra: lo ignora en
 * silencio. Se emula tal cual, porque es lo que hace en producción y es la
 * diferencia que rompe la paginación.
 */
function servir(
  todos: ModelVehicle[],
  filter: any,
  endpoint: Peticion['endpoint'] = 'filter',
): any {
  let filas = [...todos];
  for (const f of filter.filter ?? []) {
    const campo = f.fieldFilter;
    const op = f.compFilter;
    const valor = f.valueFilter;
    if (campo === 'status' && op === '!=') {
      filas = filas.filter((v) => v.status !== valor);
    } else if (campo === 'plate' && op === '<') {
      filas = filas.filter((v) => v.plate < valor);
    } else if (campo === 'owner.id') {
      filas = filas.filter((v) => String(v.ownerId) === valor);
    } else if (campo === 'currentDriverId') {
      filas = filas.filter((v) => String(v.currentDriverId) === valor);
    } else if (campo === 'id' && op === '=') {
      filas = filas.filter((v) => String(v.id) === valor);
    } else {
      throw new Error(`Filtro no emulado: ${campo} ${op} ${valor}`);
    }
  }

  const orden = filter.sort?.orderBy;
  if (orden === 'plate') {
    filas.sort((a, b) => a.plate.localeCompare(b.plate, 'es'));
  } else if (orden === 'id') {
    filas.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  } else {
    throw new Error(`Orden no emulado: ${orden}`);
  }

  const size = filter.pagination?.pageSize ?? filas.length;
  const page = filter.pagination?.currentPage ?? 0;
  return {
    data: {
      content: filas.slice(page * size, page * size + size),
      totalElements: filas.length,
    },
  };
}

/**
 * Lo que cada endpoint sabe aplicar. La relación vehículo-propietario solo
 * conoce sus propios campos: pedirle el estado del vehículo, o que ordene por
 * placa, es un 400. Devuelve el motivo, o `null` si la petición es legítima.
 */
function vocabularioInvalido(peticion: Peticion): string | null {
  if (peticion.endpoint !== 'filterVehicleOwner') return null;
  const filter = peticion.filter;
  if ((filter.filter ?? []).some((f: any) => f.fieldFilter === 'status')) {
    return 'filterVehicleOwner no filtra por estado del vehiculo';
  }
  if (filter.sort?.orderBy !== 'id') {
    return `filterVehicleOwner no ordena por ${filter.sort?.orderBy}`;
  }
  return null;
}

/** El resultado que daba la implementación anterior: todo el parque activo
 *  ordenado por placa en el cliente. Es la referencia de "como antes". */
function comoAntes(todos: ModelVehicle[]): ModelVehicle[] {
  return todos
    .filter((v) => v.status !== 'Vendido')
    .sort((a, b) =>
      a.plate.localeCompare(b.plate, 'es', { sensitivity: 'base' }),
    );
}

describe('ExpensesComponent · parque paginado', () => {
  let peticiones: Peticion[];
  let viajesPedidos: string[];
  let gastosPedidos: any[];
  let parque: ModelVehicle[];
  /** Endpoints que deben fallar, para probar la degradación. */
  let fallar: (p: Peticion) => any | null;
  /** El servidor omite `totalElements`, para probar que la flota se completa
   *  sin ese dato. */
  let sinTotal: boolean;
  /** Peticiones que la API real rechazaría. Se comprueban en cada prueba, así
   *  que ninguna puede pasar por casualidad. */
  let violaciones: string[];

  const USUARIOS: Record<string, any> = {
    ADMINISTRADOR: {
      id: 1,
      userRoles: [{ role: { name: 'Administrador' } }],
    },
    PROPIETARIO: { id: 2, userRoles: [{ role: { name: 'Propietario' } }] },
    CONDUCTOR: { id: 3, userRoles: [{ role: { name: 'Conductor' } }] },
  };

  function pedir(endpoint: Peticion['endpoint'], filter: any): Observable<any> {
    const peticion: Peticion = { endpoint, filter };
    peticiones.push(peticion);

    const invalido = vocabularioInvalido(peticion);
    if (invalido) {
      violaciones.push(invalido);
      return throwError(() => ({ status: 400, message: invalido }));
    }

    const fallo = fallar(peticion);
    if (fallo) return throwError(() => fallo);
    const resp = servir(parque, filter, endpoint);
    if (sinTotal) delete resp.data.totalElements;
    return of(resp);
  }

  function crear(
    rol: keyof typeof USUARIOS,
    queryParams: Record<string, string> = {},
  ): ExpensesComponent {
    const vehicleService: any = {
      getVehicleFilter: (f: any) => pedir('filter', f),
      getVehicleOwnerFilter: (f: any) => pedir('filterVehicleOwner', f),
    };
    const ownerService: any = {
      getOwnerFilter: (f: any) => {
        const porUsuario = (f.filter ?? []).some(
          (x: any) => x.fieldFilter === 'user.id',
        );
        return of(
          porUsuario
            ? { data: { content: [{ id: 7, name: 'Prop' }], totalElements: 1 } }
            : {
                data: {
                  content: [
                    { id: 7, name: 'Juan Perez', documentNumber: '1234567' },
                    {
                      id: 8,
                      name: 'Transportes del Norte',
                      documentNumber: '900123456',
                    },
                  ],
                  totalElements: 2,
                },
              },
        );
      },
    };
    const driverService: any = {
      getDriverFilter: () =>
        of({ data: { content: [{ id: 55, ownerId: 7 }], totalElements: 1 } }),
    };
    const tripService: any = {
      getTripFilter: (f: any) => {
        viajesPedidos.push(JSON.stringify(f.filter));
        return of({ data: { content: [], totalElements: 0 } });
      },
    };
    const expenseService: any = {
      getExpenseFilter: (f: any) => {
        gastosPedidos.push(f);
        return of({ data: { content: [], totalElements: 0 } });
      },
    };
    const commonService: any = {
      getVehicleBrands: () => of({ data: [{ id: 1, name: 'Marca' }] }),
      getCities: () => of({ data: [] }),
    };

    const component = new ExpensesComponent(
      { userData$: of(USUARIOS[rol]), fetchUserData: () => undefined } as any,
      ownerService,
      vehicleService,
      commonService,
      driverService,
      { getPayload: () => null } as any,
      expenseService,
      tripService,
      { showError: () => undefined, showSuccess: () => undefined } as any,
      {
        snapshot: { data: {} },
        queryParamMap: of(convertToParamMap(queryParams)),
      } as any,
      { navigate: () => undefined } as any,
      { refreshNotifications: () => undefined } as any,
      { reportDriverLocation: () => undefined } as any,
    );
    return component;
  }

  /** Las peticiones de parque, sin la del alcance del ranking. */
  function paginasPedidas(): Peticion[] {
    return peticiones.filter(
      (p) =>
        p.filter.pagination.pageSize === 12 &&
        !(p.filter.filter ?? []).some((f: any) => f.compFilter === '<'),
    );
  }

  beforeEach(() => {
    peticiones = [];
    viajesPedidos = [];
    gastosPedidos = [];
    parque = parqueDePrueba();
    fallar = () => null;
    violaciones = [];
    sinTotal = false;
  });

  afterEach(() => {
    expect(violaciones).toEqual([]);
  });

  /* ---- Lo que ve el usuario, por rol -------------------------------- */

  describe('Administrador', () => {
    it('muestra el parque completo, ordenado y contado como antes', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      const esperado = comoAntes(parque);
      expect(c.totalVehicles).toBe(esperado.length);
      expect(c.totalVehicles).toBe(30);
      expect(c.selectedVehicle?.plate).toBe(esperado[0].plate);
      expect(c.visibleVehicles.map((v) => v.plate)).toEqual(
        esperado.slice(0, c.visibleCount).map((v) => v.plate),
      );
      expect(c.loadingVehicles).toBeFalse();
    });

    it('sin propietario elegido pagina de verdad por el endpoint llano', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      expect(peticiones[0].endpoint).toBe('filter');
      expect(peticiones[0].filter.pagination.pageSize).toBe(12);
      expect(peticiones[0].filter.sort.orderBy).toBe('plate');
      /* Las páginas del carrusel, todas por el llano. El alcance del ranking
         sí va por la relación, que es por donde se llega a `owner.id`. */
      expect(paginasPedidas().every((p) => p.endpoint === 'filter')).toBeTrue();
      expect(paginasPedidas().length).toBeGreaterThan(0);
    });

    it('el alcance del ranking no hereda el orden del parque', () => {
      /* Regresión: el administrador sin propietario pagina el endpoint llano
         ordenando por placa, y el alcance del ranking va por la relación, que
         no ordena por placa. Al construir esa petición con el orden del
         parque vigente salía un 400. */
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      const porRelacion = peticiones.filter(
        (p) => p.endpoint === 'filterVehicleOwner',
      );
      expect(porRelacion.length).toBeGreaterThan(0);
      for (const p of porRelacion) {
        expect(p.filter.sort.orderBy).toBe('id');
      }
      const llanas = peticiones.filter((p) => p.endpoint === 'filter');
      expect(llanas.every((p) => p.filter.sort.orderBy === 'plate')).toBeTrue();
      expect(c.selectedVehicle).toBeTruthy();
    });

    it('cada endpoint recibe solo el filtro que sabe aplicar', () => {
      /* El endpoint llano descarta los vendidos, así que se le pide. La
         relación no puede, así que enviárselo solo engañaría al que lea el
         código: se descarta en el cliente. */
      const conRelacion = crear('PROPIETARIO');
      conRelacion.ngOnInit();
      const llano = crear('ADMINISTRADOR');
      llano.ngOnInit();

      for (const p of peticiones) {
        const pideEstado = (p.filter.filter ?? []).some(
          (f: any) => f.fieldFilter === 'status',
        );
        expect(pideEstado).toBe(p.endpoint === 'filter');
        expect(p.filter.pagination.pageSize).toBeLessThanOrEqual(200);
      }
    });

    it('acota el parque al propietario elegido en el buscador', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      peticiones = [];

      c.onOwnerChange('8');

      expect(c.totalVehicles).toBe(
        comoAntes(parque).filter((v) => v.ownerId === 8).length,
      );
      expect(c.selectedVehicle?.ownerId).toBe(8);
      expect(
        peticiones.every((p) =>
          (p.filter.filter ?? []).some(
            (f: any) => f.fieldFilter === 'owner.id' && f.valueFilter === '8',
          ),
        ),
      ).toBeTrue();
    });
  });

  describe('Propietario', () => {
    it('ve solo su flota, y su propietario se busca con una sola fila', () => {
      const c = crear('PROPIETARIO');
      c.ngOnInit();

      const suyos = comoAntes(parque).filter((v) => v.ownerId === 7);
      expect(c.totalVehicles).toBe(suyos.length);
      expect(c.selectedVehicle?.plate).toBe(suyos[0].plate);
      expect(
        peticiones.every((p) =>
          (p.filter.filter ?? []).some(
            (f: any) => f.fieldFilter === 'owner.id' && f.valueFilter === '7',
          ),
        ),
      ).toBeTrue();
    });
  });

  describe('Conductor', () => {
    it('ve solo los vehículos que tiene asignados', () => {
      const c = crear('CONDUCTOR');
      c.ngOnInit();

      const suyos = comoAntes(parque).filter((v) => v.currentDriverId === 55);
      expect(c.totalVehicles).toBe(suyos.length);
      expect(c.totalVehicles).toBe(2);
      expect(c.selectedVehicle?.plate).toBe(suyos[0].plate);
      expect(peticiones[0].endpoint).toBe('filter');
    });
  });

  /* ---- Coste de entrar a la vista ----------------------------------- */

  describe('Rendimiento', () => {
    it('con un parque de miles sigue trayendo decenas de filas', () => {
      /* El caso que motivó el cambio: administrador que entra sin haber
         elegido propietario. Antes se traía el parque entero. */
      parque = Array.from({ length: 3000 }, (_, i) =>
        vehiculo(1000 + i, 'P' + String(i).padStart(5, '0'), {
          ownerId: (i % 40) + 1,
          currentDriverId: null,
        }),
      );

      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      const filas = peticiones.reduce(
        (total, p) => total + servir(parque, p.filter).data.content.length,
        0,
      );
      expect(c.totalVehicles).toBe(3000);
      expect(filas).toBeLessThanOrEqual(80);
      expect(peticiones.length).toBeLessThanOrEqual(4);
    });

    it('recorrer el parque entero no lo trae entero', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      c.visibleCount = 1;
      while (c.canNext) c.next();

      const filas = peticiones.reduce(
        (total, p) => total + servir(parque, p.filter).data.content.length,
        0,
      );
      /* Recorrido completo: las tres páginas del parque y nada repetido. */
      expect(paginasPedidas().length).toBe(3);
      expect(filas).toBeLessThanOrEqual(30 + 50);
      expect(c.totalVehicles).toBe(30);
    });

    it('la flota que cabe en el buffer no se vuelve a pedir para el ranking', () => {
      const c = crear('CONDUCTOR');
      c.ngOnInit();

      expect(peticiones.length).toBe(1);
      expect(gastosPedidos.length).toBe(1);
    });

    it('avanzar no repite páginas ya traídas', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      c.visibleCount = 3;
      const antes = paginasPedidas().length;

      for (let i = 0; i < 9; i++) c.next();
      const tras9 = paginasPedidas().length;
      for (let i = 0; i < 9; i++) c.prev();

      expect(c.carouselIndex).toBe(0);
      expect(paginasPedidas().length).toBe(tras9);
      expect(tras9).toBeGreaterThanOrEqual(antes);
      const paginas = paginasPedidas().map(
        (p) => p.filter.pagination.currentPage,
      );
      expect(new Set(paginas).size).toBe(paginas.length);
    });
  });

  /* ---- El carrusel se comporta igual -------------------------------- */

  describe('Carrusel', () => {
    it('recorre el parque completo en el mismo orden que antes', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      c.visibleCount = 1;

      const recorrido: string[] = [];
      recorrido.push(c.visibleVehicles[0].plate);
      while (c.canNext) {
        c.next();
        recorrido.push(c.visibleVehicles[0]?.plate);
      }

      expect(recorrido).toEqual(comoAntes(parque).map((v) => v.plate));
    });

    it('los topes de navegación y los puntos siguen la fórmula de antes', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      c.visibleCount = 3;

      expect(c.totalDots).toBe(30 - 3 + 1);
      expect(c.canPrev).toBeFalse();
      expect(c.canNext).toBeTrue();
      while (c.canNext) c.next();
      expect(c.carouselIndex).toBe(27);
      expect(c.canNext).toBeFalse();
    });

    it('saltar a un punto de otra página selecciona ese vehículo', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      c.goToVehicle(25);

      expect(c.carouselIndex).toBe(Math.min(25, 30 - c.visibleCount));
      expect(c.selectedVehicle?.plate).toBe(comoAntes(parque)[25].plate);
      expect(viajesPedidos.pop()).toContain(String(comoAntes(parque)[25].id));
    });

    it('al estrechar la ventana el índice no se sale del parque', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      c.visibleCount = 3;
      while (c.canNext) c.next();
      const alFinal = c.carouselIndex;

      c.onResize();

      expect(c.carouselIndex).toBeLessThanOrEqual(
        Math.max(0, c.totalVehicles - c.visibleCount),
      );
      expect(c.carouselIndex).toBeGreaterThanOrEqual(
        Math.min(alFinal, c.totalVehicles - c.visibleCount),
      );
    });
  });

  /* ---- Vehículo que llega por la URL -------------------------------- */

  describe('Vehículo en la URL', () => {
    it('selecciona ese vehículo y carga sus viajes, no los de otro', () => {
      const objetivo = comoAntes(parque)[17];
      const c = crear('ADMINISTRADOR', { vehicleId: String(objetivo.id) });
      c.ngOnInit();

      expect(c.selectedVehicle?.id).toBe(objetivo.id);
      expect(viajesPedidos.length).toBe(1);
      expect(viajesPedidos[0]).toContain(String(objetivo.id));
    });

    it('arranca el carrusel en la posición global de ese vehículo', () => {
      const objetivo = comoAntes(parque)[17];
      const c = crear('ADMINISTRADOR', { vehicleId: String(objetivo.id) });
      c.ngOnInit();

      expect(c.carouselIndex).toBe(17);
      expect(c.visibleVehicles[0].plate).toBe(objetivo.plate);
    });

    it('respeta el parque del rol: el conductor solo ve el suyo', () => {
      const objetivo = comoAntes(parque).filter(
        (v) => v.currentDriverId === 55,
      )[1];
      const c = crear('CONDUCTOR', { vehicleId: String(objetivo.id) });
      c.ngOnInit();

      expect(c.totalVehicles).toBe(2);
      expect(c.selectedVehicle?.id).toBe(objetivo.id);
      expect(c.carouselIndex).toBe(1);
    });
  });

  /* ---- Degradación cuando la API no acompaña ------------------------ */

  describe('Degradación', () => {
    it('si el servidor no ordena por placa, reintenta por id y sigue sirviendo', () => {
      fallar = (p) =>
        p.filter.sort.orderBy === 'plate' ? { status: 400 } : null;

      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      expect(c.loadingVehicles).toBeFalse();
      expect(c.totalVehicles).toBe(30);
      const porId = comoAntes(parque).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      expect(c.selectedVehicle?.id).toBe(porId[0].id);
      expect(
        peticiones.filter((p) => p.filter.sort.orderBy === 'id').length,
      ).toBeGreaterThan(0);
    });

    it('un fallo de red no degrada el orden y deja de cargar', () => {
      fallar = () => ({ status: 0 });

      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      expect(c.loadingVehicles).toBeFalse();
      expect(c.totalVehicles).toBe(0);
      expect(
        peticiones.every((p) => p.filter.sort.orderBy === 'plate'),
      ).toBeTrue();
    });

    it('si no se puede situar el vehículo de la URL, arranca al principio y lo selecciona igual', () => {
      const objetivo = comoAntes(parque)[17];
      fallar = (p) =>
        (p.filter.filter ?? []).some((f: any) => f.compFilter === '<')
          ? { status: 400 }
          : null;

      const c = crear('ADMINISTRADOR', { vehicleId: String(objetivo.id) });
      c.ngOnInit();

      expect(c.selectedVehicle?.id).toBe(objetivo.id);
      expect(c.carouselIndex).toBe(0);
      expect(c.totalVehicles).toBe(30);
    });
  });

  /* ---- Buscador de propietarios ------------------------------------- */

  describe('Buscador de propietarios', () => {
    it('cada fila lleva el documento, como en conductores y vehículos', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      expect(c.ownerOptions.map((o) => o.name)).toEqual([
        'Juan Perez - 1.234.567',
        'Transportes del Norte - 900.123.456',
      ]);
    });

    it('los demás roles no cargan la lista, que no la usan', () => {
      for (const rol of ['PROPIETARIO', 'CONDUCTOR']) {
        violaciones = [];
        const c = crear(rol as any);
        c.ngOnInit();
        expect(c.ownerOptions).withContext(rol).toEqual([]);
      }
    });
  });

  /* ---- Ningún rol puede perder vehículos ---------------------------- */

  describe('Integridad del parque', () => {
    it('degradar el orden a media carga no repite ni se salta vehículos', () => {
      /* La primera página sale por placa; la siguiente falla con 400 y el
         componente degrada a `id`. Las posiciones ya cargadas pertenecen al
         otro orden, así que hay que tirarlas. */
      let fallos = 0;
      fallar = (p) => {
        const paginaSiguiente = p.filter.pagination.currentPage === 1;
        if (paginaSiguiente && p.filter.sort.orderBy === 'plate' && !fallos) {
          fallos++;
          return { status: 400 };
        }
        return null;
      };

      const c = crear('ADMINISTRADOR');
      c.ngOnInit();
      c.visibleCount = 1;

      const recorrido: string[] = [];
      recorrido.push(c.visibleVehicles[0].plate);
      while (c.canNext) {
        c.next();
        const visto = c.visibleVehicles[0]?.plate;
        if (visto) recorrido.push(visto);
      }

      expect(c.totalVehicles).toBe(30);
      expect(recorrido.length).toBe(30);
      expect(new Set(recorrido).size).toBe(30);
      const porId = comoAntes(parque)
        .slice()
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      expect(recorrido).toEqual(porId.map((v) => v.plate));
    });

    it('la flota se completa aunque el servidor no informe el total', () => {
      /* 450 vehículos de un propietario, en tandas de 200, y sin
         `totalElements`. Cortar por el total habría dejado 200. */
      parque = Array.from({ length: 450 }, (_, i) =>
        vehiculo(2000 + i, 'F' + String(i).padStart(5, '0'), { ownerId: 7 }),
      );
      sinTotal = true;

      const c = crear('PROPIETARIO');
      c.ngOnInit();

      expect(c.totalVehicles).toBe(450);
      expect(c.selectedVehicle?.plate).toBe('F00000');
    });

    it('un vehículo repetido por la relación no desplaza al resto', () => {
      const duplicado = parque[3];
      parque = [...parque, { ...duplicado }];

      const c = crear('PROPIETARIO');
      c.ngOnInit();
      c.visibleCount = 1;

      const recorrido: string[] = [c.visibleVehicles[0].plate];
      while (c.canNext) {
        c.next();
        const visto = c.visibleVehicles[0]?.plate;
        if (visto) recorrido.push(visto);
      }

      const suyos = comoAntes(parque).filter((v) => v.ownerId === 7);
      expect(new Set(recorrido).size).toBe(recorrido.length);
      expect(recorrido).toEqual([...new Set(suyos.map((v) => v.plate))]);
    });

    it('cada rol sigue viendo su parque completo de punta a punta', () => {
      const esperado: Record<string, ModelVehicle[]> = {
        ADMINISTRADOR: comoAntes(parque),
        PROPIETARIO: comoAntes(parque).filter((v) => v.ownerId === 7),
        CONDUCTOR: comoAntes(parque).filter((v) => v.currentDriverId === 55),
      };

      for (const rol of Object.keys(esperado)) {
        peticiones = [];
        violaciones = [];
        const c = crear(rol as any);
        c.ngOnInit();
        c.visibleCount = 1;

        const recorrido: string[] = [c.visibleVehicles[0].plate];
        while (c.canNext) {
          c.next();
          const visto = c.visibleVehicles[0]?.plate;
          if (visto) recorrido.push(visto);
        }

        expect(recorrido)
          .withContext(rol)
          .toEqual(esperado[rol].map((v) => v.plate));
        expect(c.totalVehicles).withContext(rol).toBe(esperado[rol].length);
      }
    });

    it('el viaje se carga siempre para el vehículo que queda seleccionado', () => {
      for (const rol of ['ADMINISTRADOR', 'PROPIETARIO', 'CONDUCTOR']) {
        viajesPedidos = [];
        violaciones = [];
        const c = crear(rol as any);
        c.ngOnInit();

        expect(c.selectedVehicle).withContext(rol).toBeTruthy();
        expect(viajesPedidos.length).withContext(rol).toBe(1);
        expect(viajesPedidos[0])
          .withContext(rol)
          .toContain(String(c.selectedVehicle!.id));
      }
    });
  });

  /* ---- Accesos rápidos de categorías -------------------------------- */

  describe('Accesos rápidos', () => {
    it('el ranking se pide una vez por alcance, con tope de vehículos', () => {
      const c = crear('PROPIETARIO');
      c.ngOnInit();
      const pedidos = gastosPedidos.length;

      c.selectVehicle(c.visibleVehicles[0]);

      expect(gastosPedidos.length).toBe(pedidos);
      expect(gastosPedidos[0].pagination.pageSize).toBe(300);
      const ids = gastosPedidos[0].filter
        .find((f: any) => f.fieldFilter === 'vehicleId')
        .valueFilter.split(',');
      expect(ids.length).toBeLessThanOrEqual(50);
      expect(ids.length).toBe(20);
    });

    it('el administrador sin propietario elegido lo acota al del vehículo', () => {
      const c = crear('ADMINISTRADOR');
      c.ngOnInit();

      const ids = gastosPedidos[0].filter
        .find((f: any) => f.fieldFilter === 'vehicleId')
        .valueFilter.split(',')
        .map(Number);
      const duenoDelSeleccionado = c.selectedVehicle?.ownerId;
      const suyos = comoAntes(parque).filter(
        (v) => v.ownerId === duenoDelSeleccionado,
      );
      expect(ids.length).toBeLessThanOrEqual(50);
      expect(ids.sort()).toEqual(suyos.map((v) => v.id).sort());
    });
  });
});
