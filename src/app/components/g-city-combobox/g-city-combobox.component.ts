import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostBinding,
  Input,
  OnDestroy,
  ViewChild,
  forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Una ciudad tal y como la devuelve `getCities`. `state` es el departamento. */
export interface CityOption {
  id: string | number;
  name: string;
  state?: string;
}

/** Las ciudades de un departamento, ya ordenadas por quien nos las pasa. */
export interface CityGroup {
  state: string;
  cities: CityOption[];
}

/** Los ids de las opciones tienen que ser únicos en toda la página. */
let secuencia = 0;

/** Sin tildes y en minúsculas: "Bogotá" y "bogota" han de ser lo mismo. */
const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Buscador de ciudades agrupadas por departamento.
 *
 * Reemplaza a un `<select>` con `<optgroup>` cuando la lista es tan larga que
 * desplegarla no sirve de nada: mil y pico de municipios no se recorren con el
 * pulgar. Se comporta como un `combobox` de ARIA —campo de texto que filtra,
 * `listbox` emergente, `aria-activedescendant` para el recorrido con flechas—,
 * que es el patrón que Angular expone de fábrica desde la versión 22. Aquí
 * está escrito a mano porque este microfrontend va por la 19.
 *
 * El disparador y la hoja son dos cosas distintas a propósito. El disparador no
 * se mueve nunca de su hueco del formulario; la hoja se dibuja encima, fija.
 * Si el campo se convirtiera él mismo en la hoja, el formulario de detrás se
 * recolocaría al abrirla y al cerrarla aparecería desplazado.
 *
 * En el teléfono la hoja sube desde abajo y se queda a media pantalla, con el
 * buscador arriba y los departamentos como encabezados pegajosos. Por encima
 * sigue asomando el formulario: así se ve de dónde se viene y que cerrar
 * devuelve allí. En pantalla ancha es el desplegable de siempre, colgado del
 * campo.
 */
@Component({
  selector: 'g-city-combobox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './g-city-combobox.component.html',
  styleUrls: ['./g-city-combobox.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => GCityComboboxComponent),
      multi: true,
    },
  ],
})
export class GCityComboboxComponent implements ControlValueAccessor, OnDestroy {
  /** Ciudades ya agrupadas por departamento. Llegan después del primer render:
   *  el formulario las pide al abrirse, así que la etiqueta de lo seleccionado
   *  se recalcula cada vez que cambian. */
  @Input() set groups(value: CityGroup[] | null) {
    this.gruposOrigen = value ?? [];
    this.filtrar();
    this.sincronizarEtiqueta();
  }
  get groups(): CityGroup[] {
    return this.gruposOrigen;
  }

  /** Para que el `<label for>` del formulario apunte aquí. */
  @Input() inputId = '';
  @Input() placeholder = 'Selecciona';
  @Input() searchPlaceholder = 'Buscar Ciudad';
  /** El nombre del campo, repetido dentro de la hoja: al abrirla tapa el
   *  formulario, y sin él no se sabe qué se está eligiendo. */
  @Input() label = 'Ciudad';
  /**
   * Texto de la fila que no elige ninguna ciudad, como el "Todos" de un
   * filtro. Puesto, esa fila encabeza la lista y vale `null`; sin poner, el
   * campo es obligatorio y no hay forma de volver atrás desde la hoja.
   */
  @Input() emptyOptionLabel: string | null = null;
  /** Clases del campo cerrado, junto a `form-select`. Los filtros del listado
   *  de viajes no se visten como los campos de un formulario. */
  @Input() fieldClass = 'rounded-3 py-2 px-3';
  /** Pinta el borde de error, igual que `is-invalid` en el `<select>`. */
  @Input() invalid = false;

  /**
   * La marca de error también en la etiqueta de fuera, no solo en el campo.
   * Bootstrap enseña los `.invalid-feedback` con un `.is-invalid ~`, es decir,
   * mirando al hermano de antes. Ese hermano ahora es este componente, y sin la
   * clase aquí el mensaje de error no llegaría a verse.
   */
  @HostBinding('class.is-invalid') get marcadoInvalido(): boolean {
    return this.invalid;
  }

  @ViewChild('buscador') private buscador?: ElementRef<HTMLInputElement>;
  @ViewChild('disparador') private disparador?: ElementRef<HTMLButtonElement>;
  @ViewChild('lista') private lista?: ElementRef<HTMLElement>;
  @ViewChild('barrita') private barrita?: ElementRef<HTMLButtonElement>;

