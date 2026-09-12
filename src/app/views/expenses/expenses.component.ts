import {
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Observable,
  Subscription,
  catchError,
  map,
  of,
  switchMap,
  take,
} from 'rxjs';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { VehicleService } from 'src/app/services/vehicle.service';
import { ToastService } from 'src/app/services/toast.service';
import { CommonService } from 'src/app/services/common.service';
import { DriverService } from 'src/app/services/driver.service';
import { TokenService } from 'src/app/services/token.service';
import { GVehicleGoodCardComponent } from 'src/app/components/g-vehicle-good-card/g-vehicle-good-card.component';
import {
  ExpenseShortcutEvent,
  GExpensesTripComponent,
} from 'src/app/components/g-expenses-trip/g-expenses-trip.component';
import { ModelVehicle } from 'src/app/models/vehicle-model';
import { ModelExpense } from 'src/app/models/expense-model';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { GAddExpenseComponent } from 'src/app/components/g-add-expense/g-add-expense.component';
import { TripService } from 'src/app/services/trip.service';
import { ModelTrip } from 'src/app/models/trip-model';
import { GTripMiniCardComponent } from 'src/app/components/g-trip-mini-card/g-trip-mini-card.component';
import { GVehicleTripCardComponent } from 'src/app/components/g-vehicle-trip-card/g-vehicle-trip-card.component';
import { NotificationsService } from 'src/app/services/notifications.service';
import { LocationService } from 'src/app/services/location.service';
import { PaginationUtils } from 'src/app/utils/pagination-utils';
import {
  ExpenseShortcut,
  buildExpenseShortcuts,
} from 'src/app/utils/expense-shortcuts';
import { PlatePipe } from '../../pipes/plate.pipe';
import { isCancelledTrip } from 'src/app/utils/trip-status';
import {
  ComboOption,
  GSearchComboboxComponent,
} from 'src/app/components/g-search-combobox/g-search-combobox.component';
import { ownerComboOptions } from 'src/app/utils/owner-options';

/**
 * El parque de vehículos que le corresponde al usuario: con qué se filtra y
 * por qué endpoint se pide. Se resuelve una sola vez a partir del rol, y de
 * ahí en adelante lo único que cambia entre peticiones es la página.
 */
interface VehicleQuery {
  filters: Filter[];
  /**
   * La consulta va por `filterVehicleOwner`, que es la única vía hasta
   * `owner.id`. Ese endpoint consulta la relación vehículo-propietario y solo
   * conoce los campos de la relación: no filtra por el estado del vehículo ni
   * ordena por placa. De ahí salen las dos consecuencias, y por eso son un
   * solo campo y no dos banderas que puedan discrepar: esos parques se traen
   * completos y se filtran y ordenan aquí.
   *
   * `withOwner: false` va por el endpoint llano, que sabe hacer las dos
   * cosas, y entonces el parque se pagina de verdad: el total que informa y
   * el corte de cada página hablan de la misma lista que se pinta.
   */
  withOwner: boolean;
}

@Component({
  selector: 'app-expenses',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    GSearchComboboxComponent,
    GVehicleGoodCardComponent,
    GExpensesTripComponent,
    GAddExpenseComponent,
    GTripMiniCardComponent,
    GVehicleTripCardComponent,
    PlatePipe,
  ],
  templateUrl: './expenses.component.html',
  styleUrls: ['./expenses.component.scss'],
})
export class ExpensesComponent implements OnInit, OnDestroy {
  @ViewChild(GExpensesTripComponent)
  expensesTripComponent?: GExpensesTripComponent;
  /* -- Parque paginado ----------------------------------------------------
     El carrusel muestra uno o tres vehículos a la vez, así que la lista
     completa nunca hace falta: se pide por páginas y solo se guarda lo que
     se ha llegado a mostrar. `totalVehicles` es el tamaño del parque, que es
     lo que cuentan el badge y los puntos; el buffer es lo que se puede
     pintar. */

  /** Vehículos por petición. Cuatro ventanas de escritorio por página. */
  private static readonly VEHICLE_PAGE_SIZE = 12;

  /** Vehículos por tanda al traer una flota entera. Las flotas reales caben
   *  en una, y si no, se pide la siguiente en vez de subir el tope. */
  private static readonly FLEET_PAGE_SIZE = 200;

  /** Tope de tandas de una flota. Solo salta si el servidor ignorara la
   *  paginación; con `FLEET_PAGE_SIZE` cubre cinco mil vehículos. */
  private static readonly FLEET_MAX_PAGES = 25;

  /** Tope de vehículos del alcance del ranking cuando hay que pedirlo. */
  private static readonly SHORTCUTS_VEHICLE_CAP = 50;

  /** Posición global en el parque -> vehículo ya traído. */
  private readonly vehicleBuffer = new Map<number, ModelVehicle>();

  /** Páginas ya pedidas, para no repetirlas al ir y venir por el carrusel. */
  private readonly requestedPages = new Set<number>();

  /** Tamaño del parque según el servidor, no de lo que hay cargado. */
  totalVehicles = 0;

  /** El total ya lo dijo el servidor. Mientras no lo haya dicho, un cero no
   *  significa parque vacío y no sirve para descartar páginas. */
  private totalKnown = false;

  /** El parque vigente. Lo fija el rol y solo cambia cuando el
   *  administrador elige otro propietario. */
  private vehicleQuery: VehicleQuery | null = null;

  /** El orden por placa lo hace el servidor: paginar y reordenar después
   *  solo ordena dentro de cada página. Si la API no admitiera ese campo de
   *  orden, se degrada a `id` una vez y la vista sigue sirviendo con el
   *  parque en otro orden. Ver `vehicleSort` y `onVehiclePageError`. */
  private plateSortRejected = false;

  /** Posición que se pidió desde los puntos y cuya página aún viaja. La
   *  selección la hace la respuesta al llegar. */
  private pendingSelectIndex: number | null = null;

