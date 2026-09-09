import { GConfirmSheetComponent } from './g-confirm-sheet.component';

/**
 * Un `PointerEvent` de mentira sobre la hoja. `closest` contesta lo que
 * contestaría en la hoja misma —fuera de los botones—, que es de donde sale
 * casi todo gesto.
 */
const evento = (clientY: number, dentroDeUnBoton = false): PointerEvent =>
  ({
    clientY,
    pointerId: 1,
    target: { closest: () => (dentroDeUnBoton ? {} : null) },
    currentTarget: null,
  }) as unknown as PointerEvent;

/** Arrastre desde `desde` hasta `hasta`, en píxeles de pantalla. */
const arrastrar = (
  sheet: GConfirmSheetComponent,
  desde: number,
  hasta: number,
): void => {
  sheet.onDragStart(evento(desde));
  sheet.onDragMove(evento(hasta));
  sheet.onDragEnd();
};

describe('GConfirmSheetComponent', () => {
  let sheet: GConfirmSheetComponent;
  let cancelaciones: number;
  let confirmaciones: number;

  beforeEach(() => {
    sheet = new GConfirmSheetComponent();
    sheet.open = true;
    cancelaciones = 0;
    confirmaciones = 0;
    sheet.cancel.subscribe(() => cancelaciones++);
    sheet.confirm.subscribe(() => confirmaciones++);
  });

  /* Las tres formas de cerrar significan lo mismo: la acción no se hace. */
  it('bajar la hoja cancela, no confirma', () => {
    arrastrar(sheet, 300, 420);

    expect(cancelaciones).toBe(1);
    expect(confirmaciones).toBe(0);
  });

  it('un arrastre corto la devuelve a su sitio sin cancelar', () => {
    arrastrar(sheet, 300, 330);

    expect(cancelaciones).toBe(0);
    expect(sheet.dragOffset).toBe(0);
  });

  /* Soltar termina en `click`: sin descartarlo, el arrastre corto que acaba
     de volver a su sitio se cerraba igualmente. */
  it('el clic que sigue a un arrastre corto no cierra', () => {
    arrastrar(sheet, 300, 330);
    sheet.onGrabberClick();

    expect(cancelaciones).toBe(0);
  });

  it('el clic sin arrastre sí cierra', () => {
    sheet.onGrabberClick();

    expect(cancelaciones).toBe(1);
  });

  it('tirar hacia arriba no la mueve', () => {
    sheet.onDragStart(evento(300));
    sheet.onDragMove(evento(200));

    expect(sheet.dragOffset).toBe(0);
  });

  /* El gesto se toma de toda la hoja, así que un dedo que solo toca —y nunca
     está del todo quieto— no debe moverla ni comerse el toque. */
  it('un temblor de unos pocos píxeles no cuenta como arrastre', () => {
    sheet.onDragStart(evento(300));
    sheet.onDragMove(evento(303));
    expect(sheet.dragOffset).toBe(0);

    sheet.onDragEnd();
    sheet.onGrabberClick();
    expect(cancelaciones).toBe(1);
  });

  /* Bajar la hoja desde "Confirmar" y soltar a medio camino tenía que poder no
     confirmar nada: por eso el gesto no empieza en los botones. */
  it('el gesto no empieza en un botón', () => {
    sheet.onDragStart(evento(300, true));
    sheet.onDragMove(evento(500));
    sheet.onDragEnd();

    expect(sheet.dragOffset).toBe(0);
    expect(cancelaciones).toBe(0);
  });

  /* Mientras se guarda no hay vuelta atrás: la petición ya salió. */
  describe('mientras guarda', () => {
    beforeEach(() => (sheet.busy = true));

    it('no se cierra por gesto', () => {
      arrastrar(sheet, 300, 500);
      expect(cancelaciones).toBe(0);
    });

    it('no se cierra por el botón ni por el fondo', () => {
      sheet.onCancel();
      expect(cancelaciones).toBe(0);
    });

    it('no vuelve a confirmar', () => {
      sheet.onConfirm();
      expect(confirmaciones).toBe(0);
    });
  });

  it('Escape cancela solo si está abierta', () => {
    sheet.open = false;
    sheet.onEscape();
    expect(cancelaciones).toBe(0);

    sheet.open = true;
    sheet.onEscape();
    expect(cancelaciones).toBe(1);
  });
});