  open = false;
  disabled = false;
  /** Alto del teclado del teléfono, en píxeles. Ver `medirTeclado`. */
  tecladoPx = 0;
  /** Desplazamiento del arrastre en curso, en píxeles hacia abajo. */
  dragOffset = 0;
  /** Lo que hay escrito en el buscador. Se borra al cerrar. */
  query = '';
  /** Lo que se ve en el campo cuando está cerrado, p. ej. "Medellín". */
  selectedLabel = '';
  filteredGroups: CityGroup[] = [];

  readonly listboxId = `city-combobox-${++secuencia}`;
  readonly buscadorId = `${this.listboxId}-buscador`;

  private gruposOrigen: CityGroup[] = [];
  /** El id seleccionado, siempre como texto: el formulario lo trae unas veces
   *  como número —al editar— y otras como texto. Comparar en crudo fallaba. */
  private selectedId: string | null = null;
  /** Las ciudades visibles en un solo nivel, que es como se recorren con las
   *  flechas. Los encabezados de departamento no se pueden elegir. El `null`
   *  de la primera posición, cuando lo hay, es la fila de "Todos". */
  private planas: (CityOption | null)[] = [];
  private activo = -1;

  private dragStartY: number | null = null;
  /** El dedo que empezó el gesto. Los demás se ignoran: con dos dedos en la
   *  pantalla, el segundo daría saltos en el desplazamiento. */
  private dragPointerId: number | null = null;
  /** Hubo arrastre, no solo un toque. Ver `onGrabberClick`. */
  private dragged = false;

  /** Pasado este arrastre la hoja se va; por debajo vuelve a su sitio. */
  private readonly DISMISS_THRESHOLD_PX = 80;
  /** Lo que hay que bajar para que esto cuente como arrastre y no como toque.
   *  Un dedo que toca nunca lo hace del todo quieto. */
  private readonly DRAG_SLOP_PX = 6;

  private alCambiar: (valor: string | null) => void = () => {};
  private alTocar: () => void = () => {};

  constructor(private readonly cdr: ChangeDetectorRef) {}

  // ── ControlValueAccessor ───────────────────────────────────────────

  writeValue(valor: unknown): void {
    /* Vacío se escribe de varias formas según de dónde venga el formulario: la
       ficha de viaje arranca sus campos en cadena vacía, las de propietario y
       conductor en `null`, y el `<select>` de antes traía la cadena "null" en
       su opción sin elegir. Las tres significan lo mismo. */
    const vacio =
      valor === null || valor === undefined || valor === '' || valor === 'null';
    this.selectedId = vacio ? null : String(valor);
    this.sincronizarEtiqueta();
  }

  registerOnChange(fn: (valor: string | null) => void): void {
    this.alCambiar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.alTocar = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    if (isDisabled) this.open = false;
  }

  // ── Abrir y cerrar ─────────────────────────────────────────────────

  /**
   * El foco del buscador se pide en el mismo gesto que abrió la hoja, no en un
   * `setTimeout`: en iOS el teclado solo sale si el foco cae dentro del toque
   * del usuario. Por eso hace falta el `detectChanges`, que dibuja la hoja
   * antes de continuar; sin él el campo aún no existe.
   */
  abrir(): void {
    if (this.disabled || this.open) return;

    this.open = true;
    this.query = '';
    this.filtrar();
    this.activo = this.planas.findIndex((ciudad) => this.isSelected(ciudad));

    this.cdr.detectChanges();
    this.buscador?.nativeElement.focus();
    this.desplazarAlActivo();
    this.vigilarTeclado(true);
  }

  /** Cerrar sin elegir deja la selección como estaba. */
  cerrar(devolverFoco = true): void {
    if (!this.open) return;

    this.open = false;
    this.query = '';
    this.activo = -1;
    this.tecladoPx = 0;
    this.dragOffset = 0;
    this.dragStartY = null;
    this.dragPointerId = null;
    this.vigilarTeclado(false);
    this.filtrar();
    this.alTocar();

    if (devolverFoco) {
      this.cdr.detectChanges();
      this.disparador?.nativeElement.focus();
    }
  }

  ngOnDestroy(): void {
    this.vigilarTeclado(false);
  }

  // ── Bajar la hoja con el dedo ──────────────────────────────────────

  /**
   * El gesto sale de la cabecera de la hoja: la barrita, la etiqueta y el
   * hueco que las rodea. De la lista no, porque ahí el dedo hacia abajo
   * significa desplazarla, y del buscador tampoco, porque ahí significa
   * escribir. Arrastrar la hoja entera dejaría la lista sin poder recorrerse.
   */
  onDragStart(event: PointerEvent): void {
    if (!this.open || this.dragStartY !== null) return;

    /* Solo donde esto es una hoja. De tableta en adelante es un desplegable
       colgado del campo y bajarlo con el dedo no significa nada. Se mira si la
       barrita está a la vista para no repetir aquí el corte de la hoja de
       estilos, que es quien la esconde. */
    if (!this.barrita?.nativeElement.offsetParent) return;

    const origen = event.target as HTMLElement | null;
    if (
      origen?.closest(
        '.city-combobox-list, .input-group, button:not(.city-combobox-grabber)',
      )
    ) {
      return;
    }

    this.dragStartY = event.clientY;
    this.dragPointerId = event.pointerId;
    this.dragged = false;
  }