  selectedVehicle: ModelVehicle | null = null;
  selectedTrip: ModelTrip | null = null;
  showAddExpense = false;
  editingExpense: ModelExpense | null = null;
  preselectedExpenseTypeId: number | null = null;
  preselectedCategoryId: number | null = null;
  preselectedCategoryName: string = '';
  /** Categorías más usadas por tipo de gasto, para los accesos rápidos */
  expenseShortcuts: Record<number, ExpenseShortcut[]> = this.buildShortcuts([]);
  /** Meses de historial que alimentan el ranking de categorías */
  private readonly SHORTCUTS_HISTORY_MONTHS = 6;
  /** Vehículos con los que se calculó el ranking vigente */
  private shortcutsScope = '';
  loadingVehicles = true;
  hideSelectionSections = false;
  isMaintenance = false;
  userRole = '';
  /** La lista se rellena al cargar, así que las filas del buscador se rehacen
   *  aquí. Ver `ownerComboOptions`.
   *
   *  Con el documento, igual que las listas de conductores y vehículos: en el
   *  panel hay propietarios que se llaman parecido y el número es lo único
   *  que los separa. */
  set owners(value: any[]) {
    this.listaOwners = value ?? [];
    this.ownerOptions = ownerComboOptions(this.listaOwners, true);
  }
  get owners(): any[] {
    return this.listaOwners;
  }
  private listaOwners: any[] = [];
  ownerOptions: ComboOption[] = [];
  selectedOwnerId: number | null = null;
  hasBackContext = false;
  tripIdParam: string | null = null;
  vehicleIdParam: string | null = null;
  originParam: string | null = null;

  brands: any[] = [];
  loadingBrands = false;

  carouselIndex = 0;
  visibleCount = 1;

  recentTrips: ModelTrip[] = [];
  cities: any[] = [];
  loadingTrips = false;
  isSavingExpense: boolean = false;
  maxVisibleDots = 10;

  private userSub?: Subscription;

  constructor(
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly commonService: CommonService,
    private readonly driverService: DriverService,
    private readonly tokenService: TokenService,
    private readonly expenseService: ExpenseService,
    private readonly tripService: TripService,
    private readonly toastService: ToastService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly notificationsService: NotificationsService,
    private readonly locationService: LocationService,
  ) {}

