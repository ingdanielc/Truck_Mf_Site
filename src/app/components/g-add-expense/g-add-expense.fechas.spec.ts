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

  /* El backend puede mandar la fecha como texto de solo dia. `new Date` la lee
     como medianoche UTC, que en Bogota es la tarde del dia anterior, asi que
     el tope se corria un dia. */
  it('una fecha en texto de solo dia no se corre al dia anterior', () => {
    const comp = componente({ startDate: '2026-03-05' } as ModelTrip);

    expect(comp.expenseDateMin).toBe('2026-03-05');
  });

  /* El mismo desfase, y este si se veia: al abrir un gasto para editarlo su
     fecha retrocedia un dia y caia por debajo del tope, con lo que el campo
     nacia en rojo diciendo que el gasto era anterior al viaje. */
  it('al editar, la fecha guardada no retrocede un dia', () => {
    const comp = componente({ startDate: '2026-03-05' } as ModelTrip);
    comp.initForm();
    comp.editingExpense = {
      categoryId: 1,
      amount: 1000,
      expenseDate: '2026-03-05',
    } as never;

    comp.patchFormForEdit();

    expect(comp.expenseForm.value.expenseDate).toBe('2026-03-05');
  });

  /* Un viaje registrado despues de su salida deja el tope por encima de gastos
     que ya existen. Sin la salvedad, ese gasto no se podia volver a guardar
     nunca: el campo nacia en rojo y Guardar quedaba apagado. */
  it('al editar se acepta la fecha guardada aunque el viaje se registrara despues', () => {
    const comp = componente({
      startDate: '2026-09-10',
      creationDate: '2026-09-12',
    } as ModelTrip);
    comp.editingExpense = { expenseDate: '2026-09-10' } as never;

    const validar = (comp as any).expenseDateRange();

    expect(comp.expenseDateMin).toBe('2026-09-12');
    expect(validar({ value: '2026-09-10' })).toBeNull();
    /* Moverla mas atras sigue sin valer: la salvedad es para la que ya estaba,
       no una puerta abierta. */
    expect(validar({ value: '2026-09-09' })).toEqual({ antesDelViaje: true });
  });

  /* Creando no hay nada guardado que respetar, asi que el tope manda entero. */
  it('creando, el tope se sigue aplicando', () => {
    const comp = componente({
      startDate: '2026-09-10',
      creationDate: '2026-09-12',
    } as ModelTrip);

    const validar = (comp as any).expenseDateRange();

    expect(validar({ value: '2026-09-10' })).toEqual({ antesDelViaje: true });
    expect(validar({ value: '2026-09-12' })).toBeNull();
  });

  /* La fecha de un gasto es un dia de calendario: el dia es el que dice el
     texto, tambien cuando llega a medianoche UTC. Leerla por partes locales la
     mandaba al dia anterior —el gasto del diez se veia como del nueve—, y como
     no depende de la zona del navegador, esta prueba lo sujeta en cualquier
     maquina. */
  it('al editar, una marca a medianoche UTC conserva su dia', () => {
    const comp = componente({ startDate: '2026-09-10' } as ModelTrip);
    comp.initForm();
    comp.editingExpense = {
      categoryId: 1,
      amount: 1000,
      expenseDate: '2026-09-10T00:00:00Z',
    } as never;

    comp.patchFormForEdit();

    expect(comp.expenseForm.value.expenseDate).toBe('2026-09-10');
  });

  it('una fecha que no se entiende no cuenta como tope', () => {
    const comp = componente({
      creationDate: 'vaya usted a saber',
      startDate: dia('2026-03-05'),
    } as unknown as ModelTrip);

    expect(comp.expenseDateMin).toBe('2026-03-05');
  });
});
