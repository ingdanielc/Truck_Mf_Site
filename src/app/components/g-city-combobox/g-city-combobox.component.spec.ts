import { ChangeDetectorRef } from '@angular/core';
import { CityGroup, GCityComboboxComponent } from './g-city-combobox.component';

/** Dos departamentos bastan para probar el agrupado y el recorrido. */
const GRUPOS: CityGroup[] = [
  {
    state: 'Antioquia',
    cities: [
      { id: 1, name: 'Medellín', state: 'Antioquia' },
      { id: 2, name: 'Envigado', state: 'Antioquia' },
    ],
  },
  {
    state: 'Cundinamarca',
    cities: [
      { id: 3, name: 'Bogotá', state: 'Cundinamarca' },
      { id: 4, name: 'Soacha', state: 'Cundinamarca' },
    ],
  },
];

/** Vista sin plantilla: aquí se prueba la lógica, no el dibujo. */
const detector = { detectChanges: () => {} } as ChangeDetectorRef;

const tecla = (key: string): KeyboardEvent =>
  ({ key, preventDefault: () => {} }) as KeyboardEvent;

const escribir = (combo: GCityComboboxComponent, texto: string): void =>
  combo.onBuscar({ target: { value: texto } } as unknown as Event);

/**
 * Un `PointerEvent` de mentira sobre la hoja. `closest` contesta lo que
 * contestaría en la cabecera —fuera de la lista y del buscador—, que es de
 * donde sale el gesto.
 */
const puntero = (clientY: number, enZonaMuerta = false): PointerEvent =>
  ({
    clientY,
    pointerId: 1,
    target: { closest: () => (enZonaMuerta ? {} : null) },
    currentTarget: null,
  }) as unknown as PointerEvent;

/** La barrita solo existe en el teléfono, y sin ella no hay gesto. */
const enTelefono = (combo: GCityComboboxComponent): void => {
  (combo as unknown as { barrita: unknown }).barrita = {
    nativeElement: { offsetParent: {} },
  };
};

/** Arrastre desde `desde` hasta `hasta`, en píxeles de pantalla. */
const arrastrar = (
  combo: GCityComboboxComponent,
  desde: number,
  hasta: number,
  enZonaMuerta = false,
): void => {
  combo.onDragStart(puntero(desde, enZonaMuerta));
  combo.onDragMove(puntero(hasta, enZonaMuerta));
  combo.onDragEnd();
};

/** Los nombres que quedan a la vista, en el orden en que se ven. */
const visibles = (combo: GCityComboboxComponent): string[] =>
  combo.filteredGroups.flatMap((grupo) =>
    grupo.cities.map((ciudad) => ciudad.name),
  );

