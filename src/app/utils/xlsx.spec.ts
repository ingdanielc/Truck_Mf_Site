import {
  buildXlsx,
  columnLetter,
  SHEET_COLORS,
  xlsxFileName,
  XlsxSheet,
} from './xlsx';

/** Lee el ZIP como texto para poder buscar dentro. Las entradas van sin
 *  comprimir, así que el XML está ahí tal cual. */
async function contenido(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let texto = '';
  for (let i = 0; i < bytes.length; i++) texto += String.fromCharCode(bytes[i]);
  return texto;
}

const HOJA: XlsxSheet = {
  name: 'Viajes 2026',
  headerColor: SHEET_COLORS.viajes,
  columns: [
    { header: 'Empresa', width: 20 },
    { header: 'Fecha', format: 'date' },
    { header: 'Flete', format: 'money' },
  ],
  rows: [
    ['Coordinadora & Cía', new Date(2026, 7, 30), 3800000],
    ['Envía <S.A.S>', null, 0],
  ],
  totals: ['Total', null, 3800000],
  notes: ['Generado hoy'],
};

describe('buildXlsx', () => {
  it('devuelve un ZIP con la firma y el tipo de un libro de Excel', async () => {
    const blob = buildXlsx(HOJA);

    expect(blob.type).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect((await contenido(blob)).startsWith('PK')).toBeTrue();
  });

  it('lleva las seis partes que Excel espera', async () => {
    const texto = await contenido(buildXlsx(HOJA));

    [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ].forEach((parte) => expect(texto).toContain(parte));
  });

  /* El color es la razón de ser del encabezado: distinguir un reporte de otro
     de un vistazo. Va con la opacidad delante, que es como lo escribe Excel. */
  it('pinta el encabezado del color pedido', async () => {
    const texto = await contenido(buildXlsx(HOJA));

    expect(texto).toContain(`FF${SHEET_COLORS.viajes}`);
  });

  /* Un ampersand sin escapar deja el XML roto y Excel se niega a abrirlo. Es
     el nombre de media empresa del país. */
  it('escapa lo que rompería el XML', async () => {
    const texto = await contenido(buildXlsx(HOJA));

    expect(texto).toContain('Coordinadora &amp; C');
    expect(texto).toContain('Env');
    expect(texto).not.toContain('<S.A.S>');
  });

  /* Excel cuenta los días desde el 30 de diciembre de 1899. El 30 de agosto de
     2026 son 46264. Si esto falla, todas las fechas salen corridas. */
  it('convierte las fechas al serial de Excel', async () => {
    const texto = await contenido(buildXlsx(HOJA));

    expect(texto).toContain('<v>46264</v>');
  });

  it('congela el encabezado y deja puesto el filtro', async () => {
    const texto = await contenido(buildXlsx(HOJA));

    expect(texto).toContain('state="frozen"');
    // Encabezado más las dos filas de datos; el total queda fuera.
    expect(texto).toContain('autoFilter ref="A1:C3"');
  });

  it('aguanta una hoja sin filas', async () => {
    const blob = buildXlsx({ ...HOJA, rows: [], totals: undefined });

    expect(blob.size).toBeGreaterThan(0);
  });

  /* Los tres reportes se distinguen por el color: dos iguales dejarían el
     encabezado sin decir de cuál es la hoja. */
  it('da un color distinto a cada reporte', () => {
    const colores = Object.values(SHEET_COLORS);

    expect(new Set(colores).size).toBe(colores.length);
  });
});

describe('columnLetter', () => {
  it('pasa de índice a letra de columna', () => {
    expect(columnLetter(0)).toBe('A');
    expect(columnLetter(25)).toBe('Z');
    expect(columnLetter(26)).toBe('AA');
    expect(columnLetter(51)).toBe('AZ');
    expect(columnLetter(52)).toBe('BA');
  });
});

describe('xlsxFileName', () => {
  it('une las partes y pone la extensión', () => {
    expect(xlsxFileName('Viajes', 2026)).toBe('Viajes - 2026.xlsx');
  });

  it('descarta las partes vacías', () => {
    expect(xlsxFileName('Saldos', null, '')).toBe('Saldos.xlsx');
  });

  /* Los dos puntos y la barra rompen el nombre en Windows y en iOS, y la placa
     y el periodo entran ahí sin pasar por ningún filtro. */
  it('quita los caracteres que no admite un nombre de archivo', () => {
    expect(xlsxFileName('Rentabilidad', 'ABC/123', 'Ago: 2026')).toBe(
      'Rentabilidad - ABC 123 - Ago 2026.xlsx',
    );
  });
});
