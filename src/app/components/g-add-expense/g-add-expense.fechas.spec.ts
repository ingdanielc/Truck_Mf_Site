import { FormBuilder } from '@angular/forms';
import { ModelTrip } from 'src/app/models/trip-model';
import { GAddExpenseComponent } from './g-add-expense.component';

/**
 * El tope de la fecha del gasto, que sale de dos datos del viaje y no de uno.
 *
 * Se arma el componente a mano, sin `TestBed`: nada de lo que se prueba aquí
 * toca la plantilla ni los servicios, y el resto de las dependencias no se
 * llegan a usar.
 */
describe('GAddExpenseComponent, el tope de la fecha del gasto', () => {
  const nulo = null as never;

  const componente = (trip: ModelTrip | null): GAddExpenseComponent => {
    const comp = new GAddExpenseComponent(
      new FormBuilder(),
      nulo,
      nulo,
      nulo,
      nulo,
      nulo,
      nulo,
      nulo,
    );
    comp.trip = trip;
    return comp;
  };

  /** Mediodía local, para que el día sobreviva a cualquier conversión. */
  const dia = (texto: string): Date => new Date(`${texto}T12:00:00`);

  it('con la salida después del registro manda la salida', () => {
    const comp = componente({
      creationDate: dia('2026-03-02'),
      startDate: dia('2026-03-05'),
    } as ModelTrip);

    expect(comp.expenseDateMin).toBe('2026-03-05');
  });

  /* Un viaje cargado tarde: salió el cinco y se registró el diez. Los días
     entre uno y otro quedan fuera, que es lo que antes se colaba. */
  it('con el registro después de la salida manda el registro', () => {
    const comp = componente({
      creationDate: dia('2026-03-10'),
      startDate: dia('2026-03-05'),
    } as ModelTrip);

    expect(comp.expenseDateMin).toBe('2026-03-10');
  });

  it('con un solo dato manda ese', () => {
    const comp = componente({ startDate: dia('2026-03-05') } as ModelTrip);

    expect(comp.expenseDateMin).toBe('2026-03-05');
  });

  /* Sin viaje el campo no se dibuja, pero el tope tiene que poder no existir:
     el validador lo consulta antes de saber si hay algo que comparar. */
  it('sin viaje no hay tope', () => {
    expect(componente(null).expenseDateMin).toBe('');
  });

  it('una fecha que no se entiende no cuenta como tope', () => {
    const comp = componente({
      creationDate: 'vaya usted a saber',
      startDate: dia('2026-03-05'),
    } as unknown as ModelTrip);

    expect(comp.expenseDateMin).toBe('2026-03-05');
  });
});
