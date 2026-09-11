import { DocumentNumberPipe } from '../pipes/document-number.pipe';
import { ComboOption } from '../components/g-search-combobox/g-search-combobox.component';

/** Lo que el buscador necesita de un propietario. Se pide suelto y no como
 *  `ModelOwner` porque cada pantalla lo trae con su propio tipo. */
export interface OwnerLike {
  id?: string | number | null;
  name?: string;
  documentNumber?: string | number | null;
}

const documento = new DocumentNumberPipe();

/**
 * Los propietarios como filas del buscador.
 *
 * El texto es el mismo que enseñaba el `<select>` de antes, para que quien ya
 * conocía la lista la siga leyendo igual. Donde había documento se conserva:
 * en el panel hay propietarios que se llaman parecido y el número es lo único
 * que los separa.
 *
 * Se llama al cargar la lista y no desde la plantilla: el buscador vuelve a
 * filtrar cada vez que le cambia el arreglo, y un `get` devolvería uno nuevo
 * en cada ciclo de detección de cambios.
 */
export function ownerComboOptions(
  owners: OwnerLike[] | null | undefined,
  conDocumento = false,
): ComboOption[] {
  return (owners ?? [])
    /* Sin id no hay nada que elegir: la fila no podría devolver un valor. */
    .filter((owner) => owner.id !== null && owner.id !== undefined)
    .map((owner) => {
      const nombre = owner.name ?? '';
      const numero = conDocumento
        ? documento.transform(owner.documentNumber)
        : '';
      return {
        id: owner.id as string | number,
        name: numero ? `${nombre} - ${numero}` : nombre,
      };
    });
}
