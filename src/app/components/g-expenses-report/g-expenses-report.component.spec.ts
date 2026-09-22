import {
  assignDistinctColors,
  isMaintenanceExpense,
  OTHERS_COLOR_CLASS,
  REPORT_COLOR_CLASSES,
} from './g-expenses-report.component';

describe('isMaintenanceExpense', () => {
  const gasto = (extra: object) =>
    ({ vehicleId: 1, categoryId: 1, amount: 1000, ...extra }) as any;

  it('el tipo 4 es mantenimiento', () => {
    expect(
      isMaintenanceExpense(gasto({ category: { expenseTypeId: 4 } })),
    ).toBeTrue();
  });

  it('los tipos de viaje no lo son, aunque no traigan viaje', () => {
    expect(
      isMaintenanceExpense(gasto({ category: { expenseTypeId: 1 } })),
    ).toBeFalse();
    expect(
      isMaintenanceExpense(gasto({ category: { expenseTypeId: 2 } })),
    ).toBeFalse();
  });

  it('sin tipo, decide si cuelga de un viaje', () => {
    expect(isMaintenanceExpense(gasto({ tripId: 7 }))).toBeFalse();
    expect(isMaintenanceExpense(gasto({}))).toBeTrue();
  });
});

/** Ningún tono se repite en la serie. */
const sinRepetidos = (colores: string[]): boolean =>
  new Set(colores).size === colores.length;

describe('assignDistinctColors', () => {
  const [A, B, C] = REPORT_COLOR_CLASSES;

  it('hay ocho tonos para las categorías con nombre, sin el gris', () => {
    expect(REPORT_COLOR_CLASSES.length).toBe(8);
    expect(REPORT_COLOR_CLASSES).not.toContain(OTHERS_COLOR_CLASS);
  });

  it('respeta el color propio cuando no choca', () => {
    expect(assignDistinctColors([A, B, C])).toEqual([A, B, C]);
  });

  it('desvía la segunda de un par igual, no la primera', () => {
    const resultado = assignDistinctColors([A, A]);

    expect(resultado[0]).toBe(A);
    expect(resultado[1]).not.toBe(A);
  });

  /* Antes solo se separaban las contiguas: A, B, A pintaba dos tramos iguales. */
  it('no repite un tono aunque las filas no sean contiguas', () => {
    expect(sinRepetidos(assignDistinctColors([A, B, A]))).toBeTrue();
  });

  it('aguanta la barra más larga que se pinta', () => {
    /* Ocho categorías con nombre, todas del mismo tono de origen. */
    const todasIguales = Array.from({ length: 8 }, () => A);

    expect(sinRepetidos(assignDistinctColors(todasIguales))).toBeTrue();
  });

  it('el gris de origen se cambia: queda para "Otros"', () => {
    const [color] = assignDistinctColors([OTHERS_COLOR_CLASS]);

    expect(color).not.toBe(OTHERS_COLOR_CLASS);
    expect(REPORT_COLOR_CLASSES).toContain(color);
  });

  it('no falla con la lista vacía', () => {
    expect(assignDistinctColors([])).toEqual([]);
  });
});
