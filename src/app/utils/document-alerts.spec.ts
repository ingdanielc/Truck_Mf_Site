import { ModelDocumentFile } from '../models/document-model';
import {
  REQUIRED_VEHICLE_DOCUMENTS,
  buildDocumentAlertGroup,
  buildDriverAlertGroup,
  buildLicenseAlertGroup,
  summarizeDocumentAlerts,
} from './document-alerts';

/** `yyyy-MM-dd` a tantos días de hoy, en hora local. */
const enDias = (dias: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const documento = (
  nombre: string,
  expiryDate: string | null,
): ModelDocumentFile => ({
  documentFileTypeId: 1,
  documentFileType: {
    id: 1,
    name: nombre,
    appliesTo: 'VEHICLE',
    requiresExpiry: true,
    isActive: true,
  },
  expiryDate,
});

describe('document-alerts', () => {
  describe('buildDocumentAlertGroup', () => {
    it('deja solo los vencidos y por vencer', () => {
      const grupo = buildDocumentAlertGroup('Vehículo ABC-123', [
        documento('SOAT', enDias(-5)),
        documento('Seguro todo riesgo', enDias(12)),
        documento('Tecnomecánica', enDias(200)),
        documento('Tarjeta de propiedad', null),
      ]);

      expect(grupo?.label).toBe('Vehículo ABC-123');
      expect(grupo?.items.map((i) => [i.name, i.state])).toEqual([
        ['SOAT', 'vencido'],
        ['Seguro todo riesgo', 'por-vencer'],
      ]);
      expect(grupo?.items[0].label).toBe('Venció hace 5 días');
    });

    it('formatea el vencimiento como dd/MM/yyyy', () => {
      const grupo = buildDocumentAlertGroup('V', [
        documento('SOAT', '2020-01-31'),
      ]);
      expect(grupo?.items[0].expiryDate).toBe('31/01/2020');
    });

    it('sin novedades no hay grupo', () => {
      expect(
        buildDocumentAlertGroup('V', [documento('SOAT', enDias(90))]),
      ).toBeNull();
      expect(buildDocumentAlertGroup('V', [])).toBeNull();
    });
  });

  describe('documentos requeridos', () => {
    it('avisa el SOAT y la tecnomecánica que faltan, no los opcionales', () => {
      const grupo = buildDocumentAlertGroup(
        'V',
        [documento('Seguro todo riesgo', enDias(200))],
        REQUIRED_VEHICLE_DOCUMENTS,
      );
      expect(grupo?.items.map((i) => [i.name, i.state])).toEqual([
        ['SOAT', 'faltante'],
        ['Revisión tecnomecánica', 'faltante'],
      ]);
    });

    it('reconoce los tipos sin importar tildes, guiones ni mayúsculas', () => {
      const grupo = buildDocumentAlertGroup(
        'V',
        [
          documento('Soat', enDias(200)),
          documento('Revisión Técnico-Mecánica', enDias(200)),
        ],
        REQUIRED_VEHICLE_DOCUMENTS,
      );
      expect(grupo).toBeNull();
    });

    it('un requerido vencido cuenta como agregado', () => {
      const grupo = buildDocumentAlertGroup(
        'V',
        [
          documento('SOAT', enDias(-3)),
          documento('Tecnomecánica', enDias(200)),
        ],
        REQUIRED_VEHICLE_DOCUMENTS,
      );
      expect(grupo?.items.map((i) => i.state)).toEqual(['vencido']);
    });
  });

  describe('buildDriverAlertGroup', () => {
    it('sin licencia entre sus documentos, solo avisa que falta', () => {
      const grupo = buildDriverAlertGroup('C', [], enDias(-2));
      expect(grupo?.items.map((i) => [i.name, i.state])).toEqual([
        ['Licencia de conducción', 'faltante'],
      ]);
    });

    it('con la licencia agregada, usa el vencimiento del documento', () => {
      const grupo = buildDriverAlertGroup(
        'C',
        [documento('Licencia de conducción', enDias(5))],
        enDias(-100),
      );
      expect(grupo?.items.map((i) => i.state)).toEqual(['critico']);
    });

    it('sin documentos cargados solo revisa licenseExpiry', () => {
      expect(buildDriverAlertGroup('C', null, enDias(100))).toBeNull();
      expect(
        buildDriverAlertGroup('C', null, enDias(-1))?.items.map((i) => i.state),
      ).toEqual(['vencido']);
    });
  });

  describe('buildLicenseAlertGroup', () => {
    it('avisa la licencia a punto de vencer, aunque venga con hora', () => {
      const grupo = buildLicenseAlertGroup(
        'Conductor Juan',
        `${enDias(3)}T00:00:00`,
      );
      expect(grupo?.items[0].name).toBe('Licencia de conducción');
      expect(grupo?.items[0].state).toBe('critico');
    });

    it('sin fecha o vigente no hay grupo', () => {
      expect(buildLicenseAlertGroup('C', null)).toBeNull();
      expect(buildLicenseAlertGroup('C', enDias(100))).toBeNull();
    });
  });

  describe('summarizeDocumentAlerts', () => {
    it('cuenta vencidos y por vencer', () => {
      const resumen = summarizeDocumentAlerts([
        buildDocumentAlertGroup('V', [
          documento('SOAT', enDias(-1)),
          documento('Tecnomecánica', enDias(-20)),
        ])!,
        buildLicenseAlertGroup('C', enDias(20))!,
      ]);
      expect(resumen.text).toBe('2 documentos vencidos y 1 por vencer');
      expect(resumen.isCritical).toBeTrue();
    });

    it('solo por vencer, fuera de los últimos días, no es crítico', () => {
      const resumen = summarizeDocumentAlerts([
        buildLicenseAlertGroup('C', enDias(20))!,
      ]);
      expect(resumen.text).toBe('1 documento por vencer');
      expect(resumen.missingText).toBe('');
      expect(resumen.isCritical).toBeFalse();
    });

    it('cuenta los requeridos que faltan aparte y los pinta en rojo', () => {
      const resumen = summarizeDocumentAlerts([
        buildDocumentAlertGroup('V', [], REQUIRED_VEHICLE_DOCUMENTS)!,
      ]);
      expect(resumen.text).toBe('');
      expect(resumen.missingText).toBe('Falta agregar 2 documentos requeridos');
      expect(resumen.isCritical).toBeTrue();
    });

    it('en sus últimos días ya es crítico', () => {
      const resumen = summarizeDocumentAlerts([
        buildLicenseAlertGroup('C', enDias(2))!,
      ]);
      expect(resumen.isCritical).toBeTrue();
    });
  });
});