describe('GCityComboboxComponent', () => {
  let combo: GCityComboboxComponent;
  let emitido: string | null | undefined;

  beforeEach(() => {
    combo = new GCityComboboxComponent(detector);
    combo.groups = GRUPOS;
    emitido = undefined;
    combo.registerOnChange((valor) => (emitido = valor));
  });

  it('busca sin tildes: "bogota" encuentra Bogotá', () => {
    combo.abrir();
    escribir(combo, 'bogota');

    expect(visibles(combo)).toEqual(['Bogotá']);
  });

  /* Quien sabe la región pero no el municipio escribe el departamento. */
  it('escribir el departamento saca todas sus ciudades', () => {
    combo.abrir();
    escribir(combo, 'ant');

    expect(visibles(combo)).toEqual(['Medellín', 'Envigado']);
  });

  it('sin coincidencias no queda ningún grupo a la vista', () => {
    combo.abrir();
    escribir(combo, 'zzz');

    expect(combo.filteredGroups).toEqual([]);
  });

  /* Con algo escrito, "Enter" elige lo primero de la lista sin bajar con las
     flechas: en el teléfono es el único camino cómodo. */
  it('Enter elige la primera coincidencia de la búsqueda', () => {
    combo.abrir();
    escribir(combo, 'envi');
    combo.onKeydown(tecla('Enter'));

    expect(emitido).toBe('2');
    expect(combo.selectedLabel).toBe('Envigado');
    expect(combo.open).toBeFalse();
  });

  it('las flechas recorren las ciudades de todos los departamentos', () => {
    combo.abrir();
    combo.onKeydown(tecla('ArrowDown'));
    combo.onKeydown(tecla('ArrowDown'));
    combo.onKeydown(tecla('ArrowDown'));
    combo.onKeydown(tecla('Enter'));

    expect(combo.selectedLabel).toBe('Bogotá');
  });

  it('subir desde la primera da la vuelta a la última', () => {
    combo.abrir();
    combo.onKeydown(tecla('ArrowUp'));
    combo.onKeydown(tecla('Enter'));

    expect(combo.selectedLabel).toBe('Soacha');
  });

  it('Escape cierra y deja la selección como estaba', () => {
    combo.writeValue(1);
    combo.abrir();
    escribir(combo, 'soa');
    combo.onKeydown(tecla('Escape'));

    expect(combo.open).toBeFalse();
    expect(combo.selectedLabel).toBe('Medellín');
    expect(emitido).toBeUndefined();
  });

  /* El formulario trae el id como número al editar y como texto al haberlo
     tocado; los dos tienen que pintar la misma ciudad. */
  it('reconoce el valor tanto en número como en texto', () => {
    combo.writeValue(3);
    expect(combo.selectedLabel).toBe('Bogotá');

    combo.writeValue('4');
    expect(combo.selectedLabel).toBe('Soacha');
  });

  /* Vacío se escribe de varias formas según de dónde venga el formulario. */
  it('reconoce como vacío el nulo, la cadena vacía y la cadena "null"', () => {
    for (const vacio of [null, '', 'null']) {
      combo.writeValue(3);
      combo.writeValue(vacio);

      expect(combo.selectedLabel).toBe('');
    }
  });

  /* Pasar de viaje redondo a sencillo vacía el destino de regreso. Si la
     etiqueta se quedara, el campo seguiría enseñando la ciudad de antes. */
  it('vaciar el campo borra la ciudad que se estaba enseñando', () => {
    combo.writeValue(3);
    expect(combo.selectedLabel).toBe('Bogotá');

    combo.writeValue(null);

    expect(combo.selectedLabel).toBe('');
  });

  /* Un id que no está en la lista tampoco puede dejar la etiqueta anterior. */
  it('un id desconocido deja el campo sin ciudad', () => {
    combo.writeValue(3);

    combo.writeValue(999);

    expect(combo.selectedLabel).toBe('');
  });

  /* Las ciudades llegan del servidor después del primer dibujado. */
  it('pinta la etiqueta cuando las ciudades llegan después del valor', () => {
    const tardio = new GCityComboboxComponent(detector);
    tardio.writeValue(2);
    expect(tardio.selectedLabel).toBe('');

    tardio.groups = GRUPOS;

    expect(tardio.selectedLabel).toBe('Envigado');
  });

  it('bajar la hoja con el dedo la cierra sin elegir', () => {
    combo.writeValue(1);
    enTelefono(combo);
    combo.abrir();

    arrastrar(combo, 300, 420);

    expect(combo.open).toBeFalse();
    expect(combo.selectedLabel).toBe('Medellín');
    expect(emitido).toBeUndefined();
  });

  it('un arrastre corto devuelve la hoja a su sitio', () => {
    enTelefono(combo);
    combo.abrir();

    arrastrar(combo, 300, 330);

    expect(combo.open).toBeTrue();
    expect(combo.dragOffset).toBe(0);
  });

  /* De la lista y del buscador no sale el gesto: ahí el dedo hacia abajo
     recorre las ciudades o escribe. */
  it('arrastrar desde la lista no mueve la hoja', () => {
    enTelefono(combo);
    combo.abrir();

    arrastrar(combo, 300, 420, true);

    expect(combo.open).toBeTrue();
  });

  /* De tableta en adelante esto es un desplegable, no una hoja. */
  it('sin barrita a la vista no hay gesto', () => {
    combo.abrir();

    arrastrar(combo, 300, 420);

    expect(combo.open).toBeTrue();
  });

  /* Los filtros del listado de viajes vacían con `null`, que es lo que su
     `if (this.originFilter)` entiende como "sin filtro", y lo mismo que deja
     el botón de limpiar. */
  describe('con la fila de "Todos"', () => {
    beforeEach(() => {
      combo.emptyOptionLabel = 'Todos';
      combo.writeValue(3);
    });

    it('elegirla vacía el campo y emite nulo', () => {
      combo.abrir();
      combo.seleccionar(null);

      expect(emitido).toBeNull();
      expect(combo.selectedLabel).toBe('');
      expect(combo.textoDisparador).toBe('Todos');
    });

    it('encabeza la lista y se recorre con las flechas', () => {
      combo.abrir();
      combo.onKeydown(tecla('Home'));
      combo.onKeydown(tecla('Enter'));

      expect(emitido).toBeNull();
    });

    it('se marca como elegida cuando el campo está vacío', () => {
      combo.writeValue(null);

      expect(combo.isSelected(null)).toBeTrue();
    });

    /* Quien escribe está buscando una ciudad, no quitar el filtro. */
    it('desaparece en cuanto se escribe algo', () => {
      combo.abrir();
      expect(combo.mostrarTodas).toBeTrue();

      escribir(combo, 'bog');

      expect(combo.mostrarTodas).toBeFalse();
    });

    /* En un filtro, "Todos" no es un hueco por rellenar. */
    it('el campo no se pinta como vacío', () => {
      combo.writeValue(null);

      expect(combo.disparadorVacio).toBeFalse();
    });
  });

  /* Sin esa fila, el campo es obligatorio y enseña su texto de invitación. */
  it('sin fila de "Todos" el campo vacío se pinta como tal', () => {
    combo.writeValue(null);

    expect(combo.textoDisparador).toBe('Selecciona');
    expect(combo.disparadorVacio).toBeTrue();
  });

  it('manda el id como texto, igual que el select al que reemplaza', () => {
    combo.abrir();
    combo.seleccionar(GRUPOS[0].cities[0]);

    expect(emitido).toBe('1');
  });
});
