import { FormBuilder } from '@angular/forms';
import { of } from 'rxjs';
import { ExpenseSubmit, GAddExpenseComponent } from './g-add-expense.component';
import { ModelExpense } from 'src/app/models/expense-model';

/* ==========================================================================
   El comprobante del gasto. Es opcional, así que lo que se prueba aquí es que
   no estorbe: sin archivo el formulario se comporta igual que antes, y con
   archivo el gasto sale con el soporte enganchado.

   El componente se construye a mano y se le llama `initForm` en vez de
   `ngOnInit`: el arranque completo trae categorías, propietario y conductor de
   la red, y nada de eso interviene en el soporte.
   ========================================================================== */

function archivo(nombre: string, megas = 1): File {
  const relleno = new Uint8Array(Math.round(megas * 1024 * 1024));
  return new File([relleno], nombre, { type: 'application/octet-stream' });
}

function evento(file: File | null): Event {
  const input = {
    files: file ? [file] : [],
    value: 'algo',
  } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

describe('GAddExpenseComponent · comprobante', () => {
  let c: GAddExpenseComponent;
  let emitido: ExpenseSubmit | null | undefined;

  function crear(editando: ModelExpense | null = null): GAddExpenseComponent {
    const vacio: any = { subscribe: () => undefined };
    const component = new GAddExpenseComponent(
      new FormBuilder(),
      { getExpenseCategoryFilter: () => of({ data: { content: [] } }) } as any,
      { navigate: () => undefined } as any,
      { userData$: of(null) } as any,
      { getOwnerFilter: () => of({ data: { content: [] } }) } as any,
      { getDriverFilter: () => of({ data: { content: [] } }) } as any,
      { getVehicleOwnerFilter: () => of({ data: { content: [] } }) } as any,
      { getSalaryTypes: () => vacio } as any,
    );
    component.vehicleId = 5;
    component.editingExpense = editando;
    component.initForm();
    if (editando) component.patchFormForEdit();
    component.selectedCategoryId = 7;
    component.expenseForm.patchValue({ categoryId: 7, amount: '10.000' });
    emitido = undefined;
    component.close.subscribe((valor) => (emitido = valor));
    return component;
  }

  beforeEach(() => {
    c = crear();
  });

  /* ---- Validación del archivo --------------------------------------- */

  it('rechaza un formato que el backend no acepta', () => {
    c.onReceiptSelected(evento(archivo('factura.docx')));

    expect(c.receiptFile).toBeNull();
    expect(c.hasReceipt).toBeFalse();
    expect(c.receiptError).toContain('Formato no permitido');
  });

  it('rechaza un archivo por encima del tope del backend', () => {
    c.onReceiptSelected(evento(archivo('factura.jpg', 6)));

    expect(c.receiptFile).toBeNull();
    expect(c.receiptError).toContain('5 MB');
  });

  it('acepta los formatos del endpoint de subida', () => {
    for (const nombre of [
      'a.pdf',
      'b.jpg',
      'c.jpeg',
      'd.png',
      'e.webp',
      'F.PDF',
    ]) {
      const uno = crear();
      uno.onReceiptSelected(evento(archivo(nombre)));
      expect(uno.receiptError).withContext(nombre).toBe('');
      expect(uno.hasReceipt).withContext(nombre).toBeTrue();
    }
  });

  /* ---- Reemplazar ----------------------------------------------------- */

  describe('reemplazar', () => {
    it('otro archivo sustituye al que estaba, no se acumulan', () => {
      const primero = archivo('primera.jpg');
      const segundo = archivo('segunda.png');
      c.onReceiptSelected(evento(primero));

      c.onReceiptSelected(evento(segundo));

      expect(c.receiptFile).toBe(segundo);
      expect(c.receiptFileName).toBe('segunda.png');
      c.onSave();
      expect(emitido!.receipt).toBe(segundo);
    });

    it('un reemplazo inválido no borra el que ya estaba', () => {
      /* Quitar es un gesto aparte: equivocarse de archivo no debería
         dejar al usuario sin el que ya tenía. */
      const bueno = archivo('buena.jpg');
      c.onReceiptSelected(evento(bueno));

      c.onReceiptSelected(evento(archivo('mala.docx')));

      expect(c.receiptFile).toBe(bueno);
      expect(c.receiptFileName).toBe('buena.jpg');
      expect(c.receiptError).toContain('Formato no permitido');
    });
  });

  /* ---- Lo que se entrega al guardar ---------------------------------- */

  it('sin comprobante entrega el gasto igual que antes', () => {
    c.onSave();

    expect(emitido).toBeTruthy();
    expect(emitido!.receipt).toBeNull();
    expect(emitido!.expense.receiptImageUrl).toBeUndefined();
    expect(emitido!.expense.vehicleId).toBe(5);
    expect(emitido!.expense.amount).toBe(10000);
  });

  it('con comprobante entrega el archivo aparte, todavía sin URL', () => {
    const file = archivo('factura.jpg');
    c.onReceiptSelected(evento(file));

    c.onSave();

    expect(emitido!.receipt).toBe(file);
    /* La URL la pone quien lo sube, justo antes de guardar. */
    expect(emitido!.expense.receiptImageUrl).toBeUndefined();
  });

  /* ---- Edición -------------------------------------------------------- */

  it('al editar conserva el comprobante que ya tenía y lo deja abrir', () => {
    const editando = crear({
      id: 9,
      vehicleId: 5,
      categoryId: 7,
      amount: 10000,
      expenseDate: '2026-01-10',
      receiptImageUrl: 'https://cdn/archivos/factura-9.pdf',
    } as ModelExpense);

    expect(editando.hasReceipt).toBeTrue();
    expect(editando.canViewReceipt).toBeTrue();
    expect(editando.receiptFileName).toBe('factura-9.pdf');

    editando.onSave();
    expect(emitido!.expense.receiptImageUrl).toBe(
      'https://cdn/archivos/factura-9.pdf',
    );
    expect(emitido!.receipt).toBeNull();
  });

  it('quitar el comprobante al editar lo desvincula al guardar', () => {
    const editando = crear({
      id: 9,
      vehicleId: 5,
      categoryId: 7,
      amount: 10000,
      expenseDate: '2026-01-10',
      receiptImageUrl: 'https://cdn/archivos/factura-9.pdf',
    } as ModelExpense);

    editando.removeReceipt();

    expect(editando.hasReceipt).toBeFalse();
    expect(editando.canSave).toBeTrue();
    editando.onSave();
    expect(emitido!.expense.receiptImageUrl).toBeUndefined();
    expect(emitido!.receipt).toBeNull();
  });

  it('reemplazar el comprobante entrega el nuevo archivo', () => {
    const editando = crear({
      id: 9,
      vehicleId: 5,
      categoryId: 7,
      amount: 10000,
      expenseDate: '2026-01-10',
      receiptImageUrl: 'https://cdn/archivos/factura-9.pdf',
    } as ModelExpense);
    const nuevo = archivo('nueva.png');

    editando.onReceiptSelected(evento(nuevo));

    expect(editando.canViewReceipt).toBeFalse();
    editando.onSave();
    expect(emitido!.receipt).toBe(nuevo);
  });

  it('cancelar no entrega nada', () => {
    c.onReceiptSelected(evento(archivo('factura.jpg')));

    c.dismiss();

    expect(emitido).toBeNull();
  });
});
