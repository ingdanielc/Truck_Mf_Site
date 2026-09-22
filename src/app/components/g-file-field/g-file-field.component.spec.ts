import { GFileFieldComponent } from './g-file-field.component';
import { MANIFEST_MAX_SIZE_MB } from 'src/app/utils/trip-manifest';

/* ==========================================================================
   El campo de archivo avisa de lo que rechaza, y ese aviso es lo que apaga el
   botón de guardar de quien lo usa. Como el archivo es opcional, eliminar lo
   rechazado tiene que dejar seguir sin él.
   ========================================================================== */

function archivo(nombre: string, megas = 1): File {
  const relleno = new Uint8Array(Math.round(megas * 1024 * 1024));
  return new File([relleno], nombre, { type: 'application/octet-stream' });
}

function evento(file: File): Event {
  const input = { files: [file], value: 'algo' } as unknown as HTMLInputElement;
  return { target: input } as unknown as Event;
}

describe('GFileFieldComponent', () => {
  let campo: GFileFieldComponent;
  let invalido: boolean | undefined;
  let elegido: File | undefined;

  beforeEach(() => {
    campo = new GFileFieldComponent();
    invalido = undefined;
    elegido = undefined;
    campo.invalid.subscribe((valor) => (invalido = valor));
    campo.fileSelected.subscribe((file) => (elegido = file));
  });

  it('un archivo válido se entrega y no avisa nada', () => {
    const bueno = archivo('manifiesto.pdf');

    campo.onSelected(evento(bueno));

    expect(elegido).toBe(bueno);
    expect(campo.error).toBe('');
    expect(invalido).toBeUndefined();
  });

  it('uno que se pasa del tope no se entrega y se anuncia inválido', () => {
    campo.onSelected(evento(archivo('enorme.pdf', MANIFEST_MAX_SIZE_MB + 1)));

    expect(elegido).toBeUndefined();
    expect(campo.error).toContain(`${MANIFEST_MAX_SIZE_MB} MB`);
    expect(invalido).toBeTrue();
  });

  it('eliminar lo rechazado limpia el aviso y lo anuncia', () => {
    campo.onSelected(evento(archivo('enorme.pdf', MANIFEST_MAX_SIZE_MB + 1)));

    campo.dismissError();

    expect(campo.error).toBe('');
    expect(invalido).toBeFalse();
  });

  it('elegir uno válido después del rechazo también lo anuncia', () => {
    campo.onSelected(evento(archivo('enorme.pdf', MANIFEST_MAX_SIZE_MB + 1)));

    campo.onSelected(evento(archivo('manifiesto.pdf')));

    expect(invalido).toBeFalse();
    expect(campo.error).toBe('');
  });

  it('quitar el archivo limpia el aviso', () => {
    let quitado = false;
    campo.removed.subscribe(() => (quitado = true));
    campo.onSelected(evento(archivo('enorme.pdf', MANIFEST_MAX_SIZE_MB + 1)));

    campo.remove();

    expect(quitado).toBeTrue();
    expect(campo.error).toBe('');
    expect(invalido).toBeFalse();
  });
});
