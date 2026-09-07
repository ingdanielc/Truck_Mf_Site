import { findScroller, scrollToTop } from './scroll';

describe('findScroller', () => {
  let raiz: HTMLElement;

  beforeEach(() => {
    raiz = document.createElement('div');
    document.body.appendChild(raiz);
  });

  afterEach(() => raiz.remove());

  /** Cadena `abuelo > padre > hijo` colgada del documento. */
  const cadena = (): HTMLElement[] => {
    const abuelo = document.createElement('div');
    const padre = document.createElement('div');
    const hijo = document.createElement('div');
    padre.appendChild(hijo);
    abuelo.appendChild(padre);
    raiz.appendChild(abuelo);
    return [abuelo, padre, hijo];
  };

  it('cae en la ventana cuando ningún antecesor se desplaza', () => {
    const [, , hijo] = cadena();
    expect(findScroller(hijo)).toBe(window);
  });

  it('encuentra el antecesor que lleva el scroll', () => {
    const [abuelo, , hijo] = cadena();
    abuelo.style.overflowY = 'auto';

    expect(findScroller(hijo)).toBe(abuelo);
  });

  /* El shell puede anidar contenedores; manda el más cercano, que es el que
     realmente mueve la vista. */
  it('se queda con el más cercano', () => {
    const [abuelo, padre, hijo] = cadena();
    abuelo.style.overflowY = 'scroll';
    padre.style.overflowY = 'auto';

    expect(findScroller(hijo)).toBe(padre);
  });

  it('no confunde otros valores de overflow', () => {
    const [abuelo, , hijo] = cadena();
    abuelo.style.overflowY = 'hidden';

    expect(findScroller(hijo)).toBe(window);
  });

  it('aguanta que no le den elemento', () => {
    expect(findScroller(null)).toBe(window);
    expect(findScroller(undefined)).toBe(window);
  });
});

describe('scrollToTop', () => {
  it('sube el contenedor que se le da', () => {
    const el = document.createElement('div');
    const espia = spyOn(el, 'scrollTo');

    scrollToTop(el);

    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ top: 0 }),
    );
  });
});
