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

  /**
   * Placa en formato ABC-123. Si no tiene 6 caracteres alfanuméricos
   * se devuelve en mayúsculas sin separador.
   */
  static formatPlate(value: string | null | undefined): string {
    const plate = String(value ?? '')
      .replaceAll(/[^a-zA-Z0-9]/g, '')
      .toUpperCase();
    if (plate.length !== 6) return plate;
    return `${plate.substring(0, 3)}-${plate.substring(3, 6)}`;
  }

  /**
   * Odometro del vehiculo. El back ya entrega en `totalKm` el kilometraje
   * inicial mas el de los viajes completados, asi que aqui solo se formatea.
   */
  static formatOdometer(totalKm?: number): string {
    return `${new Intl.NumberFormat('es-CO').format(totalKm || 0)} km`;
  }

  static formatDocNumber(value: any): string {
    const n = Number(String(value ?? '').replaceAll(/\D/g, ''));
    return Number.isNaN(n) || value === ''
      ? String(value ?? '')
      : new Intl.NumberFormat('es-CO').format(n);
  }
}
