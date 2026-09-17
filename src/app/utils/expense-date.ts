/**
 * La fecha de un gasto es un **dia de calendario**, no un instante.
 *
 * La API la devuelve a medianoche UTC (`2026-09-16T00:00:00Z`). Leida con
 * `new Date(...)` o con el pipe `date` sin zona, en Bogota eso son las siete de
 * la noche del dia anterior, y el gasto registrado hoy se veia como de ayer.
 *
 * Aqui el dia se toma tal como viene escrito y se devuelve a medianoche
 * **local**, que es lo que esperan el pipe `date`, `formatDate` y las
 * comparaciones por mes. Un `Date` se respeta por sus partes locales. Lo que no
 * se entienda devuelve `null`.
 */
export function expenseDay(
  raw: string | Date | null | undefined,
): Date | null {
  if (!raw) return null;

  if (typeof raw === 'string') {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    if (partes) {
      const [, anio, mes, dia] = partes.map(Number);
      return new Date(anio, mes - 1, dia);
    }
  }

  const fecha = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(fecha.getTime())) return null;
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
}

/** Marca de tiempo del dia del gasto, para ordenar; `NaN` si no se entiende. */
export function expenseDayTime(raw: string | Date | null | undefined): number {
  return expenseDay(raw)?.getTime() ?? Number.NaN;
}
