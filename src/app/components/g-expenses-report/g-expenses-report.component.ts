import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { lastValueFrom } from 'rxjs';
import { VehicleService as ExpenseService } from '../../services/expense.service';
import {
  Filter,
  ModelFilterTable,
  Pagination,
  Sort,
} from '../../models/model-filter-table';
import { ModelExpense } from '../../models/expense-model';
import { Formatters } from '../../utils/formatters';
import {
  getCategoryConfigByName,
  CategoryConfig,
} from '../../utils/category-config';

/** Una categoría del desglose, ya sumada y con su parte del total. */
export interface ExpenseSlice {
  name: string;
  amount: number;
  /** Porcentaje sobre el gasto del periodo. */
  share: number;
  icon: string;
  /** `text-warning` — el icono y la cifra. */
  textClass: string;
  /** `bg-warning` — el segmento de la barra. */
  bgClass: string;
}

/**
 * En qué se gastó el dinero, por categoría.
 *
 * Es la otra mitad de la rentabilidad: esa dice cuánto quedó, y esta por qué.
 * Un mes malo puede serlo por el combustible, por el taller o por el conductor,
 * y hasta ahora las tres cosas llegaban sumadas en una sola cifra de "Gastos".
 *
 * **Pide sus propios datos y hay que saberlo.** Los reportes agregados del
 * tablero no sirven aquí: el Endpoint A trae `tripExpenses` como un único
 * número —todo lo que cuelga de un viaje, junto— y solo desglosa por
 * `expenseTypeId` lo que NO pertenece a ningún viaje. Combustible, peajes y
 * conductor son gastos de viaje, así que el desglose que pide esta sección no
 * existe en el reporte. Sale de `/expense/filter`, un endpoint que ya existía,
 * acotado a los vehículos en pantalla y al periodo: decenas de registros en un
 * mes, no las 20.000 filas que la carga del tablero dejó de pedir.
 *
 * Si algún día el reporte desglosa también `tripExpenses` por categoría, esta
 * petición sobra y el componente se alimenta de lo que ya está en memoria.
 */
@Component({
  selector: 'g-expenses-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-expenses-report.component.html',
  styleUrls: ['./g-expenses-report.component.scss'],
})
export class GExpensesReportComponent implements OnChanges {
  /** Vehículos en alcance. Ya vienen filtrados por el selector del tablero, así
   *  que el desglose habla del mismo camión que la rentabilidad. */
  @Input({ required: true }) vehicleIds: number[] = [];
  @Input({ required: true }) year: number = new Date().getFullYear();
  /** Mes, o `-1` para el año completo. Mismo convenio que la rentabilidad. */
  @Input({ required: true }) month: number = new Date().getMonth();

  /**
   * La pestaña está abierta.
   *
   * Sin esto la sección salía a pedir sus gastos en cada cambio de periodo
   * aunque nadie la hubiera abierto nunca: es la única del tablero que cuesta
   * una petición, y cobrarla a quien solo mira las gráficas no tiene sentido.
   * El componente se mantiene vivo —oculto, no destruido— para no volver a
   * pedir al ir y volver entre pestañas.
   */
  @Input({ required: true }) active = false;

  public readonly ANIO = -1;

  public loading = false;
  public loadError = false;

  public slices: ExpenseSlice[] = [];
  public total = 0;
  public count = 0;

  /**
   * Cuántas categorías se nombran antes de agrupar el resto en "Otros".
   *
   * No es un tope estético: la paleta de categorías tiene siete tonos, y a
   * partir de ahí dos porciones distintas se pintarían del mismo color. Las
   * pequeñas tampoco se leen en la barra — juntas sí.
   */
  private static readonly MAX_CATEGORIAS = 6;

  private token = 0;

  constructor(private readonly expenseService: ExpenseService) {}

  /** Hay un periodo pedido que aún no se ha cargado por estar la pestaña
   *  cerrada. Se resuelve en cuanto se abre. */
  private pending = true;

  ngOnChanges(changes: SimpleChanges): void {
    /* Cualquier cambio que no sea el de abrir la pestaña invalida lo cargado:
       es otro periodo u otro vehículo. */
    if (Object.keys(changes).some((k) => k !== 'active')) this.pending = true;

    if (!this.active || !this.pending) return;
    this.pending = false;
    void this.load();
  }

  /* ======================================================================
     Carga
     ====================================================================== */

