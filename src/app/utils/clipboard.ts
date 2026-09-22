/**
 * Copiar al portapapeles, con respaldo para donde la API no existe.
 *
 * `navigator.clipboard` solo está en contexto seguro (HTTPS o localhost) y
 * falta en algunos WebView, que es justamente donde corre la aplicación cuando
 * se abre desde el celular. De ahí el respaldo con un campo oculto: `execCommand`
 * está obsoleto, pero es el único camino que queda ahí.
 *
 * Importante: el portapapeles solo atiende dentro del gesto del usuario, así
 * que hay que llamarlo desde el mismo `click` y no después de un `await`.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const texto = (text ?? '').trim();
  if (!texto) return false;

  const clipboard = globalThis.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(texto);
      return true;
    } catch {
      /* Permiso negado o contexto inseguro: queda el respaldo. */
    }
  }

  return copyWithHiddenField(texto);
}

function copyWithHiddenField(text: string): boolean {
  try {
    const campo = document.createElement('textarea');
    campo.value = text;
    campo.setAttribute('readonly', '');
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    const copiado = document.execCommand('copy');
    document.body.removeChild(campo);
    return copiado;
  } catch {
    return false;
  }
}

/**
 * El número tal como se marca: solo dígitos y, si lo trae, el `+` del país.
 *
 * En pantalla el celular va con espacios —"300 123 4567"— porque así se lee,
 * pero pegado en WhatsApp o en el marcador los espacios estorban.
 */
export function phoneDigits(phone?: string | null): string {
  const texto = String(phone ?? '').trim();
  const signo = texto.startsWith('+') ? '+' : '';
  return signo + texto.replaceAll(/\D/g, '');
}
