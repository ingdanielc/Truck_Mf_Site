import { expenseDay, expenseDayTime } from './expense-date';

describe('expenseDay, la fecha del gasto como dia de calendario', () => {
  const partes = (d: Date | null) =>
    d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null;

  it('medianoche UTC conserva su dia en cualquier zona', () => {
    expect(partes(expenseDay('2026-09-16T00:00:00Z'))).toEqual([2026, 9, 16]);
  });

  it('un texto que es solo el dia se toma tal cual', () => {
    expect(partes(expenseDay('2026-09-01'))).toEqual([2026, 9, 1]);
  });

  it('un Date se lee por sus partes locales', () => {
    expect(partes(expenseDay(new Date(2026, 8, 16, 21, 30)))).toEqual([
      2026, 9, 16,
    ]);
  });

  it('lo que no se entiende devuelve null', () => {
    expect(expenseDay('vaya usted a saber')).toBeNull();
    expect(expenseDay(null)).toBeNull();
    expect(expenseDayTime(undefined)).toBeNaN();
  });
});