  onDragMove(event: PointerEvent): void {
    if (this.dragStartY === null || event.pointerId !== this.dragPointerId) {
      return;
    }

    /* Solo se sigue el dedo hacia abajo: hacia arriba la hoja ya está en su
       tope y estirarla no llevaría a ninguna parte. */
    const recorrido = Math.max(0, event.clientY - this.dragStartY);

    /* Hasta pasar la holgura no es un arrastre y la hoja no se mueve. La
       captura se toma justo ahí y no antes: tomarla en el `pointerdown`
       apuntaría a la hoja el `click` de la barrita, que dejaría de responder. */
    if (!this.dragged) {
      if (recorrido < this.DRAG_SLOP_PX) return;
      this.dragged = true;
      const hoja = event.currentTarget as HTMLElement | null;
      hoja?.setPointerCapture?.(event.pointerId);
    }

    this.dragOffset = recorrido;
  }

  onDragEnd(): void {
    if (this.dragStartY === null) return;

    const recorrido = this.dragOffset;
    this.dragStartY = null;
    this.dragPointerId = null;
    this.dragOffset = 0;

    if (recorrido > this.DISMISS_THRESHOLD_PX) this.cerrar();
  }

  /**
   * La barrita también cierra al tocarla, para quien no arrastra —teclado
   * incluido—. Un arrastre termina en `click`, así que el que viene detrás de
   * un gesto se descarta: si no, soltar a mitad de camino cerraría la hoja que
   * `onDragEnd` acaba de devolver a su sitio.
   */
  onGrabberClick(): void {
    if (this.dragged) {
      this.dragged = false;
      return;
    }
    this.cerrar();
  }

  // ── El teclado del teléfono ────────────────────────────────────────

  /**
   * La hoja se apoya en el borde inferior, y ahí es justo donde sale el
   * teclado. En Android la ventana se encoge y el navegador la sube sola; en
   * iOS no, y la hoja se queda debajo de las teclas. `visualViewport` dice
   * cuánto tapa el teclado de verdad, y con eso se levanta.
   */
  private medirTeclado = (): void => {
    const ventana = window.visualViewport;
    if (!ventana) return;

    const tapado = window.innerHeight - ventana.height - ventana.offsetTop;
    this.tecladoPx = Math.max(0, Math.round(tapado));
  };

  private vigilarTeclado(activar: boolean): void {
    const ventana = window.visualViewport;
    if (!ventana) return;

    if (activar) {
      ventana.addEventListener('resize', this.medirTeclado);
      ventana.addEventListener('scroll', this.medirTeclado);
      this.medirTeclado();
    } else {
      ventana.removeEventListener('resize', this.medirTeclado);
      ventana.removeEventListener('scroll', this.medirTeclado);
    }
  }

  // ── Búsqueda ───────────────────────────────────────────────────────

  onBuscar(evento: Event): void {
    this.query = (evento.target as HTMLInputElement).value;
    this.filtrar();
    /* Con algo escrito se deja marcada la primera coincidencia: así "Enter"
       elige lo que se está viendo arriba sin bajar con las flechas, que en el
       teléfono es el único camino cómodo. */
    this.activo = this.query && this.planas.length ? 0 : -1;
    this.desplazarAlActivo();
  }

  limpiarBusqueda(): void {
    this.query = '';
    this.filtrar();
    this.activo = -1;
    this.buscador?.nativeElement.focus();
  }

  /**
   * Escribir el departamento saca sus ciudades enteras. Buscar "ant" tenía que
   * dar Antioquia completa y no solo los municipios con esas letras en el
   * nombre, que es como se busca cuando uno sabe la región pero no el pueblo.
   */
  private filtrar(): void {
    const texto = normalizar(this.query);

    if (!texto) {
      this.filteredGroups = this.gruposOrigen;
    } else {
      this.filteredGroups = this.gruposOrigen
        .map((grupo) => {
          if (normalizar(grupo.state).includes(texto)) return grupo;
          return {
            state: grupo.state,
            cities: grupo.cities.filter((ciudad) =>
              normalizar(ciudad.name).includes(texto),
            ),
          };
        })
        .filter((grupo) => grupo.cities.length > 0);
    }

    this.planas = this.filteredGroups.flatMap<CityOption | null>(
      (grupo) => grupo.cities,
    );

    /* "Todos" encabeza la lista, pero solo sin nada escrito: quien busca una
       ciudad no está buscando quitar el filtro. */
    if (this.mostrarTodas) this.planas.unshift(null);
  }

