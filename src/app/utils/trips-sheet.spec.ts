import { ModelTrip } from '../models/trip-model';
import { buildTripsSheet, toSheetDate } from './trips-sheet';

/** El ZIP va sin comprimir, así que el XML se puede leer tal cual. */
async function contenido(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let texto = '';
  for (let i = 0; i < bytes.length; i++) texto += String.fromCharCode(bytes[i]);
  return texto;
}

const VIAJE: ModelTrip = {
  id: 1,
  numberTrip: '7',
  manifestNumber: 'M-7',
  status: 'Completado',
  tripType: 'CARGADO',
  vehiclePlate: 'abc123',
  driver: { name: 'JUAN PEREZ' },
  company: 'envia sas',
  originId: '1',
  destinationId: '2',
  freight: 4000000,
  advancePayment: 1000000,
  balance: 3000000,
};

const OPCIONES = {
  periodLabel: '2026',
  expensesByTripId: { 1: 1500000 },
  cityName: (id?: string) => (id === '1' ? 'Cali' : 'Bogotá'),
  notes: [],
};

describe('buildTripsSheet', () => {
  it('lleva las dieciocho columnas, sin kilómetros', async () => {
    const texto = await contenido(buildTripsSheet([VIAJE], OPCIONES));

    [
      'Viaje',
      'Manifiesto',
      'Estado',
      'Tipo',
      'Placa',
      'Conductor',
      'Empresa',
      'Origen',
      'Destino',
      'Creado',
      'Salida',
      'Llegada',
      'Flete',
      'Anticipo',
      'Saldo',
      'Gastos',
      'Utilidad',
    ].forEach((columna) => expect(texto).toContain(`>${columna}<`));

    expect(texto).not.toContain('>Km<');
    // La última columna es la R: dieciocho en total.
    expect(texto).toContain('A1:R');
  });

  /* La utilidad es lo único que la hoja calcula por su cuenta. Si se equivoca,
     se equivoca en las dos pantallas a la vez. */
  it('la utilidad es el flete menos el gasto del viaje', async () => {
    const texto = await contenido(buildTripsSheet([VIAJE], OPCIONES));

    expect(texto).toContain('<v>2500000</v>');
  });

  it('un viaje sin gasto sale con gasto cero y utilidad igual al flete', async () => {
    const texto = await contenido(
      buildTripsSheet([VIAJE], { ...OPCIONES, expensesByTripId: {} }),
    );

    expect(texto).toContain('<v>4000000</v>');
  });

  /* Rentabilidad manda sus propias cifras: son las del reporte agregado, que
     es lo que el usuario tiene delante en la tabla. */
  it('el flete que manda quien exporta manda sobre el del viaje', async () => {
    const texto = await contenido(
      buildTripsSheet([VIAJE], {
        ...OPCIONES,
        freightByTripId: { 1: 9000000 },
      }),
    );

    expect(texto).toContain('<v>9000000</v>');
    expect(texto).not.toContain('<v>4000000</v>');
  });

  it('la pestaña se llama Viajes, con el periodo detrás', async () => {
    const texto = await contenido(
      buildTripsSheet([VIAJE], { ...OPCIONES, periodLabel: 'Agosto 2026' }),
    );

    expect(texto).toContain('name="Viajes Agosto 2026"');
  });

  it('normaliza la placa, el conductor y la empresa', async () => {
    const texto = await contenido(buildTripsSheet([VIAJE], OPCIONES));

    expect(texto).toContain('ABC-123');
    expect(texto).toContain('Juan Perez');
    expect(texto).toContain('Envia Sas');
  });

  /* Los viajes anteriores a la funcionalidad no traen tipo y son cargados: es
     el mismo criterio que aplican las gráficas. */
  it('un viaje sin tipo cuenta como cargado', async () => {
    const texto = await contenido(
      buildTripsSheet([{ ...VIAJE, tripType: undefined }], OPCIONES),
    );

    expect(texto).toContain('Cargado');
  });
});

describe('toSheetDate', () => {
  it('descarta lo que no es una fecha', () => {
    expect(toSheetDate(undefined)).toBeNull();
    expect(toSheetDate('no es una fecha')).toBeNull();
  });

  it('acepta el texto que devuelve la API', () => {
    expect(toSheetDate('2026-08-30T06:30:00')?.getFullYear()).toBe(2026);
  });
});
