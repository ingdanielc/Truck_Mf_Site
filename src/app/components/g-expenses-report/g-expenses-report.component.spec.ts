import { CATEGORY_COLOR_CLASSES } from '../../utils/category-config';
import { separateAdjacentColors } from './g-expenses-report.component';

/** Ningún par contiguo comparte tono. */
const sinRepetidosSeguidos = (colores: string[]): boolean =>
  colores.every((c, i) => i === 0 || c !== colores[i - 1]);

describe('separateAdjacentColors', () => {
  const [A, B, C] = CATEGORY_COLOR_CLASSES;

  it('no toca una serie que ya alterna', () => {
    expect(separateAdjacentColors([A, B, C])).toEqual([A, B, C]);
  });

  it('desvía la segunda de un par igual, no la primera', () => {
    const resultado = separateAdjacentColors([A, A]);

    expect(resultado[0]).toBe(A);
    expect(resultado[1]).not.toBe(A);
  });

  /* Las filas van ordenadas por importe, así que resolver hacia adelante deja
     el color propio a la categoría más grande de las dos. */
  it('separa una serie entera del mismo tono', () => {
    const resultado = separateAdjacentColors([A, A, A, A]);

    expect(sinRepetidosSeguidos(resultado)).toBeTrue();
    expect(resultado[0]).toBe(A);
  });

  /* Un choque no debe resolverse creando el siguiente. */
  it('mira la fila de después al elegir el sustituto', () => {
    const resultado = separateAdjacentColors([A, A, B]);

    expect(sinRepetidosSeguidos(resultado)).toBeTrue();
    expect(resultado[1]).not.toBe(B);
  });

  it('aguanta la barra más larga que se pinta', () => {
    /* Siete filas: las seis categorías con nombre más "Otros". */
    const todasIguales = Array.from({ length: 7 }, () => A);

    expect(
      sinRepetidosSeguidos(separateAdjacentColors(todasIguales)),
    ).toBeTrue();
  });

  it('devuelve un color válido de la paleta', () => {
    separateAdjacentColors([A, A, A]).forEach((c) => {
      expect(CATEGORY_COLOR_CLASSES).toContain(c);
    });
  });

  it('no falla con la lista vacía', () => {
    expect(separateAdjacentColors([])).toEqual([]);
  });
});
