import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription, forkJoin, lastValueFrom } from 'rxjs';
import { ModelTrip } from 'src/app/models/trip-model';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from 'src/app/models/model-filter-table';
import { GTripCardComponent } from '../../components/g-trip-card/g-trip-card.component';
import { GVehicleOwnerCardComponent } from '../../components/g-vehicle-owner-card/g-vehicle-owner-card.component';
import { TripService } from 'src/app/services/trip.service';
import { CommonService } from 'src/app/services/common.service';
import { ToastService } from 'src/app/services/toast.service';
import { SecurityService } from 'src/app/services/security/security.service';
import { OwnerService } from 'src/app/services/owner.service';
import { ModelOwner } from 'src/app/models/owner-model';
import { VehicleService } from 'src/app/services/vehicle.service';
import { DriverService } from 'src/app/services/driver.service';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import { GTripFormComponent } from '../../components/g-trip-form/g-trip-form.component';
import { GTripInfoCardComponent } from '../../components/g-trip-info-card/g-trip-info-card.component';
import {
  ComboOption,
  GSearchComboboxComponent,
} from 'src/app/components/g-search-combobox/g-search-combobox.component';
import { ownerComboOptions } from 'src/app/utils/owner-options';
import { GConfirmSheetComponent } from '../../components/g-confirm-sheet/g-confirm-sheet.component';
import { NotificationsService } from 'src/app/services/notifications.service';
import { PaginationUtils } from 'src/app/utils/pagination-utils';
import { findScroller, scrollToTop } from 'src/app/utils/scroll';
import { locationQuery } from 'src/app/utils/city-geo';
import { tollContextFromTrip } from 'src/app/utils/toll-context';
import { TollTripContext } from 'src/app/models/toll-model';
import {
  applyTripStatusChange,
  canChangeTripStatus,
  canSetTripStatus,
  CANCELLED_TRIP_STATUS,
  excludeCancelledFilter,
  isCancelledTrip,
  statusNeedsConfirmation,
  TripStatusConfirmation,
  tripStatusConfirmation,
} from 'src/app/utils/trip-status';
import { xlsxFileName } from 'src/app/utils/xlsx';
import { Formatters } from 'src/app/utils/formatters';
import { buildTripsSheet, toSheetDate } from 'src/app/utils/trips-sheet';
import { shareOrDownloadFile } from 'src/app/utils/file-share';

export interface TripOwnerGroup {
  owner: ModelOwner;
  trips: ModelTrip[];
}

@Component({
  selector: 'app-trips',
  standalone: true,
  imports: [
    FormsModule,
    GTripCardComponent,
    GVehicleOwnerCardComponent,
    GTripFormComponent,
    GConfirmSheetComponent,
    GTripInfoCardComponent,
    GSearchComboboxComponent,
  ],
  templateUrl: './trips.component.html',
  styleUrls: ['./trips.component.scss'],
})
export class TripsComponent implements OnInit, AfterViewInit, OnDestroy {
  allTrips: ModelTrip[] = [];
  totalTrips: number = 0;
  /** Filas del listado actual, con bajas lógicas. Solo pagina; no se muestra. */
  listTotal: number = 0;

  /** Quién se desplaza realmente — ver `findScroller`. */
  private scroller: HTMLElement | Window = window;
  inProgressTrips: number = 0;
  completedTrips: number = 0;
  pendingTrips: number = 0;
  selectedStatus: string | null = null;

  // Global cache for Admin role
  globalStats = {
    total: 0,
    inProgress: 0,
    completed: 0,
    pending: 0,
  };

  searchTerm: string = '';
  originFilter: string | null = null;
  destinationFilter: string | null = null;
  /** Propietarios del desplegable de filtro. Solo se llena para el admin. */
  /** La lista se rellena en la carga y se vacía en su error, así que las
   *  filas del buscador se rehacen aquí. Ver `ownerComboOptions`. */
  set ownerOptions(value: ModelOwner[]) {
    this.listaOwners = value ?? [];
    this.ownerFilterOptions = ownerComboOptions(this.listaOwners);
  }
  get ownerOptions(): ModelOwner[] {
    return this.listaOwners;
  }
  private listaOwners: ModelOwner[] = [];
  ownerFilterOptions: ComboOption[] = [];
  showFilters: boolean = false;
  isSearchActive: boolean = false;
  page: number = 0;
  rows: number = 9;
  loading: boolean = true;

  get isSearchingTrips(): boolean {
    return (
      this.userRole === 'ADMINISTRADOR' &&
      (!!this.searchTerm || !!this.originFilter || !!this.destinationFilter) &&
      !this.expandedOwnerId &&
      !this.ownerIdFilter
    );
  }

  // Grouped display
  groupedTrips: TripOwnerGroup[] = [];

  /** Total de gastos por viaje, solo para los viajes vacíos del listado */
  expensesByTripId: Record<number, number | undefined> = {};

  // Offcanvas state
  isOffcanvasOpen: boolean = false;
  editingTrip: ModelTrip | null = null;
  showingActiveTripWarning: boolean = false;
  showingNoVehiclesWarning: boolean = false;
  showingStatusHelp: boolean = false;

  /**
   * Qué significa cada estado
   * El color y el icono son los mismos de las tarjetas de contador y de la
   * etiqueta de cada viaje, para que la ayuda se lea contra lo que ya está en
   * pantalla.
   */
  readonly tripStatusHelp: readonly {
    status: string;
    icon: string;
    tone: string;
    description: string;
  }[] = [
    {
      status: 'En Curso',
      icon: 'fa-truck-fast',
      tone: 'primary',
      description: 'Salió a ruta y todavía no llega al destino.',
    },
    {
      status: 'Pendiente',
      icon: 'fa-clock-rotate-left',
      tone: 'warning',
      description: 'Llegó al destino, pero falta cobrar el saldo del flete.',
    },
    {
      status: 'Completado',
      icon: 'fa-circle-check',
      tone: 'success',
      description: 'Llegó al destino y el saldo del flete ya se pagó.',
    },
    {
      status: 'Cancelado',
      icon: 'fa-ban',
      tone: 'danger',
      description: 'Dado de baja: no cuenta en reportes ni en la utilidad.',
    },
  ];

  // Maps info card state
  isTripInfoOpen: boolean = false;
  latestTripOrigin: string = '';
  latestTripDestination: string = '';
  /** Vacío salvo en viajes redondos: alimenta la ruta de tres puntos del trayecto */
  latestTripReturnDestination: string = '';
  /** Ubicaciones con país para la ruta: el nombre suelto no basta en frontera */
  latestTripOriginQuery: string = '';
  latestTripDestinationQuery: string = '';
  latestTripReturnDestinationQuery: string = '';
  latestTripAxles: number = 2;
  /** Datos del viaje para la estimación de peajes del panel del trayecto */
  latestTripTollContext: TollTripContext | null = null;

  // Selection Lists for parent context
  owners: ModelOwner[] = [];
  cities: any[] = [];
  groupedCities: { state: string; cities: any[] }[] = [];
  vehicles: any[] = [];

  // User context
  userRole: string = 'ROL';
  loggedInOwnerId: number | null = null;
  loggedInDriverId: number | null = null;
  loggedInOwner: ModelOwner | null = null;
  private userSub?: Subscription;
  expandedOwnerId: number | null = null;
  expandedOwnerPage: number = 0;
  expandedOwnerRows: number = 9;
  ownerTrips: ModelTrip[] = [];
  totalExpandedTrips: number = 0;
  totalOwners: number = 0;

