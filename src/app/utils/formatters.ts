export class Formatters {
  static formatPhone(phone: string | undefined): string {
    if (!phone) return '';
    const unmasked = phone.replaceAll(/\D/g, '');
    if (unmasked.length === 10) {
      return `${unmasked.substring(0, 3)} ${unmasked.substring(3, 6)} ${unmasked.substring(6, 8)} ${unmasked.substring(8, 10)}`;
    }
    return phone || '';
  }

  /**
   * Nombre propio con cada palabra en mayúscula inicial.
   */
  static titleCase(value: string | undefined | null): string {
    const name = String(value ?? '').trim();
    if (!name) return '';
    return name
      .toLocaleLowerCase('es-CO')
      .replace(/(^|\s)\p{L}/gu, (c) => c.toLocaleUpperCase('es-CO'));
  }

  static formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
