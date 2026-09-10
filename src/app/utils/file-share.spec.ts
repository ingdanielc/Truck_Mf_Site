import { shareOrDownloadFile } from './file-share';

/**
 * Sustituye algo de `navigator` y devuelve cómo dejarlo como estaba. No se
 * puede asignar a secas: son propiedades del prototipo, y en el navegador que
 * corre las pruebas unas existen y otras no.
 */
function stubNavigator(prop: string, value: any): () => void {
  const anterior = Object.getOwnPropertyDescriptor(navigator, prop);
  Object.defineProperty(navigator, prop, {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (anterior) Object.defineProperty(navigator, prop, anterior);
    else delete (navigator as any)[prop];
  };
}

describe('shareOrDownloadFile', () => {
  const blob = new Blob(['hola'], { type: 'text/plain' });
  let restaurar: (() => void)[] = [];
  let anchor: HTMLAnchorElement;

  beforeEach(() => {
    /* El enlace se crea de verdad, pero no se pulsa: pulsarlo bajaría un
       archivo en la máquina que corre las pruebas. */
    anchor = document.createElement('a');
    spyOn(anchor, 'click');
    spyOn(document, 'createElement').and.callFake((tag: string) =>
      tag === 'a' ? anchor : document.createElement(tag),
    );
    spyOn(document.body, 'appendChild').and.returnValue(anchor);
  });

  afterEach(() => {
    restaurar.forEach((fn) => fn());
    restaurar = [];
  });

  it('comparte cuando el sistema admite compartir archivos', async () => {
    const share = jasmine.createSpy('share').and.resolveTo(undefined);
    restaurar.push(stubNavigator('canShare', () => true));
    restaurar.push(stubNavigator('share', share));

    const salida = await shareOrDownloadFile(blob, 'a.xlsx', 'Título');

    expect(salida).toBe('shared');
    expect(share).toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });

  /* Cerrar la hoja de compartir es una decisión, no un fallo: no debe acabar
     bajando el archivo por detrás ni pintando un error. */
  it('cerrar la hoja de compartir no descarga nada', async () => {
    const abort = new Error('cancelado');
    abort.name = 'AbortError';
    restaurar.push(stubNavigator('canShare', () => true));
    restaurar.push(stubNavigator('share', () => Promise.reject(abort)));

    const salida = await shareOrDownloadFile(blob, 'a.xlsx', 'Título');

    expect(salida).toBe('cancelled');
    expect(anchor.click).not.toHaveBeenCalled();
  });

  /* En iOS la hoja se niega a abrirse si el toque del usuario ya se gastó. El
     archivo tiene que llegar igual, y el enlace no depende del gesto. */
  it('si compartir falla, entrega el archivo por el enlace', async () => {
    restaurar.push(stubNavigator('canShare', () => true));
    restaurar.push(
      stubNavigator('share', () =>
        Promise.reject(new Error('NotAllowedError')),
      ),
    );

    const salida = await shareOrDownloadFile(blob, 'a.xlsx', 'Título');

    expect(salida).toBe('downloaded');
    expect(anchor.click).toHaveBeenCalled();
    expect(anchor.download).toBe('a.xlsx');
  });

  it('sin compartir en el sistema, va derecho al enlace', async () => {
    restaurar.push(stubNavigator('share', undefined));
    restaurar.push(stubNavigator('canShare', undefined));

    const salida = await shareOrDownloadFile(blob, 'a.xlsx', 'Título');

    expect(salida).toBe('downloaded');
    expect(anchor.click).toHaveBeenCalled();
  });
});