  // filters
  ownerIdFilter: number | null = null;
  filteredOwner: ModelOwner | null = null;
  isLoadingExpandedTrips: boolean = false;
  expandedOwnerVehiclesCount: number = 0;

  /** driverId filter when navigated from driver profile (query param) */
  driverIdFilter: number | null = null;
  filteredDriver: any;

  /** vehicleId filter when navigated from vehicle card (query param) */
  vehicleIdFilter: number | null = null;
  filteredVehicle: any;

  constructor(
    private readonly tripService: TripService,
    private readonly commonService: CommonService,
    private readonly toastService: ToastService,
    private readonly securityService: SecurityService,
    private readonly ownerService: OwnerService,
    private readonly vehicleService: VehicleService,
    private readonly driverService: DriverService,
    private readonly expenseService: ExpenseService,
    private readonly notificationsService: NotificationsService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly host: ElementRef<HTMLElement>,
  ) {}

  ngAfterViewInit(): void {
    this.scroller = findScroller(this.host?.nativeElement);
  }

  ngOnInit(): void {
    const rawOwnerId = this.route.snapshot.queryParamMap.get('ownerId');
    if (rawOwnerId != null) {
      this.ownerIdFilter = Number(rawOwnerId);
      this.isSearchActive = false;
      this.loadFilteredOwner(this.ownerIdFilter);
    }

    const rawDriverId = this.route.snapshot.queryParamMap.get('driverId');
    if (rawDriverId != null) {
      this.driverIdFilter = Number(rawDriverId);
      this.loadFilteredDriver(this.driverIdFilter);
    }

    const rawVehicleId = this.route.snapshot.queryParamMap.get('vehicleId');
    if (rawVehicleId != null) {
      this.vehicleIdFilter = Number(rawVehicleId);
      this.loadFilteredVehicle(this.vehicleIdFilter);
    }

    this.subscribeToUserContext();
    this.loadCities();
  }

  loadCities(): void {
    this.commonService.getCities().subscribe({
      next: (response: any) => {
        if (response?.data) {
          this.cities = response.data.sort((a: any, b: any) => {
            const stateA = a.state || 'Sin departamento';
            const stateB = b.state || 'Sin departamento';
            if (stateA === stateB) {
              return (a.name || '').localeCompare(b.name || '');
            }
            return stateA.localeCompare(stateB);
          });
          this.groupedCities = this.buildGroupedCities();
        }
      },
      error: (err: any) => console.error('Error loading cities:', err),
    });
  }