  private async load(): Promise<void> {
    const token = ++this.token;

    if (!this.vehicleIds.length) {
      this.apply([]);
      return;
    }

    const desde = this.rangeStart();
    const hasta = this.rangeEnd();

    this.loading = true;
    this.loadError = false;
    try {
      const resp: any = await lastValueFrom(
        this.expenseService.getExpenseFilter(
          new ModelFilterTable(
            [
              new Filter('vehicleId', 'in', this.vehicleIds.join(',')),
              new Filter('expenseDate', '>=', desde),
              new Filter('expenseDate', '<=', hasta),
            ],
            new Pagination(5000, 0),
            new Sort('expenseDate', false),
          ),
        ),
      );
      if (token !== this.token) return;
      this.apply(resp?.data?.content || [], desde, hasta);
    } catch (error) {
      if (token !== this.token) return;
      console.error('Error cargando los gastos por categoría:', error);
      this.loadError = true;
      /* Se deja pendiente: al volver a la pestaña se reintenta en vez de
         quedarse con el error hasta el próximo cambio de periodo. */
      this.pending = true;
      this.apply([]);
    } finally {
      if (token === this.token) this.loading = false;
    }
  }

  /** Primer día del periodo, en `YYYY-MM-DD`. */
  private rangeStart(): string {
    const mes = this.month === this.ANIO ? 0 : this.month;
    return this.dateOnly(this.year, mes, 1);
  }

  /** Último día del periodo. Día 0 del mes siguiente es el último del actual,
   *  así que febrero y los meses de 30 días salen bien sin casos especiales. */
  private rangeEnd(): string {
    const mes = this.month === this.ANIO ? 11 : this.month;
    const ultimo = new Date(this.year, mes + 1, 0).getDate();
    return this.dateOnly(this.year, mes, ultimo);
  }

  /* Se arma a mano y no con `toISOString`, que convierte a UTC: en Bogotá eso
     corre la fecha un día hacia atrás y el primero de mes se perdía. */
  private dateOnly(year: number, month: number, day: number): string {
    const dd = String(day).padStart(2, '0');
    const mm = String(month + 1).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }

  /* ======================================================================
     Agrupación
     ====================================================================== */

  /**
   * Suma por categoría y reparte el total.
   *
   * El rango de fechas se vuelve a aplicar aquí sobre lo que llegó: el filtro
   * ya lo pide al servidor, pero si el backend ignorara alguno de los dos
   * extremos, las cifras seguirían siendo las del periodo en pantalla y no las
   * de un rango más ancho.
   */
  private apply(
    expenses: ModelExpense[],
    desde?: string,
    hasta?: string,
  ): void {
    const dentro = (e: ModelExpense) => {
      if (!desde || !hasta) return true;
      const fecha = String(e.expenseDate ?? '').slice(0, 10);
      return fecha >= desde && fecha <= hasta;
    };

    const porCategoria = new Map<string, number>();
    let total = 0;
    let count = 0;

    (expenses ?? []).filter(dentro).forEach((e) => {
      const nombre = (e.category?.name ?? e.categoryName ?? 'Otros').trim();
      const monto = e.amount || 0;
      porCategoria.set(nombre, (porCategoria.get(nombre) ?? 0) + monto);
      total += monto;
      count += 1;
    });

    const ordenadas = [...porCategoria.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);

    const nombradas = ordenadas.slice(
      0,
      GExpensesReportComponent.MAX_CATEGORIAS,
    );
    const resto = ordenadas.slice(GExpensesReportComponent.MAX_CATEGORIAS);

    const filas = [...nombradas];
    if (resto.length) {
      filas.push({
        name: 'Otros',
        amount: resto.reduce((a, c) => a + c.amount, 0),
      });
    }

    this.total = total;
    this.count = count;
    this.slices = filas.map((c) => {
      const cfg: CategoryConfig = getCategoryConfigByName(c.name);
      const [textClass, bgClass] = cfg.colorClass.split(' ');
      return {
        name: Formatters.titleCase(c.name),
        amount: c.amount,
        share: total > 0 ? (c.amount / total) * 100 : 0,
        icon: cfg.icon,
        textClass,
        bgClass,
      };
    });
  }

  /**
   * Ancho del segmento en la barra.
   *
   * Con un mínimo: una categoría del 0,3 % desaparecería, y la barra diría que
   * no existe cuando sí está en la lista de abajo. El sobrante que introduce el
   * mínimo es de décimas y la barra es una proporción, no una regla graduada.
   */
  public segmentWidth(slice: ExpenseSlice): string {
    return `${Math.max(slice.share, 1.5)}%`;
  }

  get hasData(): boolean {
    return this.total > 0;
  }
}
