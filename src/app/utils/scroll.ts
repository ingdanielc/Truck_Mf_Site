/**
 * Quién se desplaza realmente.
 *
 * Estas vistas son micro-frontends: la ventana puede no moverse porque el
 * scroll lo lleva un contenedor del shell. Se busca el primer antecesor que lo
 * tenga y, si no hay ninguno, se usa la ventana.
 *
 * No se comprueba la altura: al montar la vista el contenido aún no ha crecido
 * y el contenedor bueno todavía no desborda.
 */
export function findScroller(from?: HTMLElement | null): HTMLElement | Window {
  let el = from?.parentElement ?? null;
  while (el && el !== document.body) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
    el = el.parentElement;
  }
  return window;
}

/**
 * Sube al principio de la vista.
 *
 * Quien pidió menos movimiento sube de golpe: un recorrido animado de varias
 * pantallas es justo lo que ese ajuste evita.
 */
export function scrollToTop(scroller: HTMLElement | Window = window): void {
  const suave = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    .matches;
  scroller.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
}