  private buildGroupedCities(): { state: string; cities: any[] }[] {
    const map = new Map<string, any[]>();
    for (const city of this.cities) {
      const state = city.state || 'Sin departamento';
      if (!map.has(state)) {
        map.set(state, []);
      }
      map.get(state)!.push(city);
    }
    return Array.from(map.entries())
      .map(([state, cities]) => ({ state, cities }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }

  loadFilteredOwner(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredOwner = response.data.content[0];
          this.loadVehiclesByOwner(ownerId, true);
        }
      },
    });
  }

  /**
   * La lista completa de propietarios para el desplegable del filtro.
   *
   * No sirve `owners`: esa es la página de nueve tarjetas que se está viendo y
   * el filtro tiene que ofrecerlos todos. Se pide una sola vez al entrar, solo
   * para el administrador, que es el único que ve el filtro.
   */
  private loadOwnerOptions(): void {
    const filter = new ModelFilterTable(
      [],
      new Pagination(1000, 0),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        this.ownerOptions = response?.data?.content ?? [];
      },
      error: (err) => {
        console.error('Error loading owner options:', err);
        this.ownerOptions = [];
      },
    });
  }

  /**
   * El administrador elige un propietario y la pantalla se acota a él.
   *
   * Se apoya en `ownerIdFilter`, el mismo estado que ya usa el enlace que trae
   * aquí desde la ficha de un propietario: una sola forma de acotar la vista
   * en vez de dos que puedan discrepar. Por eso también se refleja en la URL,
   * para que recargar o compartir el enlace caiga en la misma pantalla.
   *
   * La cadena arranca por el propietario porque los viajes se acotan a sus
   * vehículos, y esos hay que tenerlos antes de pedirlos.
   */
  onOwnerFilterChange(ownerId: number | string | null): void {
    const elegido = ownerId === null || ownerId === '' ? null : Number(ownerId);
    if (elegido === this.ownerIdFilter) return;

    this.ownerIdFilter = elegido;
    this.filteredOwner = null;
    this.expandedOwnerId = null;
    this.expandedOwnerPage = 0;
    this.ownerTrips = [];
    this.isSearchActive = false;
    this.page = 0;

    /* Vehículo y conductor mandan sobre el propietario al armar la consulta,
       así que si quedaran puestos el filtro recién elegido no se notaría. Se
       sueltan aquí y en la URL: quien llegó desde un vehículo y ahora elige un
       propietario está pidiendo otra cosa. */
    this.vehicleIdFilter = null;
    this.filteredVehicle = null;
    this.driverIdFilter = null;
    this.filteredDriver = null;

    this.router.navigate([], {
      queryParams: { ownerId: elegido, vehicleId: null, driverId: null },
      queryParamsHandling: 'merge',
    });

    if (elegido != null) {
      this.loadFilteredOwner(elegido);
    } else {
      /* Sin propietario no hay vehículos que acoten nada: se sueltan para que
         las consultas vuelvan a ser las del listado general. */
      this.vehicles = [];
      this.loadTrips();
    }
    this.loadOwners();
  }

  loadFilteredDriver(driverId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', driverId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredDriver = response.data.content[0];
          this.loadTrips();
        }
      },
    });
  }

  loadFilteredVehicle(vehicleId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', vehicleId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.filteredVehicle = response.data.content[0];
          this.loadTrips();
        }
      },
    });
  }

  subscribeToUserContext(): void {
    this.userSub = this.securityService.userData$.subscribe({
      next: (user) => {
        if (user) {
          this.userRole = (user.userRoles?.[0]?.role?.name || '').toUpperCase();

          if (this.userRole === 'ADMINISTRADOR') {
            this.loadOwnerOptions();
            this.loadOwners();
            this.loadTrips();
          } else if (this.userRole === 'PROPIETARIO') {
            this.loggedInOwnerId = user.id ?? null;
            this.loadOwners();
          } else if (this.userRole === 'CONDUCTOR') {
            this.loadDriverIdByUser(user.id);
          }
        }
      },
    });
  }

  loadDriverIdByUser(userId: number | null | undefined): void {
    if (userId == null) return;
    const filter = new ModelFilterTable(
      [new Filter('user.id', '=', userId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.driverService.getDriverFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          const driver = response.data.content[0];
          this.loggedInDriverId = driver.id;
          this.loggedInOwnerId = driver.ownerId; // Crucial for form context
          if (this.loggedInOwnerId) {
            this.loadOwnerById(this.loggedInOwnerId);
          }
          this.loadTrips();
        }
      },
    });
  }

  loadOwnerById(ownerId: number): void {
    const filter = new ModelFilterTable(
      [new Filter('id', '=', ownerId.toString())],
      new Pagination(1, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content?.length > 0) {
          this.loggedInOwner = response.data.content[0];
          this.applyFilter();
        }
      },
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
  }

  goBackToVehicles(): void {
    this.router.navigate(['/site/vehicles']);
  }

  loadVehiclesByOwner(ownerId: number, isInitialLoad: boolean = false): void {
    const filter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('owner.id', true),
    );
    this.vehicleService.getVehicleOwnerFilter(filter).subscribe({
      next: (response: any) => {
        const content = response?.data?.content ?? [];
        this.vehicles = content.filter((v: any) => v.status !== 'Vendido');
        if (isInitialLoad) {
          this.loadTrips();
        }
      },
      error: () => {
        this.vehicles = [];
        if (isInitialLoad) this.loadTrips();
      },
    });
  }

  loadOwners(): void {
    let filtros: Filter[] = [];
    if (this.userRole === 'PROPIETARIO' && this.loggedInOwnerId != null) {
      filtros.push(new Filter('user.id', '=', this.loggedInOwnerId.toString()));
    } else if (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter) {
      filtros.push(new Filter('id', '=', this.ownerIdFilter.toString()));
    }

    const paginationRows =
      this.userRole === 'ADMINISTRADOR' && !this.ownerIdFilter ? this.rows : 1;

    let filter = new ModelFilterTable(
      filtros,
      new Pagination(paginationRows, this.page),
      new Sort('name', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = response.data.content;
          if (this.userRole === 'PROPIETARIO' && this.owners.length > 0) {
            this.loggedInOwnerId = this.owners[0].id ?? this.loggedInOwnerId;
            if (this.loggedInOwnerId) {
              this.loadVehiclesByOwner(this.loggedInOwnerId, true);
            } else {
              this.loadTrips();
            }
          } else if (this.userRole === 'ADMINISTRADOR') {
            this.totalOwners = response.data.totalElements ?? 0;

            // Handle auto-expansion if ownerIdFilter is present
            if (this.ownerIdFilter && this.owners.length > 0) {
              const matchedOwner = this.owners.find(
                (o) => o.id === this.ownerIdFilter,
              );
              if (matchedOwner && !this.expandedOwnerId) {
                this.toggleOwnerExpansion(matchedOwner);
              }
            }

            this.loading = false;
          }
        } else if (this.userRole === 'ADMINISTRADOR') this.loading = false;
      },
      error: () => {
        if (this.userRole === 'ADMINISTRADOR') this.loading = false;
      },
    });
  }

  /* ======================================================================
     Exportar
     ====================================================================== */

  /** La hoja de exportacion esta abierta. */
  public exportOpen = false;

  /** Se esta armando el archivo. Mientras dure, la hoja no deja confirmar. */
  public exportPreparing = false;

  /** El archivo, ya listo para entregar. */
  private exportBlob: Blob | null = null;
  private exportName = '';

  /** Cuantos viajes trae el archivo, para nombrarlo en la hoja. */
  public exportCount = 0;
  public exportError = '';

  /**
   * Pide la exportacion y prepara el archivo mientras la hoja esta abierta.
   *
   * **Por que en dos pasos.** En iOS la hoja de compartir del sistema solo se
   * abre mientras el toque que la pidio sigue vivo, y aqui hay que ir al
   * servidor por los viajes del anio: para cuando la respuesta llega, el toque
   * ya se gasto y el sistema rechaza la llamada. Con la hoja de confirmacion
   * de por medio el archivo se arma mientras el usuario la lee, y el toque de
   * "Compartir" llega con todo listo. Los otros dos reportes no la necesitan:
   * sus datos ya estan en memoria y comparten de un toque.
   */
  public async askExport(): Promise<void> {
    if (this.exportPreparing) return;

    this.exportOpen = true;
    this.exportPreparing = true;
    this.exportError = '';
    this.exportBlob = null;
    this.exportCount = 0;

    try {
      const viajes = await this.fetchYearTrips();
      this.exportCount = viajes.length;

      if (!viajes.length) {
        this.exportError =
          this.selectedStatus === CANCELLED_TRIP_STATUS
            ? 'Los viajes cancelados no se exportan: no representan transporte.'
            : 'No hay viajes registrados en ' + this.exportYear + '.';
        return;
      }

      const gastos = await this.fetchTripExpenses(viajes);
      this.exportBlob = this.buildExportSheet(viajes, gastos);
      this.exportName = xlsxFileName(
        'Viajes',
        TripsComponent.singlePlate(viajes),
        this.exportYear,
        new Date().toISOString().slice(0, 10),
      );
    } catch (error) {
      console.error('Error preparing trips export:', error);
      this.exportError = 'No se pudieron cargar los viajes del anio.';
    } finally {
      this.exportPreparing = false;
    }
  }

  /**
   * Entrega el archivo. Sin nada que esperar antes de la llamada: el toque que
   * confirma es el que abre la hoja de compartir del sistema.
   */
  public confirmExport(): void {
    const blob = this.exportBlob;
    if (!blob) return;

    this.exportOpen = false;
    void shareOrDownloadFile(blob, this.exportName, 'Viajes').then((salida) => {
      if (salida === 'failed') {
        this.toastService.showError('Error', 'No se pudo generar el archivo');
      }
    });
  }

  public cancelExport(): void {
    this.exportOpen = false;
    this.exportBlob = null;
  }

  /** El anio que se exporta: el que corre. */
  get exportYear(): number {
    return new Date().getFullYear();
  }

  /** Lo que dice la hoja mientras se prepara y cuando ya esta lista. */
  get exportMessage(): string {
    if (this.exportPreparing) return 'Preparando el archivo...';
    if (this.exportError) return this.exportError;
    const viajes =
      this.exportCount === 1 ? '1 viaje' : this.exportCount + ' viajes';
    return (
      viajes +
      ' de ' +
      this.exportYear +
      ', con los filtros que tienes puestos.'
    );
  }

  /**
   * Los viajes del anio en curso, con el mismo alcance que la lista.
   *
   * Arrastra los filtros de la pantalla -estado, busqueda, origen y destino, y
   * los que impone el rol- porque exportar tiene que dar lo que se esta
   * mirando; y les anade el anio, que la lista no filtra.
   *
   * El anio se recorta aqui y no en la consulta: el servicio de viajes filtra
   * por igualdad y por pertenencia, no por rango de fechas. Se pide una pagina
   * grande -la misma que usa la busqueda- y se descarta lo que no es del anio.
   */
  private async fetchYearTrips(): Promise<ModelTrip[]> {
    /* Los cancelados quedan fuera. Un viaje cancelado se creo mal, era una
       prueba o nunca salio: no representa transporte alguno, y su flete
       inflaria el total del archivo. Es el mismo criterio que ya aplica la
       tarjeta "Total Viajes" y que siguen los reportes. */
    const filtros = [...this.getBaseFilters(), excludeCancelledFilter()];

    if (this.selectedStatus) {
      filtros.push(new Filter('status', '=', this.selectedStatus));
    }
    if (this.searchTerm) {
      filtros.push(new Filter('manifestNumber', 'like', this.searchTerm));
    }
    if (this.originFilter) {
      filtros.push(new Filter('originId', '=', this.originFilter.toString()));
    }
    if (this.destinationFilter) {
      filtros.push(
        new Filter('destinationId', '=', this.destinationFilter.toString()),
      );
    }

    const response: any = await lastValueFrom(
      this.tripService.getTripFilter(
        new ModelFilterTable(
          filtros,
          new Pagination(20000, 0),
          new Sort('startDate', false),
        ),
      ),
    );

    const anio = this.exportYear;
    return (response?.data?.content ?? []).filter((t: ModelTrip) => {
      const fecha = toSheetDate(t.creationDate ?? t.startDate);
      return fecha != null && fecha.getFullYear() === anio;
    });
  }

  /** El nombre de una ciudad por su `id`, o el `id` si el catalogo no la
   *  tiene: en la hoja vale mas un numero que un hueco. */
  private cityLabel(id: string | undefined): string {
    if (!id) return '';
    const city = this.cities.find((c: any) => String(c.id) === String(id));
    return city ? city.name + ' (' + city.state + ')' : String(id);
  }

  /**
   * El gasto de cada viaje, sumado por `id`.
   *
   * El gasto cuelga del gasto y no del viaje, asi que hay que ir a buscarlo:
   * es la misma consulta que ya hace la lista para los viajes vacios, pero por
   * todos los del anio. Va en tandas porque los `id` viajan en la URL y un
   * anio entero no cabe en una sola.
   *
   * Si una tanda falla, sus viajes salen con gasto cero y utilidad igual al
   * flete. Vaciar el archivo entero por eso seria peor: el resto de la hoja
   * -las fechas, la ruta, el flete- no depende de esta consulta.
   */
  private async fetchTripExpenses(
    trips: ModelTrip[],
  ): Promise<Record<number, number>> {
    const ids = trips.map((t) => t.id).filter((id): id is number => id != null);
    if (!ids.length) return {};

    const TANDA = 200;
    const tandas: number[][] = [];
    for (let i = 0; i < ids.length; i += TANDA) {
      tandas.push(ids.slice(i, i + TANDA));
    }

    const totales: Record<number, number> = {};

    await Promise.all(
      tandas.map(async (tanda) => {
        try {
          const resp: any = await lastValueFrom(
            this.expenseService.getExpenseFilter(
              new ModelFilterTable(
                [new Filter('tripId', 'in', tanda.join(','))],
                new Pagination(5000, 0),
                new Sort('id', false),
              ),
            ),
          );
          (resp?.data?.content ?? []).forEach((e: any) => {
            const id = e?.tripId;
            if (id == null) return;
            totales[id] = (totales[id] || 0) + (e.amount || 0);
          });
        } catch (error) {
          console.error('Error loading trip expenses for export:', error);
        }
      }),
    );

    return totales;
  }

  /**
   * La placa, para el nombre del archivo, cuando todo lo exportado es de un
   * mismo camion.
   *
   * Sale de los viajes y no del filtro de vehiculo: asi tambien la lleva el
   * propietario que tiene uno solo y nunca toca ese filtro. Con varios camiones
   * devuelve vacio, y el nombre se queda en "Viajes - 2026": poner ahi una de
   * las placas haria pasar por de un camion lo que es de toda la flota.
   */
  private static singlePlate(trips: ModelTrip[]): string {
    const placas = new Set(
      trips
        .map((t) => Formatters.formatPlate(t.vehiclePlate ?? t.vehicle?.plate))
        .filter((placa) => placa !== ''),
    );
    return placas.size === 1 ? [...placas][0] : '';
  }

  /** Arma la hoja con el constructor que comparte con Rentabilidad: las dos
   *  pantallas exportan el mismo archivo, y solo cambia el periodo. */
  private buildExportSheet(
    trips: ModelTrip[],
    expensesByTripId: Record<number, number>,
  ): Blob {
    return buildTripsSheet(trips, {
      periodLabel: String(this.exportYear),
      expensesByTripId,
      cityName: (id) => this.cityLabel(id),
      notes: [
        'Viajes creados en ' + this.exportYear + ', hasta hoy.',
        this.selectedStatus
          ? 'Filtro de estado: ' + this.selectedStatus
          : 'Todos los estados.',
        'Los viajes cancelados quedan fuera: no representan transporte.',
        'El gasto es el imputado a cada viaje; la utilidad, el flete menos ese gasto.',
        'Generado el ' + new Date().toLocaleString('es-CO'),
      ],
    });
  }

  private getBaseFilters(): Filter[] {
    let filtros: Filter[] = [];

    if (this.driverIdFilter) {
      filtros.push(
        new Filter('driver.id', '=', this.driverIdFilter.toString()),
      );
    } else if (
      this.vehicleIdFilter &&
      (this.userRole === 'PROPIETARIO' ||
        this.userRole === 'CONDUCTOR' ||
        this.userRole === 'ADMINISTRADOR')
    ) {
      filtros.push(
        new Filter('vehicle.id', '=', this.vehicleIdFilter.toString()),
      );
    } else if (this.userRole === 'CONDUCTOR' && this.loggedInDriverId != null) {
      filtros.push(
        new Filter('driver.id', '=', this.loggedInDriverId.toString()),
      );
    } else if (
      this.userRole === 'PROPIETARIO' ||
      (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter)
    ) {
      const vehicleIds = this.vehicles
        .map((v) => v.id)
        .filter((id) => id != null)
        .join(',');

      if (vehicleIds) {
        filtros.push(new Filter('vehicle.id', 'in', vehicleIds));
      } else {
        // If we are scoped to an owner but they have no vehicles,
        // add a dummy filter to avoid returning ALL trips globally.
        filtros.push(new Filter('vehicle.id', '=', '-1'));
      }
    }
    return filtros;
  }

  private updateStatusCounts(vehicleIds?: string): void {
    const filtros = vehicleIds
      ? [new Filter('vehicle.id', 'in', vehicleIds)]
      : this.getBaseFilters();

    // For non-ADMINISTRADOR roles (like PROPIETARIO), make counts search-aware
    // Also make them search-aware for expanded owner in Admin view (vehicleIds provided)
    if (
      this.userRole !== 'ADMINISTRADOR' ||
      this.isSearchingTrips ||
      vehicleIds
    ) {
      if (this.searchTerm) {
        filtros.push(new Filter('manifestNumber', 'like', this.searchTerm));
      }
      if (this.originFilter) {
        filtros.push(new Filter('originId', '=', this.originFilter.toString()));
      }
      if (this.destinationFilter) {
        filtros.push(
          new Filter('destinationId', '=', this.destinationFilter.toString()),
        );
      }
    }

    forkJoin({
      /* El total no lleva estado, asi que es el unico que arrastraria las
         bajas logicas: sin excluirlas dejaba de cuadrar con la suma de las
         otras tres tarjetas. */
      total: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, excludeCancelledFilter()],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      inProgress: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, new Filter('status', '=', 'En Curso')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      pending: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, new Filter('status', '=', 'Pendiente')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
      completed: this.tripService.getTripFilter(
        new ModelFilterTable(
          [...filtros, new Filter('status', '=', 'Completado')],
          new Pagination(1, 0),
          new Sort('id', true),
        ),
      ),
    }).subscribe({
      next: (resps: any) => {
        this.totalTrips = resps.total?.data?.totalElements ?? 0;
        this.inProgressTrips = resps.inProgress?.data?.totalElements ?? 0;
        this.pendingTrips = resps.pending?.data?.totalElements ?? 0;
        this.completedTrips = resps.completed?.data?.totalElements ?? 0;

        if (this.userRole === 'ADMINISTRADOR' && !vehicleIds) {
          this.globalStats = {
            total: this.totalTrips,
            inProgress: this.inProgressTrips,
            completed: this.completedTrips,
            pending: this.pendingTrips,
          };
        }
      },
    });
  }

  /**
   * Los viajes vacíos muestran en la tarjeta lo que costaron en vez del flete.
   * Se resuelve en una sola consulta con `tripId in (...)` para no disparar
   * una petición por tarjeta.
   */
  private loadEmptyTripExpenses(): void {
    const emptyTripIds = this.allTrips
      .filter((t) => t.tripType === 'VACIO' && t.id != null)
      .map((t) => t.id as number);

    if (emptyTripIds.length === 0) {
      this.expensesByTripId = {};
      return;
    }

    const filter = new ModelFilterTable(
      [new Filter('tripId', 'in', emptyTripIds.join(','))],
      new Pagination(500, 0),
      new Sort('id', false),
    );

    this.expenseService.getExpenseFilter(filter).subscribe({
      next: (resp: any) => {
        const expenses = resp?.data?.content ?? [];
        const totals: Record<number, number> = {};

        for (const expense of expenses) {
          // Categorías 1 (Vehículo), 2 (Conductor), 3 (Viaje). Se exceptúa 4 (Mantenimiento).
          const typeId = expense.category?.expenseTypeId;
          if (typeId !== 1 && typeId !== 2 && typeId !== 3) continue;

          const tripId = Number(expense.tripId);
          totals[tripId] = (totals[tripId] ?? 0) + (expense.amount || 0);
        }

        this.expensesByTripId = totals;
      },
      error: (err: any) => {
        console.error('Error loading expenses for empty trips:', err);
        this.expensesByTripId = {};
      },
    });
  }

  loadTrips(): void {
    const filtros = this.getBaseFilters();

    // Only update global counters if NO owner is expanded (Admin)
    if (!this.expandedOwnerId) {
      this.updateStatusCounts();
    }

    if (this.selectedStatus) {
      filtros.push(new Filter('status', '=', this.selectedStatus));
    }

    if (this.searchTerm && !this.isSearchActive) {
      filtros.push(new Filter('manifestNumber', 'like', this.searchTerm));
    }

    if (this.originFilter) {
      filtros.push(new Filter('originId', '=', this.originFilter.toString()));
    }
    if (this.destinationFilter) {
      filtros.push(
        new Filter('destinationId', '=', this.destinationFilter.toString()),
      );
    }

    const fetchRows = this.isSearchActive ? 20000 : this.rows;
    const fetchPage = this.isSearchActive ? 0 : this.page;

    const filter = new ModelFilterTable(
      filtros,
      new Pagination(fetchRows, fetchPage),
      new Sort('startDate', false),
    );

    this.loading = true;
    this.tripService.getTripFilter(filter).subscribe({
      next: (response: any) => {
        this.allTrips = response?.data?.content ?? [];
        /* Total de filas que devuelve esta consulta, cancelados incluidos: es
           lo que la lista pinta y lo que debe paginar. La tarjeta "Total
           Viajes" cuenta otra cosa —viajes reales— y no sirve aquí: con ella,
           las ultimas paginas de un listado con bajas se volvian
           inalcanzables. */
        this.listTotal = response?.data?.totalElements ?? this.allTrips.length;
        this.loadEmptyTripExpenses();

        /**
         * Los propietarios que faltan solo se traen buscando.
         *
         * Buscando, la lista de tarjetas la mandan los viajes que coinciden:
         * hay que mostrar a su dueño esté o no en la página, y por eso se pide
         * aparte. En el listado paginado manda la página de propietarios, y
         * agregarle los dueños de los viajes recientes la inflaba por encima
         * de las nueve tarjetas que el paginador cuenta. De ahí salían las
         * once o doce tarjetas y los propietarios repetidos entre páginas.
         *
         * No se esconde nada: la tarjeta cerrada no muestra viajes —los pide
         * al abrirse— así que un viaje cuyo dueño cae en otra página se sigue
         * viendo al abrir esa tarjeta o al buscarlo.
         */
        if (this.userRole === 'ADMINISTRADOR' && this.isSearchActive) {
          const getOwnerId = (t: ModelTrip): number | undefined => {
            if (t.driver?.ownerId) return t.driver.ownerId;
            if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
              return t.vehicle.owners[0].ownerId;
            }
            return undefined;
          };

          const currentOwnerIds = new Set(this.owners.map((o) => o.id));
          const missingOwnerIds = [
            ...new Set(
              this.allTrips
                .map((t) => getOwnerId(t))
                .filter(
                  (id): id is number =>
                    id != null &&
                    !currentOwnerIds.has(id) &&
                    id !== this.ownerIdFilter,
                ),
            ),
          ];

          if (missingOwnerIds.length > 0) {
            this.fetchMissingOwners(missingOwnerIds);
            return;
          }
        }

        this.applyFilter(true);
      },
      error: (error: any) => {
        console.error('Error loading trips:', error);
        this.toastService.showError('Error', 'Error al cargar viajes');
        this.loading = false;
      },
    });
  }

  fetchMissingOwners(ids: number[]): void {
    const filter = new ModelFilterTable(
      [new Filter('id', 'in', ids.join(','))],
      new Pagination(ids.length, 0),
      new Sort('id', true),
    );
    this.ownerService.getOwnerFilter(filter).subscribe({
      next: (response: any) => {
        if (response?.data?.content) {
          this.owners = [...this.owners, ...response.data.content];
          this.applyFilter(true);
        }
      },
      error: (err) => {
        console.error('Error fetching missing owners:', err);
        this.applyFilter(true);
      },
    });
  }

  calculateStats(trips?: ModelTrip[]): void {
    /* Las bajas logicas siguen en la lista, pero no en las tarjetas: el total
       cuenta viajes reales, no filas. */
    const source = (trips ?? this.allTrips).filter(
      (t) => !isCancelledTrip(t.status),
    );

    const inProgress = source.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'IN_PROGRESS' || status === 'EN CURSO';
    }).length;

    const completed = source.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'COMPLETED' || status === 'COMPLETADO';
    }).length;

    const pending = source.filter((t) => {
      const status = (t.status || '').toUpperCase();
      return status === 'PENDING' || status === 'PENDIENTE';
    }).length;

    if (trips) {
      // Temporary/Filtered stats
      this.totalTrips = source.length;
      this.inProgressTrips = inProgress;
      this.completedTrips = completed;
      this.pendingTrips = pending;
    } else {
      // Master stats
      this.inProgressTrips = inProgress;
      this.completedTrips = completed;
      this.pendingTrips = pending;
    }
  }

  applyFilter(fromLoadTrips: boolean = false): void {
    if (!fromLoadTrips) {
      this.isSearchActive = this.isSearchingTrips;
    }

    if (this.userRole === 'ADMINISTRADOR') {
      const filtersActive =
        !!this.searchTerm || !!this.originFilter || !!this.destinationFilter;

      // Case 1: Manual clearing of all filters (e.g. backspacing search input)
      if (!filtersActive && !fromLoadTrips) {
        if (this.isSearchActive || this.expandedOwnerId) {
          this.expandedOwnerId = null;
          this.isSearchActive = false;
          this.updateStatusCounts();
          this.page = 0;
          this.loadOwners();
          this.loading = false;
          return;
        }
      }

      // Case 2: Global Search (when NO owner is open)
      if (this.isSearchActive && !fromLoadTrips) {
        this.page = 0;
        this.expandedOwnerId = null; // Reset expansion when starting new global search
        this.loadTrips();
        return;
      }

      // Case 3: Filtering WITHIN an open card
      if (this.expandedOwnerId && filtersActive && !fromLoadTrips) {
        this.loadTripsForAdmin(this.expandedOwnerId);
        return;
      }

      // Case 4: Default return to main list
      if (!this.isSearchActive && !this.expandedOwnerId) {
        if (!fromLoadTrips) {
          this.page = 0;
          this.loadOwners();

          this.totalTrips = this.globalStats.total;
          this.inProgressTrips = this.globalStats.inProgress;
          this.completedTrips = this.globalStats.completed;
          this.pendingTrips = this.globalStats.pending;
        }
        this.loading = false;
        return;
      }
    } else if (this.userRole !== 'ADMINISTRADOR' && !fromLoadTrips) {
      this.page = 0;
      this.loadTrips();
      return;
    }

    let filtered = this.allTrips;

    if (this.originFilter) {
      filtered = filtered.filter(
        (t) => String(t.originId) === String(this.originFilter),
      );
    }

    if (this.destinationFilter) {
      filtered = filtered.filter(
        (t) => String(t.destinationId) === String(this.destinationFilter),
      );
    }

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter((t) => {
        return (
          (t.numberTrip?.toLowerCase() || '').includes(term) ||
          (t.manifestNumber?.toLowerCase() || '').includes(term) ||
          (t.vehicle?.plate?.toLowerCase() || '').includes(term) ||
          (t.driver?.name?.toLowerCase() || '').includes(term)
        );
      });
    }

    if (this.userRole === 'ADMINISTRADOR' && this.isSearchActive) {
      this.calculateStats(filtered);

      // Extract unique owner IDs from the matching trips
      const getOwnerId = (t: ModelTrip): number | undefined => {
        if (t.driver?.ownerId) return t.driver.ownerId;
        if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
          return t.vehicle.owners[0].ownerId;
        }
        return undefined;
      };

      const matchingOwnerIds = [
        ...new Set(
          filtered.map((t) => getOwnerId(t)).filter((id) => id != null),
        ),
      ] as number[];

      // Show ONLY owners who have matching trips
      this.owners = this.owners.filter(
        (o) => o.id != null && matchingOwnerIds.includes(o.id),
      );
      this.totalOwners = this.owners.length;

      // Auto-expand the first owner if it's a new search
      if (fromLoadTrips && this.owners.length > 0 && !this.expandedOwnerId) {
        this.toggleOwnerExpansion(this.owners[0]);
      }
    }

    this.buildGroups(filtered);
    this.loading = false;
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  clearFilters(): void {
    this.originFilter = null;
    this.destinationFilter = null;
    this.searchTerm = '';
    this.expandedOwnerId = null;

    /* El propietario es un filtro más, así que "Limpiar" también lo suelta.
       Soltarlo rehace las consultas y la URL, y eso ya lo sabe hacer su propio
       manejador: llamarlo evita repetir aquí la misma secuencia. */
    if (this.userRole === 'ADMINISTRADOR' && this.ownerIdFilter != null) {
      this.onOwnerFilterChange(null);
      return;
    }

    this.updateStatusCounts();
    this.applyFilter();
  }

  buildGroups(trips: ModelTrip[]): void {
    const groups: TripOwnerGroup[] = [];
    const getOwnerId = (t: ModelTrip): number | undefined => {
      if (t.driver?.ownerId) return t.driver.ownerId;
      if (t.vehicle?.owners && t.vehicle.owners.length > 0) {
        return t.vehicle.owners[0].ownerId;
      }
      return undefined;
    };

    if (this.userRole === 'PROPIETARIO' || this.userRole === 'CONDUCTOR') {
      const ownerId = this.loggedInOwnerId;
      const owner =
        this.loggedInOwner ??
        this.owners.find((o) => o.id === ownerId) ??
        new ModelOwner(
          ownerId ?? undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'Mi Propietario',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          'Activo',
        );
      const ownerTrips = trips.filter((t) => getOwnerId(t) === ownerId);
      groups.push({ owner, trips: ownerTrips });
      this.groupedTrips = groups;
      return;
    }

    if (this.ownerIdFilter != null && this.filteredOwner) {
      const ownerTrips = trips.filter(
        (t) => getOwnerId(t) === this.ownerIdFilter,
      );
      groups.push({
        owner: this.filteredOwner,
        trips: ownerTrips,
      });
    }

    const ownerIds = [
      ...new Set(
        trips.map((t) => getOwnerId(t)).filter((id) => id !== undefined),
      ),
    ] as number[];
    ownerIds.forEach((oid) => {
      if (oid === this.ownerIdFilter) return;
      const owner = this.owners.find((o) => o.id === oid);
      if (owner) {
        const ownerTrips = trips.filter((t) => getOwnerId(t) === oid);
        groups.push({
          owner,
          trips: ownerTrips,
        });
      }
    });

    groups.sort((a, b) =>
      (a.owner.name || '').localeCompare(b.owner.name || '', 'es'),
    );

    this.groupedTrips = groups;
  }

  toggleOwnerExpansion(owner: ModelOwner, isManual: boolean = false): void {
    if (this.userRole !== 'ADMINISTRADOR') return;

    // If manual click, clear vehicle filter to show all owner's trips
    if (isManual && this.vehicleIdFilter) {
      this.vehicleIdFilter = null;
      this.router.navigate([], {
        queryParams: { vehicleId: null },
        queryParamsHandling: 'merge',
      });
    }

    if (this.expandedOwnerId === owner.id) {
      this.expandedOwnerId = null;
      this.expandedOwnerPage = 0;
      this.ownerTrips = [];
      this.expandedOwnerVehiclesCount = 0;

      // Restore global stats or refresh them if context changed
      if (isManual) {
        this.updateStatusCounts();
      } else {
        this.totalTrips = this.globalStats.total;
        this.inProgressTrips = this.globalStats.inProgress;
        this.completedTrips = this.globalStats.completed;
        this.pendingTrips = this.globalStats.pending;
      }
    } else {
      this.expandedOwnerId = owner.id ?? null;
      if (this.expandedOwnerId) {
        this.isLoadingExpandedTrips = true;
        this.ownerTrips = []; // Clear previous to avoid flicker
        this.expandedOwnerVehiclesCount = 0;
        this.loadTripsForAdmin(this.expandedOwnerId);
      }
    }
  }

  private loadTripsForAdmin(ownerId: number, page: number = 0): void {
    const vehicleFilter = new ModelFilterTable(
      [new Filter('owner.id', '=', ownerId.toString())],
      new Pagination(100, 0),
      new Sort('id', true),
    );

    this.vehicleService.getVehicleOwnerFilter(vehicleFilter).subscribe({
      next: (respVehicles: any) => {
        const vehicles = (respVehicles?.data?.content ?? []).filter(
          (v: any) => v.status !== 'Vendido',
        );
        this.expandedOwnerVehiclesCount = vehicles.length;
        const vehicleIds = this.vehicleIdFilter
          ? this.vehicleIdFilter.toString()
          : vehicles
              .map((v: any) => v.id)
              .filter((id: any) => id != null)
              .join(',');

        if (!vehicleIds) {
          this.ownerTrips = [];
          this.totalExpandedTrips = 0;
          this.calculateStats(this.ownerTrips);
          this.isLoadingExpandedTrips = false;
          return;
        }

        const tripFiltros = [new Filter('vehicle.id', 'in', vehicleIds)];
        if (this.selectedStatus) {
          tripFiltros.push(new Filter('status', '=', this.selectedStatus));
        }
        if (this.searchTerm) {
          tripFiltros.push(
            new Filter('manifestNumber', 'like', this.searchTerm),
          );
        }
        if (this.originFilter) {
          tripFiltros.push(
            new Filter('originId', '=', this.originFilter.toString()),
          );
        }
        if (this.destinationFilter) {
          tripFiltros.push(
            new Filter('destinationId', '=', this.destinationFilter.toString()),
          );
        }

        // Update top-level status cards with owner-specific totals
        this.updateStatusCounts(vehicleIds);

        const tripFilter = new ModelFilterTable(
          tripFiltros,
          new Pagination(this.expandedOwnerRows, page),
          new Sort('startDate', false),
        );

        this.tripService.getTripFilter(tripFilter).subscribe({
          next: (respTrips: any) => {
            this.ownerTrips = respTrips?.data?.content ?? [];
            this.totalExpandedTrips = respTrips?.data?.totalElements ?? 0;
            this.isLoadingExpandedTrips = false;
          },
          error: () => {
            this.ownerTrips = [];
            this.totalExpandedTrips = 0;
            this.isLoadingExpandedTrips = false;
            this.expandedOwnerVehiclesCount = 0;
          },
        });
      },
      error: () => {
        this.ownerTrips = [];
        this.calculateStats(this.ownerTrips);
        this.isLoadingExpandedTrips = false;
        this.expandedOwnerVehiclesCount = 0;
      },
    });
  }

  get dataTotal(): number {
    if (this.userRole === 'ADMINISTRADOR') {
      return this.totalOwners;
    }
    if (this.selectedStatus === 'En Curso') return this.inProgressTrips;
    if (this.selectedStatus === 'Pendiente') return this.pendingTrips;
    if (this.selectedStatus === 'Completado') return this.completedTrips;
    return this.listTotal;
  }

  get itemsShownCount(): number {
    return this.userRole === 'ADMINISTRADOR'
      ? this.owners.length
      : this.groupedTrips.reduce((acc, g) => acc + g.trips.length, 0);
  }

  get filteredOwnerTrips(): ModelTrip[] {
    return this.ownerTrips;
  }

  get paginatedFilteredOwnerTrips(): ModelTrip[] {
    return this.ownerTrips;
  }

  get expandedTotalPages(): number {
    return Math.ceil(this.totalExpandedTrips / this.expandedOwnerRows);
  }

  get expandedDesktopPages(): number[] {
    return PaginationUtils.getVisiblePages(
      this.expandedOwnerPage,
      this.expandedTotalPages,
      12,
    );
  }

  get expandedMobilePages(): number[] {
    return PaginationUtils.getVisiblePages(
      this.expandedOwnerPage,
      this.expandedTotalPages,
      4,
    );
  }

  changeExpandedPage(newPage: number): void {
    if (
      newPage >= 0 &&
      newPage < this.expandedTotalPages &&
      newPage !== this.expandedOwnerPage
    ) {
      this.expandedOwnerPage = newPage;
      if (this.expandedOwnerId) {
        this.isLoadingExpandedTrips = true;
        this.loadTripsForAdmin(this.expandedOwnerId, newPage);
      }
    }
  }

  /**
   * Sin vehículos no hay cupo de viajes posible: el bloqueo no es por viaje
   * activo sino porque falta registrar el vehículo.
   */
  get hasNoVehicles(): boolean {
    if (this.userRole === 'ADMINISTRADOR') {
      return !!this.expandedOwnerId && this.expandedOwnerVehiclesCount === 0;
    }

    if (this.userRole === 'PROPIETARIO') {
      return this.vehicles.length === 0;
    }

    return false;
  }

  get showActiveTripAlert(): boolean {
    // El caso sin vehículos tiene su propio aviso
    if (this.hasNoVehicles) return false;

    if (this.userRole === 'ADMINISTRADOR') {
      // For Admin, only show when an owner is expanded and has active trips equal or more than his vehicles count
      if (!this.expandedOwnerId) return false;
      const activeOwnerTripsCount = this.ownerTrips.filter((t) => {
        const s = (t.status || '').toUpperCase();
        return s === 'EN CURSO' || s === 'IN_PROGRESS';
      }).length;
      return activeOwnerTripsCount >= this.expandedOwnerVehiclesCount;
    }

    if (this.userRole === 'PROPIETARIO') {
      // If owner has 3 vehicles, they can have up to 3 trips in progress
      return this.inProgressTrips >= this.vehicles.length;
    }

    // For CONDUCTOR, check global inProgress count (they have 1 vehicle)
    return this.inProgressTrips > 0;
  }

  get totalPages(): number {
    return Math.ceil(this.dataTotal / this.rows);
  }

  get desktopPages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 12);
  }

  get mobilePages(): number[] {
    return PaginationUtils.getVisiblePages(this.page, this.totalPages, 4);
  }

  changePage(newPage: number): void {
    if (newPage >= 0 && newPage < this.totalPages && newPage !== this.page) {
      this.page = newPage;
      this.expandedOwnerId = null;
      this.ownerTrips = [];
      if (this.userRole === 'ADMINISTRADOR' && !this.isSearchActive) {
        this.loadOwners();
      } else {
        this.loadTrips();
      }
    }
  }

  toggleOffcanvas(trip?: ModelTrip): void {
    /* La tarjeta ya no ofrece "Editar" en un viaje dado de baja; esto cubre
       las demas vias de llegar aqui con uno. */
    if (trip && isCancelledTrip(trip.status)) {
      this.toastService.showError(
        'Acción denegada',
        'El viaje está cancelado. Cambia su estado desde el detalle para poder editarlo.',
      );
      return;
    }

    if (!this.isOffcanvasOpen && !trip) {
      // Sin vehículos registrados no hay viaje posible: se avisa antes de
      // evaluar el bloqueo por viaje en curso
      if (this.hasNoVehicles) {
        this.showingNoVehiclesWarning = true;
        this.showingActiveTripWarning = false;
        this.revealWarning();
        return;
      }
      // If opening for a NEW trip, check if there's already an active one
      if (this.showActiveTripAlert) {
        this.showingActiveTripWarning = true;
        this.revealWarning();
        return;
      }
    }
    this.showingActiveTripWarning = false;
    this.showingNoVehiclesWarning = false;
    this.isOffcanvasOpen = !this.isOffcanvasOpen;
    if (this.isOffcanvasOpen) {
      this.editingTrip = trip ?? null;
    }
  }

  // ── Cambio de estado desde la etiqueta de la tarjeta ───────────────

  /**
   * Cambio elegido en una tarjeta y aún sin guardar. Mientras exista, el
   * diálogo de confirmación está en pantalla.
   */
  pendingStatusChange: { trip: ModelTrip; status: string } | null = null;
  isSavingStatus = false;

  /** El diálogo que toca —qué se pregunta y de qué color— según a dónde va el
   *  viaje. Los textos son los mismos que muestra el detalle. */
  get statusConfirmation(): TripStatusConfirmation | null {
    const cambio = this.pendingStatusChange;
    return cambio
      ? tripStatusConfirmation(cambio.trip.status, cambio.status)
      : null;
  }

  onTripStatusChange(event: { trip: ModelTrip; status: string }): void {
    /* Un viaje dado de baja no lo revive quien no pudo darlo de baja: si no,
       el conductor lo sacaría de Cancelado y lo volvería a dejar donde
       quisiera. La tarjeta ya no le abre el menú; esto cubre lo demás. */
    if (!canChangeTripStatus(event.trip.status, this.userRole)) {
      this.toastService.showError(
        'Acción denegada',
        'No tienes permiso para cambiar el estado de este viaje.',
      );
      return;
    }

    /* El menú de la tarjeta no le ofrece "Cancelado" al conductor; esto cubre
       el estado que llegue por cualquier otra vía. */
    if (!canSetTripStatus(event.status, this.userRole)) {
      this.toastService.showError(
        'Acción denegada',
        'Solo el propietario o un administrador pueden cancelar un viaje.',
      );
      return;
    }

    /* Completar y cancelar se confirman igual que en el detalle; el resto de
       cambios se guardan directo, que es lo que hace útil el atajo. */
    if (statusNeedsConfirmation(event.trip.status, event.status)) {
      this.pendingStatusChange = event;
      return;
    }
    this.saveStatusChange(event.trip, event.status);
  }

  confirmStatusChange(): void {
    if (!this.pendingStatusChange) return;
    const { trip, status } = this.pendingStatusChange;
    this.saveStatusChange(trip, status);
  }

  cancelStatusChange(): void {
    this.pendingStatusChange = null;
  }

  private saveStatusChange(trip: ModelTrip, status: string): void {
    this.isSavingStatus = true;

    this.tripService.createTrip(applyTripStatusChange(trip, status)).subscribe({
      next: () => {
        this.isSavingStatus = false;
        this.pendingStatusChange = null;
        this.toastService.showSuccess(
          'Gestión de Viajes',
          `Viaje actualizado a "${status}"`,
        );
        this.notificationsService.refreshNotifications();

        /* Recarga completa: el cambio mueve los contadores de las tarjetas de
           estado, y con un propietario abierto también su lista. */
        this.loadTrips();
        if (this.userRole === 'ADMINISTRADOR' && this.expandedOwnerId) {
          this.loadTripsForAdmin(this.expandedOwnerId);
        }
      },
      error: (err) => {
        console.error('Error updating trip status:', err);
        this.isSavingStatus = false;
        this.pendingStatusChange = null;
        this.toastService.showError(
          'Error',
          'No se pudo actualizar el estado del viaje',
        );
      },
    });
  }

  /**
   * Sube la pantalla al aviso que se acaba de mostrar.
   *
   * Los avisos van sobre las tarjetas de estado, y al viaje se le da a crear
   * desde el botón flotante o desde el final de la lista: sin esto la acción
   * no hacía nada visible y el motivo quedaba fuera de pantalla.
   */
  private revealWarning(): void {
    scrollToTop(this.scroller);
  }

  dismissActiveTripWarning(): void {
    this.showingActiveTripWarning = false;
  }

  dismissNoVehiclesWarning(): void {
    this.showingNoVehiclesWarning = false;
  }

  toggleStatusHelp(): void {
    this.showingStatusHelp = !this.showingStatusHelp;
  }

  dismissStatusHelp(): void {
    this.showingStatusHelp = false;
  }

  filterByStatus(status: string | null): void {
    this.selectedStatus = status;
    this.page = 0;
    this.loadTrips();

    if (this.userRole === 'ADMINISTRADOR' && this.expandedOwnerId) {
      this.loadTripsForAdmin(this.expandedOwnerId);
    }
  }

  onTripSaved(savedTrip?: ModelTrip): void {
    // Keep a reference to the trip being edited before the offcanvas closes
    const tripBeforeSave = this.editingTrip;

    this.loadTrips();

    if (
      savedTrip &&
      (this.userRole === 'PROPIETARIO' ||
        this.userRole === 'ADMINISTRADOR' ||
        this.userRole === 'CONDUCTOR')
    ) {
      const originCity = this.cities.find(
        (c) => String(c.id) === String(savedTrip.originId),
      );
      const destCity = this.cities.find(
        (c) => String(c.id) === String(savedTrip.destinationId),
      );
      const returnCity =
        savedTrip.tripType === 'REDONDO' && savedTrip.returnDestinationId
          ? this.cities.find(
              (c) => String(c.id) === String(savedTrip.returnDestinationId),
            )
          : null;

      const originName = originCity?.name || 'N/A';
      const destName = destCity?.name || 'N/A';

      this.latestTripOrigin = originName;
      this.latestTripDestination = destName;
      this.latestTripReturnDestination =
        savedTrip.tripType === 'REDONDO' && savedTrip.returnDestinationId
          ? returnCity?.name || 'N/A'
          : '';
      this.latestTripOriginQuery = locationQuery(originName, originCity);
      this.latestTripDestinationQuery = locationQuery(destName, destCity);
      this.latestTripReturnDestinationQuery = this.latestTripReturnDestination
        ? locationQuery(this.latestTripReturnDestination, returnCity)
        : '';

      // Find the full vehicle object to get the correct number of axles
      // Try the vehicles list first, then fallback to the nested object in the trip being edited
      const vehicleId = savedTrip.vehicleId || tripBeforeSave?.vehicleId;
      const fullVehicle =
        this.vehicles.find((v) => String(v.id) === String(vehicleId)) ||
        (tripBeforeSave?.vehicleId === vehicleId
          ? tripBeforeSave?.vehicle
          : null);

      this.latestTripAxles = fullVehicle?.numberOfAxles || 2;
      this.latestTripTollContext = tollContextFromTrip(
        savedTrip,
        fullVehicle?.numberOfAxles,
      );

      // Sin ciudades no hay ruta posible: se evita la consulta
      if (originName !== 'N/A' && destName !== 'N/A') {
        // El formulario se mantiene abierto mientras se calcula la ruta, para
        // no dejar la pantalla vacía; lo cierra `onRouteReady`
        this.isTripInfoOpen = true;
        return;
      }
    }

    this.toggleOffcanvas();
  }

  closeTripInfo(): void {
    this.isTripInfoOpen = false;
  }

  /** La ruta ya está lista: recién ahora se cierra el formulario */
  onRouteReady(): void {
    this.closeTripForm();
  }

  /**
   * No se pudo calcular la ruta: el panel no se abre y el viaje ya quedó
   * guardado, así que no se informa nada adicional al usuario.
   */
  onRouteUnavailable(): void {
    this.isTripInfoOpen = false;
    this.closeTripForm();
  }

  /** El usuario pudo haber cerrado el formulario mientras se calculaba */
  private closeTripForm(): void {
    if (this.isOffcanvasOpen) {
      this.toggleOffcanvas();
    }
  }
}
