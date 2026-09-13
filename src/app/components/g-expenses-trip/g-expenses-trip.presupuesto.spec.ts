import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { GExpensesTripComponent } from './g-expenses-trip.component';
import { VehicleService as ExpenseService } from 'src/app/services/expense.service';
import { TripService } from 'src/app/services/trip.service';
import { ModelExpense } from 'src/app/models/expense-model';

/* ==========================================================================
   El presupuesto de un viaje es su anticipo. Mientras los gastos caben, la
   barra dice cuanto queda; cuando lo pasan, lo que importa ya no es el margen
   sino el desfase, asi que la barra se pone en rojo y se anuncia en cuanto se
   paso.
   ========================================================================== */

function gasto(amount: number): ModelExpense {
  return {
    vehicleId: 5,
    categoryId: 7,
    amount,
    expenseDate: '2026-01-10',
  } as ModelExpense;
}

describe('GExpensesTripComponent · presupuesto excedido', () => {
  let fixture: ComponentFixture<GExpensesTripComponent>;
  let c: GExpensesTripComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GExpensesTripComponent],
      providers: [
        {
          provide: ExpenseService,
          useValue: {
            getExpenseFilter: () =>
              of({ data: { content: [], totalElements: 0 } }),
          },
        },
        {
          provide: TripService,
          useValue: {
            getTripFilter: () =>
              of({ data: { content: [], totalElements: 0 } }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(GExpensesTripComponent);
    c = fixture.componentInstance;
    c.tripId = 1;
    c.vehicleId = 5;
    fixture.detectChanges();
  });

  /** Fija el anticipo y los gastos, y repinta. */
  function conGastos(anticipo: number, ...montos: number[]): void {
    c.budget = anticipo;
    c.expenses = montos.map(gasto);
    fixture.detectChanges();
  }

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function barra(): HTMLElement {
    return fixture.nativeElement.querySelector('.progress-bar') as HTMLElement;
  }

  /* ---- Dentro del presupuesto ---------------------------------------- */

  it('mientras cabe, la barra sigue en azul y dice cuanto queda', () => {
    conGastos(100000, 30000, 20000);

    expect(c.isOverBudget).toBeFalse();
    expect(c.overBudget).toBe(0);
    expect(c.remainingBudget).toBe(50000);
    expect(barra().classList).toContain('bg-primary');
    expect(barra().classList).not.toContain('bg-danger');
    expect(texto()).toContain('Te quedan');
  });

  it('gastar exactamente el anticipo todavia no es pasarse', () => {
    conGastos(100000, 100000);

    expect(c.isOverBudget).toBeFalse();
    expect(c.overBudget).toBe(0);
    expect(c.budgetPercentage).toBe(100);
    expect(barra().classList).toContain('bg-primary');
  });

  /* ---- Pasado el presupuesto ----------------------------------------- */

  it('al pasarse, la barra se pone roja', () => {
    conGastos(100000, 80000, 45000);

    expect(c.isOverBudget).toBeTrue();
    expect(barra().classList).toContain('bg-danger');
    expect(barra().classList).not.toContain('bg-primary');
  });

  it('anuncia cuanto se paso, no cuanto queda', () => {
    conGastos(100000, 125000);

    expect(c.overBudget).toBe(25000);
    expect(texto()).toContain('Te pasaste');
    expect(texto()).not.toContain('Te quedan');
    /* La cifra va en el mismo parrafo del aviso. El separador de miles
       depende del idioma del navegador, asi que se acepta cualquiera. */
    const aviso = fixture.nativeElement.querySelector(
      '.text-danger',
    ) as HTMLElement;
    expect(aviso.textContent).toMatch(/25[.,]000/);
  });

  it('la barra se queda llena, no se desborda', () => {
    conGastos(100000, 300000);

    expect(c.budgetPercentage).toBe(100);
    expect(barra().style.width).toBe('100%');
  });

  /* ---- Sin anticipo --------------------------------------------------- */

  it('un viaje sin anticipo no se ha pasado de nada', () => {
    /* Nadie le puso presupuesto: no hay contra que medir, y marcarlo en rojo
       seria acusar de un desfase que no existe. */
    conGastos(0, 50000);

    expect(c.isOverBudget).toBeFalse();
    expect(c.overBudget).toBe(0);
    expect(c.budgetPercentage).toBe(0);
    expect(barra().classList).toContain('bg-primary');
    expect(texto()).not.toContain('Te pasaste');
  });

  /* ---- Al registrar un gasto ------------------------------------------ */

  it('el gasto que cruza el limite cambia la barra en el momento', () => {
    conGastos(100000, 90000);
    expect(c.isOverBudget).toBeFalse();

    c.expenses = [...c.expenses, gasto(15000)];
    fixture.detectChanges();

    expect(c.isOverBudget).toBeTrue();
    expect(c.overBudget).toBe(5000);
    expect(barra().classList).toContain('bg-danger');
  });

  /* ---- Mantenimiento --------------------------------------------------- */

  it('en mantenimiento no hay bloque de presupuesto', () => {
    c.isMaintenance = true;
    conGastos(100000, 500000);

    expect(fixture.nativeElement.querySelector('.progress-bar')).toBeNull();
    expect(texto()).not.toContain('Te pasaste');
  });
});
