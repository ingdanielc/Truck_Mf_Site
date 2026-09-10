import { ModelTrip } from '../models/trip-model';
import { Formatters } from './formatters';
import { buildXlsx, SHEET_COLORS } from './xlsx';

/**
 * La hoja de viajes: una fila por viaje, con lo que el viaje factura y lo que
 * cuesta.
 *
 * **Es una sola y la usan dos pantallas.** El listado de Viajes la saca del
 * año corrido; Rentabilidad, del periodo elegido en el tablero. Fuera de eso
 * son el mismo archivo —las mismas columnas, en el mismo orden y con el mismo
 * nombre—, y por eso se arma en un solo sitio: dos constructores parecidos
 * acaban divergiendo en la tercera columna que alguien añade a uno solo.
 *
 * **De dónde salen las cifras.** El flete, el anticipo y el saldo vienen del
 * viaje. El gasto no: cuelga del gasto, no del viaje, así que cada pantalla lo
 * resuelve por su lado y lo entrega aquí ya sumado por viaje. La utilidad es
 * la resta, y se calcula aquí para que las dos hojas la entiendan igual.
 */
export interface TripsSheetOptions {
  /** Rótulo del periodo: "2026", "Agosto 2026". Nombra la pestaña. */
  periodLabel: string;

  /** Gasto de cada viaje, por `id`. Lo que no esté cuenta como cero. */
  expensesByTripId: Record<number, number>;

  /**
   * Flete de cada viaje, por `id`, cuando quien exporta ya lo tiene calculado.
   *
   * Lo manda Rentabilidad: sus cifras salen del reporte agregado, y son las
   * que el usuario está viendo en la tabla. Sin esto, la hoja podría cerrar
   * en un número distinto del de la pantalla desde la que se pidió.
   */
  freightByTripId?: Record<number, number>;

  /** El nombre de una ciudad por su `id`. Cada pantalla tiene su catálogo. */
  cityName: (id?: string) => string;

  /** Líneas al pie: de qué es el archivo y con qué filtros salió. */
  notes: string[];
}

/** Las dieciocho columnas, en el orden en que se leen. */
const COLUMNS = [
  { header: 'Viaje', width: 10 },
  { header: 'Manifiesto', width: 16 },
  { header: 'Estado', width: 13 },
  { header: 'Tipo', width: 12 },
  { header: 'Placa', width: 11 },
  { header: 'Conductor', width: 24 },
  { header: 'Empresa', width: 26 },
  { header: 'Origen', width: 24 },
  { header: 'Destino', width: 24 },
  { header: 'Creado', width: 13, format: 'date' as const },
  { header: 'Salida', width: 13, format: 'date' as const },
  { header: 'Llegada', width: 13, format: 'date' as const },
  { header: 'Días', width: 8, format: 'number' as const },
  { header: 'Flete', width: 16, format: 'money' as const },
  { header: 'Anticipo', width: 16, format: 'money' as const },
  { header: 'Saldo', width: 16, format: 'money' as const },
  { header: 'Gastos', width: 16, format: 'money' as const },
  { header: 'Utilidad', width: 16, format: 'money' as const },
];

/** Cuántas columnas de texto hay entre el rótulo del total y la primera cifra. */
const HUECOS_DEL_TOTAL = 12;

export function toSheetDate(value: string | Date | undefined): Date | null {
  if (!value) return null;
  const fecha = new Date(value);
  return isNaN(fecha.getTime()) ? null : fecha;
}

export function buildTripsSheet(
  trips: ModelTrip[],
  options: TripsSheetOptions,
): Blob {
  const fleteDe = (t: ModelTrip): number => {
    const propio = t.id != null ? options.freightByTripId?.[t.id] : undefined;
    return propio ?? t.freight ?? 0;
  };
  const gastoDe = (t: ModelTrip): number =>
    (t.id != null ? options.expensesByTripId[t.id] : 0) || 0;

  const flete = trips.reduce((a, t) => a + fleteDe(t), 0);
  const anticipo = trips.reduce((a, t) => a + (t.advancePayment || 0), 0);
  const saldo = trips.reduce((a, t) => a + (t.balance || 0), 0);
  const gastos = trips.reduce((a, t) => a + gastoDe(t), 0);

  return buildXlsx({
    name: `Viajes ${options.periodLabel}`,
    headerColor: SHEET_COLORS.viajes,
    columns: COLUMNS,
    rows: trips.map((t) => {
      const ingreso = fleteDe(t);
      const gasto = gastoDe(t);
      return [
        t.numberTrip ? `#${t.numberTrip}` : '',
        t.manifestNumber,
        t.status,
        /* Los viajes anteriores a la funcionalidad no traen tipo, y son
           cargados: es el mismo criterio que aplican las gráficas. */
        Formatters.titleCase(t.tripType) || 'Cargado',
        Formatters.formatPlate(t.vehiclePlate ?? t.vehicle?.plate),
        Formatters.titleCase(t.driver?.name),
        Formatters.titleCase(t.company),
        options.cityName(t.originId),
        options.cityName(t.destinationId),
        toSheetDate(t.creationDate),
        toSheetDate(t.startDate),
        toSheetDate(t.endDate),
        t.numberOfDays ?? null,
        ingreso,
        t.advancePayment ?? 0,
        t.balance ?? 0,
        gasto,
        ingreso - gasto,
      ];
    }),
    totals: [
      `Total (${trips.length})`,
      ...new Array(HUECOS_DEL_TOTAL).fill(null),
      flete,
      anticipo,
      saldo,
      gastos,
      flete - gastos,
    ],
    notes: options.notes,
  });
}