  ngOnInit(): void {
    this.updateVisibleCount();
    this.loadBrands();
    this.loadCities();

    this.isMaintenance = this.route.snapshot.data['isMaintenance'] === true;

    this.route.queryParamMap.subscribe((params) => {
      const tripId = params.get('tripId');
      const vehicleIdInput = params.get('vehicleId');
      this.tripIdParam = tripId;
      this.vehicleIdParam = vehicleIdInput;
      this.originParam = params.get('origin');
      this.hasBackContext = !!tripId || !!vehicleIdInput;
      const vehicleId = vehicleIdInput ? Number(vehicleIdInput) : null;

      // Reset state for new params
      this.selectedVehicle = null;
      this.selectedTrip = null;
      this.hideSelectionSections = !!tripId; // Only hide if we have a focused trip

      this.userSub = this.securityService.userData$.subscribe((user) => {
        if (!user) {
          const payload = this.tokenService.getPayload();
          const userId = payload?.nameid ?? payload?.id ?? payload?.sub;
          if (userId) {
            this.securityService.fetchUserData(userId);
          }
          return;
        }

        const roles = (user.userRoles || []).map((ur: any) =>
          (ur.role?.name || '').toUpperCase(),
        );

        // Prioritize roles for UI context: ADMIN > PROPIETARIO > CONDUCTOR
        if (roles.includes('ADMINISTRADOR')) {
          this.userRole = 'ADMINISTRADOR';
        } else if (roles.includes('PROPIETARIO')) {
          this.userRole = 'PROPIETARIO';
        } else if (roles.includes('CONDUCTOR')) {
          this.userRole = 'CONDUCTOR';
        } else {
          this.userRole = roles[0] || '';
        }

        if (this.userRole === 'ADMINISTRADOR') {
          this.loadOwners();
        }

        /* 1. El parque del usuario, por páginas. Cuando viene un vehículo en
              la URL se carga primero ese vehículo: es el que se selecciona y
              el que dice en qué página tiene que arrancar el carrusel. Antes
              las dos cargas iban en paralelo y se pisaban, de modo que si el
              vehículo de la URL no caía en la lista se acababan mostrando los
              viajes de otro. */
        if (vehicleId) {
          this.loadVehicleById(vehicleId).subscribe((vehicle) => {
            if (vehicle) {
              this.selectedVehicle = vehicle;
              this.mapBrandNames();
            }
            this.loadVehiclesForUser(user, vehicle);
          });
        } else {
          this.loadVehiclesForUser(user, null);
        }

        // 2. If it's a focused trip view, perform additional validation and loading
        if (tripId && vehicleIdInput) {
          this.validateAccess(tripId, vehicleIdInput, user).subscribe({
            next: (hasAccess: boolean) => {
              if (!hasAccess) {
                this.toastService.showError(
                  'Acceso denegado',
                  'No tienes permiso para ver los gastos de este vehículo.',
                );
                this.router.navigate(['/site/expenses']);
                return;
              }

              this.selectedTrip = { id: Number(tripId) } as ModelTrip;

              // Load the full trip data
              const tripFilter = new ModelFilterTable(
                [new Filter('id', '=', tripId)],
                new Pagination(1, 0),
                new Sort('id', true),
              );
              this.tripService.getTripFilter(tripFilter).subscribe({
                next: (resp: any) => {
                  if (resp?.data?.content?.length > 0)
                    this.selectedTrip = resp.data.content[0];
                },
              });
            },
            error: () => {
              this.toastService.showError(
                'Error',
                'No se pudo verificar el acceso al vehículo.',
              );
              this.router.navigate(['/expenses']);
            },
          });
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateVisibleCount();
    // Clamp index so it doesn't go out of bounds after resize
    this.clampCarouselIndex();
    this.ensureWindowLoaded();
  }

  private updateVisibleCount(): void {
    this.visibleCount = window.innerWidth >= 768 ? 3 : 1;
  }

  // ── Authorization ─────────────────────────────────────────────────

  /**
   * Returns true if the current user is allowed to view the given vehicle and trip.
   * - Admin: always allowed.
   * - Propietario: vehicle must belong to owner, and trip must belong to vehicle.
   * - Conductor: vehicle must have this driver assigned, and trip must belong to vehicle.
   */
  private validateAccess(
    tripId: string,
    vehicleId: string,
    user: any,
  ): Observable<boolean> {
    const roles = new Set(
      (user.userRoles || []).map((ur: any) =>
        (ur.role?.name || '').toUpperCase(),
      ),
    );
    const isOwner = roles.has('PROPIETARIO');
    const isDriver = roles.has('CONDUCTOR');

    // Administrador – unrestricted
    if (!isOwner && !isDriver) {
      return of(true);
    }

    if (isOwner) {
      // 1. Validate Owner -> Vehicle
      const ownerFilter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      return this.ownerService.getOwnerFilter(ownerFilter).pipe(
        switchMap((ownerResp: any) => {
          const owner = ownerResp?.data?.content?.[0];
          if (!owner?.id) return of(false);

          const vehicleFilter = new ModelFilterTable(
            [
              new Filter('owner.id', '=', owner.id.toString()),
              new Filter('vehicleId', '=', vehicleId),
            ],
            new Pagination(1, 0),
            new Sort('id', true),
          );
          return this.vehicleService.getVehicleOwnerFilter(vehicleFilter).pipe(
            switchMap((vResp: any) => {
              if (vResp?.data?.content?.length === 0) return of(false);

              if (this.isMaintenance) return of(true);

              // 2. Validate Vehicle -> Trip
              const tripFilter = new ModelFilterTable(
                [
                  new Filter('id', '=', tripId),
                  new Filter('vehicleId', '=', vehicleId),
                ],
                new Pagination(1, 0),
                new Sort('id', true),
              );
              return this.tripService
                .getTripFilter(tripFilter)
                .pipe(
                  map((tResp: any) => (tResp?.data?.content?.length ?? 0) > 0),
                );
            }),
          );
        }),
      );
    }

    // CONDUCTOR – currentDriverId must match, and trip must belong to vehicle
    // Note: If user is both owner and driver, we already checked owner access above.
    // If they got here, isOwner was false or they didn't have owner access to this specific vehicle.
    const driverFilter = new ModelFilterTable(
      [new Filter('user.id', '=', user.id.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    return this.driverService.getDriverFilter(driverFilter).pipe(
      switchMap((driverResp: any) => {
        const driver = driverResp?.data?.content?.[0];
        if (!driver?.id) return of(false);

        const vehicleFilter = new ModelFilterTable(
          [
            new Filter('currentDriverId', '=', driver.id.toString()),
            new Filter('id', '=', vehicleId),
          ],
          new Pagination(1, 0),
          new Sort('id', true),
        );
        return this.vehicleService.getVehicleFilter(vehicleFilter).pipe(
          switchMap((vResp: any) => {
            if (vResp?.data?.content?.length === 0) return of(false);

            if (this.isMaintenance) return of(true);

            // 2. Validate Vehicle -> Trip
            const tripFilter = new ModelFilterTable(
              [
                new Filter('id', '=', tripId),
                new Filter('vehicleId', '=', vehicleId),
              ],
              new Pagination(1, 0),
              new Sort('id', true),
            );
            return this.tripService
              .getTripFilter(tripFilter)
              .pipe(
                map((tResp: any) => (tResp?.data?.content?.length ?? 0) > 0),
              );
          }),
        );
      }),
    );
  }

  // ── Data loading ─────────────────────────────────────────────────

  /**
   * Resuelve el parque que le toca al usuario y arranca su carga. Cada rol
   * mira un parque distinto, pero los tres se piden igual: mismos filtros de
   * estado, mismo orden y por páginas.
   *
   * `preselected` es el vehículo que venía en la URL, ya cargado.
   */
  private loadVehiclesForUser(
    user: any,
    preselected: ModelVehicle | null = null,
  ): void {
    const roles = new Set(
      (user.userRoles || []).map((ur: any) =>
        (ur.role?.name || '').toUpperCase(),
      ),
    );
    this.loadingVehicles = true;

    /* Los vendidos no se muestran, pero no todos los parques pueden pedirlo
       al servidor: solo los que van por `/vehicle/filter`, que es donde este
       filtro se aplica y por eso son los que paginan de verdad. Los que pasan
       por la relación vehículo-propietario no lo admiten, así que allí no se
       envía y el descarte lo hace `loadFleet`. */
    const activos = new Filter('status', '!=', 'Vendido');

    if (roles.has('PROPIETARIO')) {
      /* Una fila: el propietario se busca por su usuario. */
      const filter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.ownerService.getOwnerFilter(filter).subscribe({
        next: (resp: any) => {
          const owner = resp?.data?.content?.[0];
          if (!owner?.id) {
            this.loadingVehicles = false;
            return;
          }
          /* Sin `activos`: la relación no filtra el estado, así que enviarlo
             solo engañaría al siguiente que lea esto. Se descarta en
             `loadFleet`. */
          this.startVehicleQuery(
            {
              filters: [new Filter('owner.id', '=', owner.id.toString())],
              withOwner: true,
            },
            preselected,
          );
        },
        error: () => (this.loadingVehicles = false),
      });
      return;
    }

    if (roles.has('CONDUCTOR')) {
      const driverFilter = new ModelFilterTable(
        [new Filter('user.id', '=', user.id.toString())],
        new Pagination(1, 0),
        new Sort('id', true),
      );
      this.driverService.getDriverFilter(driverFilter).subscribe({
        next: (resp: any) => {
          const driver = resp?.data?.content?.[0];
          if (!driver?.id) {
            this.loadingVehicles = false;
            return;
          }
          this.startVehicleQuery(
            {
              filters: [
                new Filter('currentDriverId', '=', driver.id.toString()),
                activos,
              ],
              withOwner: false,
            },
            preselected,
          );
        },
        error: () => (this.loadingVehicles = false),
      });
      return;
    }

    /* Administrador con propietario elegido: hay que pasar por la relación
       para llegar a `owner.id`, y esa flota se trae completa. Sin propietario
       elegido el parque es todo el sistema, que es el caso que de verdad
       pesa: ahí no hace falta la relación, y el endpoint llano sí filtra el
       estado, así que se pagina de verdad. */
    this.startVehicleQuery(
      this.selectedOwnerId
        ? {
            filters: [
              new Filter('owner.id', '=', this.selectedOwnerId.toString()),
            ],
            withOwner: true,
          }
        : {
            filters: [activos],
            withOwner: false,
          },
      preselected,
    );
  }

  /**
   * El vehículo que viene en la URL, con placa, marca y año, que es lo que
   * necesita `g-vehicle-trip-card`. Un fallo no corta la vista: el parque se
   * carga igual y el carrusel arranca por el principio.
   */
  private loadVehicleById(vehicleId: number): Observable<ModelVehicle | null> {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', vehicleId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    return this.vehicleService.getVehicleFilter(filter).pipe(
      map((resp: any) => {
        const vehicle = resp?.data?.content?.[0] ?? null;
        if (vehicle?.driver?.name) {
          vehicle.currentDriverName = vehicle.driver.name;
        }
        return vehicle as ModelVehicle | null;
      }),
      catchError((err) => {
        console.error('Error loading vehicle from url:', err);
        return of(null);
      }),
    );
  }

  /**
   * Arranca un parque nuevo: tira lo cargado y pide la página que toca. Con
   * vehículo preseleccionado el carrusel arranca donde esté él, no en la
   * primera página.
   */
  private startVehicleQuery(
    query: VehicleQuery,
    preselected: ModelVehicle | null,
  ): void {
    this.vehicleQuery = query;
    this.vehicleBuffer.clear();
    this.requestedPages.clear();
    this.pendingSelectIndex = null;
    this.totalVehicles = 0;
    this.totalKnown = false;
    this.carouselIndex = 0;
    this.loadingVehicles = true;

    /* Flota completa: el estado se descarta aquí, así que el total y las
       posiciones tienen que salir de la lista ya filtrada, no del servidor. */
    if (query.withOwner) {
      if (preselected) this.selectVehicle(preselected);
      this.loadFleet(preselected);
      return;
    }

    if (!preselected) {
      this.fetchVehiclePage(0, true);
      return;
    }

    this.selectVehicle(preselected);
    this.resolveVehicleIndex(preselected).subscribe((index) => {
      this.carouselIndex = Math.max(0, index);
      /* Solo la página donde cae el vehículo. Lo que falte alrededor lo pide
         `ensureWindowLoaded` con la respuesta, que ya sabe el total y no
         acaba pidiendo páginas que no existen. */
      this.fetchVehiclePage(
        Math.floor(this.carouselIndex / ExpensesComponent.VEHICLE_PAGE_SIZE),
      );
    });
  }

  /**
   * Orden del parque. Paginando lo tiene que hacer el servidor, porque
   * reordenar después solo ordena dentro de cada página; si la API rechazara
   * el campo se degrada a `id`. Trayendo la flota completa da igual lo que
   * ordene el servidor: se reordena por placa al recibirla, como siempre se
   * hizo, y así ese camino no depende de que la API sepa ordenar por placa.
   */
  private vehicleSort(query: VehicleQuery): Sort {
    const porPlaca = !query.withOwner && !this.plateSortRejected;
    return new Sort(porPlaca ? 'plate' : 'id', true);
  }

  /** El orden por placa de siempre, en español y sin distinguir tildes. */
  private static porPlaca(a: ModelVehicle, b: ModelVehicle): number {
    return a.plate.localeCompare(b.plate, 'es', { sensitivity: 'base' });
  }

  /**
   * La flota entera, en tandas y sin tope abierto. Se recorre hasta el total
   * que informa el servidor en vez de confiar en un `pageSize` grande.
   */
  private fetchFleet(page = 0): Observable<ModelVehicle[]> {
    const size = ExpensesComponent.FLEET_PAGE_SIZE;
    return this.vehicleRequest(this.vehicleQuery!, page, size).pipe(
      switchMap((resp: any) => {
        const content: ModelVehicle[] = resp?.data?.content ?? [];
        /* Se corta con la primera tanda incompleta, no con el total que
           informa el servidor: si ese dato faltara, una flota de más de una
           tanda se quedaría a medias y el propietario dejaría de ver
           vehículos. El tope de tandas es el seguro contra un servidor que
           ignorara la paginación y devolviera siempre lo mismo. */
        const ultima =
          content.length < size ||
          page + 1 >= ExpensesComponent.FLEET_MAX_PAGES;
        if (ultima) return of(content);
        return this.fetchFleet(page + 1).pipe(
          map((resto) => [...content, ...resto]),
        );
      }),
    );
  }

  /**
   * Trae la flota, descarta los vendidos y la ordena por placa. Es lo que
   * hacía la vista antes para todos los roles; ahora solo para los parques
   * que van por la relación vehículo-propietario, que están acotados.
   */
  private loadFleet(preselected: ModelVehicle | null): void {
    this.fetchFleet().subscribe({
      next: (todos) => {
        const vistos = new Set<number>();
        const activos = todos
          .filter((v) => v.status !== 'Vendido')
          /* La relación puede repetir un vehículo, y el carrusel se recorre
             por posición: un duplicado desplazaría al resto. */
          .filter((v) => {
            if (v.id == null || vistos.has(v.id)) return false;
            vistos.add(v.id);
            return true;
          })
          .sort(ExpensesComponent.porPlaca);

        activos.forEach((vehicle: any, i: number) => {
          if (vehicle.driver?.name) {
            vehicle.currentDriverName = vehicle.driver.name;
          }
          this.vehicleBuffer.set(i, vehicle);
        });
        this.totalVehicles = activos.length;
        this.totalKnown = true;
        this.loadingVehicles = false;
        this.mapBrandNames();

        const index = preselected
          ? activos.findIndex((v) => v.id === preselected.id)
          : -1;
        this.carouselIndex = index > 0 ? index : 0;
        this.clampCarouselIndex();

        if (!preselected && activos.length > 0) {
          this.selectVehicle(activos[0]);
        }
      },
      error: (err) => {
        console.error('Error loading vehicles:', err);
        this.loadingVehicles = false;
      },
    });
  }

  /**
   * Única puerta a la API del parque. Recibe la consulta entera para que el
   * endpoint, el orden y los filtros salgan siempre de la misma: mezclar el
   * orden de un parque con el endpoint de otro es un 400 del servidor.
   */
  private vehicleRequest(
    query: VehicleQuery,
    page: number,
    pageSize: number,
    filters: Filter[] = query.filters,
  ): Observable<any> {
    const filter = new ModelFilterTable(
      filters,
      new Pagination(pageSize, page),
      this.vehicleSort(query),
    );
    return query.withOwner
      ? this.vehicleService.getVehicleOwnerFilter(filter)
      : this.vehicleService.getVehicleFilter(filter);
  }

  /**
   * Trae una página al buffer. `selectFirst` pide seleccionar el primero de
   * la página al llegar, que es lo que hace el arranque sin vehículo en la
   * URL.
   */
  private fetchVehiclePage(page: number, selectFirst = false): void {
    /* Solo el camino paginado. En modo flota completa el buffer ya tiene todo
       filtrado y ordenado, y pedir páginas por la relación sobrescribiría
       esas posiciones con filas sin filtrar y en otro orden: el carrusel
       repetiría unos vehículos y se saltaría otros. */
    if (!this.vehicleQuery || this.vehicleQuery.withOwner || page < 0) return;
    if (this.requestedPages.has(page)) return;
    this.requestedPages.add(page);

    const size = ExpensesComponent.VEHICLE_PAGE_SIZE;
    this.vehicleRequest(this.vehicleQuery, page, size).subscribe({
      next: (resp: any) => {
        const content: ModelVehicle[] = resp?.data?.content ?? [];
        this.totalVehicles = resp?.data?.totalElements ?? content.length;
        this.totalKnown = true;
        content.forEach((vehicle: any, i: number) => {
          if (vehicle.driver?.name) {
            vehicle.currentDriverName = vehicle.driver.name;
          }
          this.vehicleBuffer.set(page * size + i, vehicle);
        });

        this.loadingVehicles = false;
        this.clampCarouselIndex();
        this.mapBrandNames();
        this.ensureWindowLoaded();

        if (selectFirst && content.length > 0) {
          this.selectVehicle(content[0]);
        }
        this.resolvePendingSelection();
      },
      error: (err) => this.onVehiclePageError(err, page, selectFirst),
    });
  }

  /**
   * Un fallo de una página con orden por placa se reintenta una vez
   * ordenando por `id`: si la API no admite ese campo de orden, la vista
   * sigue sirviendo y lo único que cambia es el orden del carrusel. Un fallo
   * de red, que no trae código de estado, no degrada nada, porque no dice
   * nada del campo de orden.
   */
  private onVehiclePageError(
    err: any,
    page: number,
    selectFirst: boolean,
  ): void {
    this.requestedPages.delete(page);

    const sortMayBeUnsupported =
      !this.plateSortRejected &&
      typeof err?.status === 'number' &&
      err.status >= 400;

    if (sortMayBeUnsupported) {
      console.warn(
        'El parque no admite orden por placa; se ordena por id.',
        err,
      );
      this.plateSortRejected = true;
      /* Al cambiar el orden, lo ya cargado pertenece a otra secuencia: las
         posiciones del buffer dejan de significar lo mismo y mezclarlo
         repetiría unos vehículos y se saltaría otros. Se tira y se vuelve a
         pedir la ventana desde cero. */
      this.vehicleBuffer.clear();
      this.requestedPages.clear();
      this.totalVehicles = 0;
      this.totalKnown = false;
      this.loadingVehicles = true;
      this.fetchVehiclePage(
        Math.floor(this.carouselIndex / ExpensesComponent.VEHICLE_PAGE_SIZE),
        selectFirst || !this.selectedVehicle,
      );
      this.ensureWindowLoaded();
      return;
    }

    console.error('Error loading vehicles:', err);
    this.loadingVehicles = false;
  }

  /**
   * La posición global del vehículo dentro del parque, que es donde tiene
   * que arrancar el carrusel. Se cuenta cuántas placas van antes de la suya
   * con el mismo filtro de parque. Si la API no sabe comparar placas, o
   * falla, se arranca por el principio: el vehículo queda seleccionado igual
   * y lo único que se pierde es el punto centrado.
   */
  private resolveVehicleIndex(vehicle: ModelVehicle): Observable<number> {
    const query = this.vehicleQuery;
    /* Solo el camino paginado: por la relación no se puede comparar placas, y
       ahí la posición sale de la lista ya cargada. */
    if (!query || query.withOwner || this.plateSortRejected || !vehicle.plate) {
      return of(0);
    }
    return this.vehicleRequest(query, 0, 1, [
      ...query.filters,
      new Filter('plate', '<', vehicle.plate),
    ]).pipe(
      map((resp: any) => resp?.data?.totalElements ?? 0),
      catchError(() => of(0)),
    );
  }

  /** Deja el índice dentro del parque. */
  private clampCarouselIndex(): void {
    this.carouselIndex = Math.min(
      Math.max(0, this.carouselIndex),
      Math.max(0, this.totalVehicles - this.visibleCount),
    );
  }

  /**
   * Pide lo que falte para pintar la ventana actual, y la página siguiente
   * por adelantado, para que avanzar no se quede esperando a la red.
   */
  private ensureWindowLoaded(): void {
    if (!this.vehicleQuery || this.vehicleQuery.withOwner) return;
    const size = ExpensesComponent.VEHICLE_PAGE_SIZE;
    const first = Math.floor(this.carouselIndex / size);
    const last = Math.floor(
      (this.carouselIndex + this.visibleCount - 1) / size,
    );
    for (let page = first; page <= last + 1; page++) {
      if (!this.totalKnown || page * size < this.totalVehicles) {
        this.fetchVehiclePage(page);
      }
    }
  }

  /** Selecciona el vehículo que se pidió desde los puntos, si ya llegó. */
  private resolvePendingSelection(): void {
    if (this.pendingSelectIndex == null) return;
    const vehicle = this.vehicleBuffer.get(this.pendingSelectIndex);
    if (!vehicle) return;
    this.pendingSelectIndex = null;
    this.selectVehicle(vehicle);
  }

  loadOwners(): void {
    /* Mil, el mismo tope que el resto de los desplegables de propietario. */
    const filter = new ModelFilterTable(
      [],
      new Pagination(1000, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (resp: any) => {
        this.owners = resp?.data?.content || [];
      },
      error: (err) => console.error('Error loading owners:', err),
    });
  }

  /** Llega el id como texto —o `null` en la fila de "Todos"—, que es lo que
   *  emite el buscador. */
  onOwnerChange(ownerId: string | null): void {
    this.selectedOwnerId = ownerId ? Number(ownerId) : null;
    this.selectedVehicle = null;
    this.selectedTrip = null;
    this.loadingVehicles = true;

    // Trigger reload
    this.securityService.userData$.pipe(take(1)).subscribe((user) => {
      if (user) this.loadVehiclesForUser(user);
    });
  }

  loadBrands(): void {
    this.loadingBrands = true;
    this.commonService.getVehicleBrands().subscribe({
      next: (response: any) => {
        this.brands = response?.data ?? [];
        this.loadingBrands = false;
        this.mapBrandNames();
        // Also enrich selectedVehicle in case it was loaded before brands (queryParams flow)
        if (
          this.selectedVehicle &&
          !this.selectedVehicle.vehicleBrandName &&
          this.selectedVehicle.vehicleBrandId
        ) {
          const brand = this.brands.find(
            (b) =>
              String(b.id) === String(this.selectedVehicle!.vehicleBrandId),
          );
          if (brand)
            this.selectedVehicle = {
              ...this.selectedVehicle,
              vehicleBrandName: brand.name,
            };
        }
      },
      error: (err) => {
        console.error('Error loading brands:', err);
        this.loadingBrands = false;
      },
    });
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data;
        }
      },
      error: (err: any) => console.error('Error loading cities:', err),
    });
  }

  mapBrandNames(): void {
    const mapFn = (v: ModelVehicle) => {
      if (!v.vehicleBrandName) {
        const brand = this.brands.find(
          (b) => String(b.id) === String(v.vehicleBrandId),
        );
        if (brand) v.vehicleBrandName = brand.name;
      }
    };

    if (this.brands.length > 0) {
      this.vehicleBuffer.forEach(mapFn);
      if (this.selectedVehicle) mapFn(this.selectedVehicle);
    }
  }

  // ── Carousel navigation ──────────────────────────────────────────

  /** La ventana que se pinta. Se salta los huecos: mientras una página
   *  viaja, esa posición todavía no tiene vehículo que mostrar. */
  get visibleVehicles(): ModelVehicle[] {
    const window: ModelVehicle[] = [];
    const end = this.carouselIndex + this.visibleCount;
    for (let i = this.carouselIndex; i < end; i++) {
      const vehicle = this.vehicleBuffer.get(i);
      if (vehicle) window.push(vehicle);
    }
    return window;
  }

  // ── Accesos rápidos de categorías ────────────────────────────────

  private buildShortcuts(
    history: ModelExpense[],
  ): Record<number, ExpenseShortcut[]> {
    return {
      1: buildExpenseShortcuts(history, 1),
      2: buildExpenseShortcuts(history, 2),
      3: buildExpenseShortcuts(history, 3),
      4: buildExpenseShortcuts(history, 4),
    };
  }

  /**
   * El parque sobre el que se calcula el ranking. Es el del usuario, con una
   * excepción: el administrador que no ha elegido propietario tiene por
   * parque todo el sistema, y un ranking de categorías de todo el sistema no
   * dice nada de la operación que se está mirando. Ahí se acota al
   * propietario del vehículo seleccionado, y si no se le conoce propietario
   * devuelve `null`, que deja el ranking en el vehículo solo.
   */
  private shortcutsQuery(): VehicleQuery | null {
    if (this.userRole !== 'ADMINISTRADOR' || this.selectedOwnerId != null) {
      return this.vehicleQuery;
    }
    const vehicle = this.selectedVehicle;
    const ownerId = vehicle?.ownerId ?? vehicle?.owners?.[0]?.ownerId;
    if (ownerId == null) return null;
    return {
      filters: [new Filter('owner.id', '=', ownerId.toString())],
      withOwner: true,
    };
  }

  /**
   * Los ids del parque del ranking. Antes salían de la lista completa, que
   * estaba entera en memoria; ahora se piden aparte y con tope, porque la
   * lista ya no se carga entera. Si la petición falla, el ranking se calcula
   * con el vehículo seleccionado, que es mejor que quedarse sin accesos.
   */
  private shortcutsVehicleIds(
    query: VehicleQuery | null,
  ): Observable<number[]> {
    const own = this.selectedVehicle?.id;
    const fallback = own != null ? [own] : [];
    if (!query) return of(fallback);

    /* La flota entera ya está cargada, así que no hace falta pedirla otra
       vez. Es el caso del conductor y de las flotas pequeñas, que son la
       mayoría. */
    if (query === this.vehicleQuery) {
      const buffered = this.bufferedFleetIds();
      if (buffered) return of(buffered);
    }

    return this.vehicleRequest(
      query,
      0,
      ExpensesComponent.SHORTCUTS_VEHICLE_CAP,
    ).pipe(
      map((resp: any) =>
        ((resp?.data?.content ?? []) as ModelVehicle[])
          /* Los vendidos no cuentan para el ranking, y por la relación
             llegan igual. */
          .filter((v) => v.status !== 'Vendido')
          .map((v) => v.id)
          .filter((id): id is number => id != null),
      ),
      catchError((err) => {
        console.error('Error loading shortcut scope:', err);
        return of(fallback);
      }),
    );
  }

  /**
   * Los ids de todo el parque, si es que ya está entero en el buffer y cabe
   * en el tope del ranking. `null` cuando falta algo y hay que pedirlo.
   */
  private bufferedFleetIds(): number[] | null {
    if (!this.totalKnown) return null;
    if (this.totalVehicles === 0) return [];
    const ids: number[] = [];
    for (let i = 0; i < this.totalVehicles; i++) {
      const id = this.vehicleBuffer.get(i)?.id;
      if (id == null) return null;
      ids.push(id);
    }
    return ids;
  }

  /**
   * El ranking se calcula sobre los gastos recientes del parque que se está
   * operando, así los accesos rápidos reflejan lo que esa operación
   * realmente registra y no una lista fija. Ver `shortcutsQuery` para el
   * alcance de cada rol.
   */
  private loadExpenseShortcuts(force: boolean = false): void {
    const query = this.shortcutsQuery();
    const scope = query
      ? JSON.stringify(query)
      : `vehicle:${this.selectedVehicle?.id ?? ''}`;

    if (scope === 'vehicle:') return;
    if (!force && scope === this.shortcutsScope) return;
    this.shortcutsScope = scope;

    this.shortcutsVehicleIds(query).subscribe((ids) => {
      if (ids.length === 0) {
        this.expenseShortcuts = this.buildShortcuts([]);
        return;
      }
      this.fetchExpenseShortcuts(ids.join(','));
    });
  }

  private fetchExpenseShortcuts(vehicleIds: string): void {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - this.SHORTCUTS_HISTORY_MONTHS);

    const payload = new ModelFilterTable(
      [
        new Filter('vehicleId', 'in', vehicleIds),
        new Filter('expenseDate', '>=', startDate.toISOString().split('T')[0]),
      ],
      new Pagination(300, 0),
      new Sort('id', false),
    );

    this.expenseService.getExpenseFilter(payload).subscribe({
      next: (resp: any) => {
        this.expenseShortcuts = this.buildShortcuts(resp?.data?.content ?? []);
      },
      error: (err) => {
        console.error('Error loading expense shortcuts:', err);
        this.expenseShortcuts = this.buildShortcuts([]);
      },
    });
  }

  selectVehicle(vehicle: ModelVehicle): void {
    /* Primero la selección: el alcance del ranking se deduce del vehículo
       seleccionado cuando el administrador no ha elegido propietario. */
    this.selectedVehicle = vehicle;
    this.loadExpenseShortcuts();
    if (
      this.tripIdParam &&
      this.vehicleIdParam === vehicle.id?.toString() &&
      (!this.selectedTrip ||
        this.selectedTrip.id?.toString() === this.tripIdParam)
    ) {
      // Do not clear selected trip when initially loading parameterized vehicle
    } else {
      this.selectedTrip = null; // Clear selected trip when changing vehicle
    }

    if (this.isMaintenance) {
      this.selectedTrip = { id: 0 } as ModelTrip;
      return;
    }

    if (vehicle.id) {
      this.loadRecentTrips(vehicle.id);
    }
  }

  selectTrip(trip: ModelTrip): void {
    if (this.selectedTrip?.id === trip.id) {
      this.selectedTrip = null; // Toggle off if already selected
    } else {
      this.selectedTrip = trip;
    }
  }

  loadRecentTrips(vehicleId: number): void {
    if (this.isMaintenance) return;
    this.loadingTrips = true;
    this.recentTrips = [];

    const filter = new ModelFilterTable(
      /* Los viajes dados de baja siguen en el selector: sus gastos se pueden
         consultar. Lo que se bloquea es registrar o editar —ver `readOnly`. */
      [new Filter('vehicle.id', '=', vehicleId.toString())],
      new Pagination(10, 0),
      new Sort('id', false), // Newest first
    );

    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          let trips: ModelTrip[] = response.data.content;

          // Logic to prioritize "En curso" or "En Curso" (case insensitive/variants)
          const isActive = (status: string) =>
            status?.toLowerCase().includes('curso') ||
            status?.toLowerCase().includes('ruta');

          const activeTrips = trips.filter((t) => isActive(t.status));
          const otherTrips = trips.filter((t) => !isActive(t.status));

          // Combine and take top 3
          this.recentTrips = [...activeTrips, ...otherTrips].slice(0, 3);

          // Auto-select the first trip (prioritized active then newest)
          if (this.recentTrips.length > 0) {
            if (
              this.tripIdParam &&
              vehicleId.toString() === this.vehicleIdParam
            ) {
              if (
                !this.selectedTrip ||
                this.selectedTrip.id?.toString() !== this.tripIdParam
              ) {
                const matchedTrip = this.recentTrips.find(
                  (t) => t.id?.toString() === this.tripIdParam,
                );
                if (matchedTrip) {
                  this.selectedTrip = matchedTrip;
                }
              }
            } else {
              this.selectedTrip = this.recentTrips[0];
            }
          }
        }
        this.loadingTrips = false;
      },
      error: (err) => {
        console.error('Error loading recent trips:', err);
        this.loadingTrips = false;
      },
    });
  }

  getCityName(cityId: any): string {
    if (!cityId) return 'N/A';
    const city = this.cities.find((c) => String(c.id) === String(cityId));
    if (!city) return String(cityId);
    return city.name;
  }

  prev(): void {
    if (!this.canPrev) return;
    this.carouselIndex--;
    this.ensureWindowLoaded();
  }

  next(): void {
    if (!this.canNext) return;
    this.carouselIndex++;
    this.ensureWindowLoaded();
  }

  /**
   * Salta a una posición del carrusel desde los puntos. El vehículo puede
   * estar en una página que todavía no se ha traído: entonces se pide y la
   * selección la hace la respuesta, en `resolvePendingSelection`.
   */
  goToVehicle(index: number): void {
    this.carouselIndex = index;
    const vehicle = this.vehicleBuffer.get(index);
    if (vehicle) {
      this.pendingSelectIndex = null;
      this.selectVehicle(vehicle);
    } else {
      this.pendingSelectIndex = index;
    }
    this.ensureWindowLoaded();
  }

  get canPrev(): boolean {
    return this.carouselIndex > 0;
  }

  get canNext(): boolean {
    return this.carouselIndex + this.visibleCount < this.totalVehicles;
  }

  get totalDots(): number {
    return Math.max(0, this.totalVehicles - this.visibleCount + 1);
  }

  dotRange(): number[] {
    return PaginationUtils.getVisiblePages(
      this.carouselIndex,
      this.totalDots,
      this.maxVisibleDots,
    );
  }

  /**
   * El viaje está dado de baja. Sus gastos quedan en solo lectura: se
   * consultan, pero no se registran ni se editan. A diferencia de los plazos
   * de abajo, este no depende del rol —un viaje que no existió no admite
   * movimientos de nadie— ni caduca.
   */
  get isTripCancelled(): boolean {
    return !this.isMaintenance && isCancelledTrip(this.selectedTrip?.status);
  }

  /* ---- Plazos para registrar y editar -------------------------------------
     Un viaje no se toca para siempre: pasado su plazo, sus gastos quedan como
     quedaron. Cada rol tiene el suyo y se cuenta desde un hito distinto,
     porque distinto es lo que cada uno hace con el viaje: el conductor lo
     cierra y liquida lo del camino, el propietario cuadra las cuentas del mes.
     El administrador no tiene plazo. */

  /** Horas del conductor, contadas desde que el viaje se cerró. */
  private static readonly DRIVER_HOURS = 72;

  /** Meses del propietario, contados desde que el viaje se registró. */
  private static readonly OWNER_MONTHS = 1;

  /**
   * El plazo del conductor: 72 horas desde que el viaje se cerró.
   *
   * Solo corre sobre viajes ya cerrados —Completado o Pendiente—: mientras el
   * viaje está En Curso el conductor registra sin plazo, que es justo cuando
   * ocurren los gastos. Un viaje cerrado sin fecha de fin tampoco lo bloquea:
   * sin ese dato no hay desde cuándo contar.
   */
  get isTripLockedForDriver(): boolean {
    if (
      this.userRole !== 'CONDUCTOR' ||
      this.isMaintenance ||
      !this.selectedTrip
    )
      return false;

    if (!['Completado', 'Pendiente'].includes(this.selectedTrip.status || '')) {
      return false;
    }
    if (!this.selectedTrip.endDate) return false;

    const end = new Date(this.selectedTrip.endDate);
    if (Number.isNaN(end.getTime())) return false;

    const horas = (Date.now() - end.getTime()) / (1000 * 60 * 60);
    return horas > ExpensesComponent.DRIVER_HOURS;
  }

  /**
   * El plazo del propietario: un mes desde que el viaje se registró.
   *
   * Se cuenta desde el registro y no desde el cierre —que es el hito del
   * conductor— porque lo que el propietario cuadra es el mes en que el viaje
   * entró a sus cuentas. No mira el estado: un viaje viejo está cerrado o
   * abandonado, y en los dos casos sus gastos ya se contaron en un periodo que
   * los reportes dan por cerrado.
   *
   * Sin fecha de registro no bloquea, por lo mismo que en el conductor: no hay
   * desde cuándo contar.
   */
  get isTripLockedForOwner(): boolean {
    if (
      this.userRole !== 'PROPIETARIO' ||
      this.isMaintenance ||
      !this.selectedTrip
    )
      return false;

    const registro =
      this.selectedTrip.creationDate ?? this.selectedTrip.startDate;
    if (!registro) return false;

    const fecha = new Date(registro);
    if (Number.isNaN(fecha.getTime())) return false;

    return (
      fecha.getTime() <
      ExpensesComponent.monthsAgo(ExpensesComponent.OWNER_MONTHS).getTime()
    );
  }

  /**
   * La fecha de hace N meses.
   *
   * El día se fija al final y no antes: restarle un mes al 31 de marzo da el 3
   * de marzo —febrero no tiene 31— y el plazo saldría corto justo en los meses
   * largos. Se pone el día 1 para restar el mes y después se recorta al último
   * día que ese mes tenga.
   */
  private static monthsAgo(months: number): Date {
    const hoy = new Date();
    const limite = new Date(hoy.getTime());

    limite.setDate(1);
    limite.setMonth(limite.getMonth() - months);

    const ultimoDia = new Date(
      limite.getFullYear(),
      limite.getMonth() + 1,
      0,
    ).getDate();
    limite.setDate(Math.min(hoy.getDate(), ultimoDia));

    return limite;
  }

  /**
   * El aviso del plazo vencido, o `null` si el viaje todavía se puede tocar.
   *
   * Registrar y editar comparten los dos plazos y solo cambian en el verbo, y
   * el aviso dice cuál venció: "no se puede" sin decir por qué deja al usuario
   * pensando que le falta un permiso.
   */
  private expiredWindowMessage(
    verbo: 'registrar' | 'modificar',
  ): string | null {
    if (this.isTripLockedForDriver) {
      return `El periodo de ${ExpensesComponent.DRIVER_HOURS} horas para ${verbo} gastos en este viaje ha expirado.`;
    }
    if (this.isTripLockedForOwner) {
      const meses = ExpensesComponent.OWNER_MONTHS;
      const plazo = meses === 1 ? 'un mes' : `${meses} meses`;
      return `El plazo de ${plazo} desde que se registró el viaje para ${verbo} sus gastos ha expirado.`;
    }
    return null;
  }

  // ── Add Expense Offcanvas ──────────────────────────────────────────

  onShortcutClick(shortcut: ExpenseShortcutEvent): void {
    this.openAddExpense(
      shortcut.typeId,
      shortcut.categoryId,
      shortcut.categoryName,
    );
  }

  openAddExpense(
    typeId?: number,
    categoryId: number | null = null,
    categoryName: string = '',
  ): void {
    const tripRequired = !this.isMaintenance;
    const canOpen =
      this.selectedVehicle && (!tripRequired || this.selectedTrip);

    if (canOpen) {
      if (this.isTripCancelled) {
        this.toastService.showError(
          'Acción denegada',
          'El viaje está cancelado: sus gastos son solo de consulta.',
        );
        return;
      }
      const plazoVencido = this.expiredWindowMessage('registrar');
      if (plazoVencido) {
        this.toastService.showError('Acción denegada', plazoVencido);
        return;
      }
      this.editingExpense = null;
      this.preselectedExpenseTypeId = typeId || null;
      this.preselectedCategoryId = categoryId;
      this.preselectedCategoryName = categoryName;
      this.showAddExpense = true;
    } else {
      this.toastService.showError(
        'Atención',
        this.isMaintenance
          ? 'Selecciona un vehículo primero'
          : 'Selecciona un vehículo y un viaje primero',
      );
    }
  }

  private resetPreselection(): void {
    this.preselectedExpenseTypeId = null;
    this.preselectedCategoryId = null;
    this.preselectedCategoryName = '';
  }

  onEditExpense(expense: ModelExpense): void {
    if (this.isTripCancelled) {
      this.toastService.showError(
        'Acción denegada',
        'El viaje está cancelado: sus gastos son solo de consulta.',
      );
      return;
    }
    const plazoVencido = this.expiredWindowMessage('modificar');
    if (plazoVencido) {
      this.toastService.showError('Acción denegada', plazoVencido);
      return;
    }
    this.editingExpense = expense;
    this.showAddExpense = true;
  }

  onExpenseAdded(event: any): void {
    if (event) {
      this.isSavingExpense = true;
      const isUpdating = !!this.editingExpense;
      let mensaje = '';
      if (this.isMaintenance) {
        mensaje = isUpdating
          ? 'Mantenimiento actualizado exitosamente!'
          : 'Mantenimiento registrado exitosamente!';
      } else {
        mensaje = isUpdating
          ? 'Gasto actualizado exitosamente!'
          : 'Gasto registrado exitosamente!';
      }
      this.expenseService.createExpense(event).subscribe({
        next: () => {
          this.toastService.showSuccess(
            this.isMaintenance ? 'Mantenimiento' : 'Gastos',
            mensaje,
          );
          this.showAddExpense = false;
          // Refresh list
          this.expensesTripComponent?.loadExpenses();
          this.notificationsService.refreshNotifications();
          this.reportLocationIfDriver();
          // El nuevo gasto puede cambiar el ranking de categorías
          this.loadExpenseShortcuts(true);
          // Reset states AFTER potential usage
          this.editingExpense = null;
          this.resetPreselection();
          this.isSavingExpense = false;
        },
        error: (err) => {
          console.error('Error saving expense:', err);
          this.toastService.showError('Error', 'No se pudo registrar el gasto');
          this.isSavingExpense = false;
        },
      });
    } else {
      this.showAddExpense = false;
      this.editingExpense = null;
      this.resetPreselection();
    }
  }

  private reportLocationIfDriver(): void {
    this.securityService.userData$.pipe(take(1)).subscribe((user) => {
      if (user) {
        const roles = (user.userRoles || []).map((ur: any) =>
          (ur.role?.name || '').toUpperCase(),
        );
        if (roles.includes('CONDUCTOR')) {
          const vehicleId = this.selectedVehicle?.id;
          const tripId = this.selectedTrip?.id || null;
          const driverId = this.selectedVehicle?.currentDriverId;

          if (driverId && vehicleId) {
            this.locationService.reportDriverLocation(
              driverId,
              vehicleId,
              tripId,
              true,
            );
          }
        }
      }
    });
  }

  goBack(): void {
    if (this.originParam === 'detail' && this.tripIdParam) {
      this.router.navigate(['/site/trips', this.tripIdParam], {
        queryParams: { from: 'vehicles' },
      });
    } else if (this.originParam === 'list') {
      this.router.navigate(['/site/trips']);
    } else if (this.vehicleIdParam) {
      this.router.navigate(['/site/vehicles']);
    }
  }
}
