export class Formatters {
  static formatPhone(phone: string | undefined): string {
    if (!phone) return '';
    const unmasked = phone.replaceAll(/\D/g, '');
    if (unmasked.length === 10) {
      return `${unmasked.substring(0, 3)} ${unmasked.substring(3, 6)} ${unmasked.substring(6, 8)} ${unmasked.substring(8, 10)}`;
    }
    return phone || '';
  }

  static formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