  /** ¿Se enseña la fila que no elige ninguna ciudad? */
  get mostrarTodas(): boolean {
    return !!this.emptyOptionLabel && !this.query;
  }

  /** Lo que se lee en el campo cerrado. */
  get textoDisparador(): string {
    return this.selectedLabel || this.emptyOptionLabel || this.placeholder;
  }

  /** Gris de invitación solo cuando de verdad no hay nada que enseñar. Un
   *  filtro en "Todos" no está vacío: está en su valor de siempre. */
  get disparadorVacio(): boolean {
    return !this.selectedLabel && !this.emptyOptionLabel;
  }

  // ── Selección ──────────────────────────────────────────────────────

  /** `null` es la fila de "Todos": deja el campo sin ciudad. */
  seleccionar(ciudad: CityOption | null): void {
    this.selectedId = ciudad ? String(ciudad.id) : null;
    this.selectedLabel = ciudad ? ciudad.name : '';
    /* Se emite texto y no el número crudo para mandar al backend exactamente
       lo mismo que mandaba el `<select>`, cuyo `[value]` ya era una cadena. */
    this.alCambiar(this.selectedId);
    this.cerrar();
  }

  isSelected(ciudad: CityOption | null): boolean {
    return ciudad
      ? String(ciudad.id) === this.selectedId
      : this.selectedId === null;
  }

  optionId(ciudad: CityOption | null): string {
    return `${this.listboxId}-op-${ciudad ? ciudad.id : 'todas'}`;
  }

  /** Lo que lee el lector de pantalla como opción en curso. */
  get activeOptionId(): string | null {
    /* Se mira el índice y no el valor: la fila de "Todos" es un `null` de
       pleno derecho y también tiene que poder estar marcada. */
    if (this.activo < 0 || this.activo >= this.planas.length) return null;
    return this.optionId(this.planas[this.activo]);
  }

  // ── Teclado ────────────────────────────────────────────────────────

  onKeydown(evento: KeyboardEvent): void {
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.mover(1);
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.mover(-1);
        break;
      case 'Home':
        evento.preventDefault();
        this.irA(0);
        break;
      case 'End':
        evento.preventDefault();
        this.irA(this.planas.length - 1);
        break;
      case 'Enter': {
        /* Sin esto "Enter" enviaría el formulario de propietarios entero, que
           es lo que hace la tecla dentro de un `<form>`. */
        evento.preventDefault();
        if (this.activo >= 0 && this.activo < this.planas.length) {
          this.seleccionar(this.planas[this.activo]);
        }
        break;
      }
      case 'Escape':
        evento.preventDefault();
        this.cerrar();
        break;
      case 'Tab':
        /* Salir con el tabulador cierra, pero el foco se lo queda el navegador:
           devolverlo al disparador dejaría el recorrido dando vueltas. */
        this.cerrar(false);
        break;
    }
  }

  private mover(paso: number): void {
    if (!this.planas.length) return;
    const total = this.planas.length;

    /* Sin nada marcado, bajar entra por arriba y subir por abajo. Contar desde
       el -1 con la vuelta puesta dejaba la primera flecha hacia arriba en la
       penúltima ciudad, que no es de donde se espera empezar. */
    if (this.activo < 0) {
      this.irA(paso > 0 ? 0 : total - 1);
      return;
    }

    this.irA((this.activo + paso + total) % total);
  }

  private irA(indice: number): void {
    if (indice < 0 || indice >= this.planas.length) return;
    this.activo = indice;
    this.desplazarAlActivo();
  }

  /** La opción marcada tiene que verse; el encabezado pegajoso del
   *  departamento tapa la primera fila si no se deja margen. */
  private desplazarAlActivo(): void {
    const id = this.activeOptionId;
    if (!id) return;

    setTimeout(() => {
      const nodo = this.lista?.nativeElement.querySelector(
        `#${CSS.escape(id)}`,
      );
      nodo?.scrollIntoView({ block: 'nearest' });
    });
  }

  private sincronizarEtiqueta(): void {
    if (this.selectedId !== null) {
      for (const grupo of this.gruposOrigen) {
        const ciudad = grupo.cities.find(
          (candidata) => String(candidata.id) === this.selectedId,
        );
        if (ciudad) {
          this.selectedLabel = ciudad.name;
          return;
        }
      }
    }

    /* Sin ciudad que enseñar, el campo vuelve a su texto de invitación. Dejar
       la etiqueta anterior haría que un formulario ya vaciado —cambiar de
       viaje redondo a sencillo borra el destino de regreso— siguiera
       enseñando la ciudad de antes como si estuviera elegida. */
    this.selectedLabel = '';
  }
}
