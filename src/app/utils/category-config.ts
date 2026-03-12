export interface CategoryConfig {
  name: string;
  icon: string;
  colorClass: string;
}

export const CATEGORY_UI_CONFIG: Record<string, CategoryConfig> = {
  combustible: {
    name: 'COMBUSTIBLE',
    icon: 'fa-solid fa-gas-pump',
    colorClass: 'text-warning bg-warning',
  },
  peajes: {
    name: 'PEAJES',
    icon: 'fa-solid fa-circle-dot',
    colorClass: 'text-indigo bg-indigo',
  },
  alimentación: {
    name: 'ALIMENTACIÓN',
    icon: 'fa-solid fa-utensils',
    colorClass: 'text-success bg-success',
  },
  parqueadero: {
    name: 'PARQUEADERO',
    icon: 'fa-solid fa-parking',
    colorClass: 'text-secondary bg-secondary',
  },
  papelería: {
    name: 'PAPELERÍA',
    icon: 'fa-solid fa-file-invoice',
    colorClass: 'text-info bg-info',
  },
  reparaciones: {
    name: 'REPARACIONES',
    icon: 'fa-solid fa-toolbox',
    colorClass: 'text-danger bg-danger',
  },
  mantenimiento: {
    name: 'MANTENIMIENTO',
    icon: 'fa-solid fa-gear',
    colorClass: 'text-info bg-info',
  },
  lavado: {
    name: 'LAVADO',
    icon: 'fa-solid fa-car-wash',
    colorClass: 'text-success bg-success',
  },
  llantas: {
    name: 'LLANTAS',
    icon: 'fa-solid fa-circle-notch',
    colorClass: 'text-secondary bg-secondary',
  },
  seguros: {
    name: 'SEGUROS',
    icon: 'fa-solid fa-shield-halved',
    colorClass: 'text-success bg-success',
  },
  hospedaje: {
    name: 'HOSPEDAJE',
    icon: 'fa-solid fa-bed',
    colorClass: 'text-primary bg-primary',
  },
  viáticos: {
    name: 'VIÁTICOS',
    icon: 'fa-solid fa-money-bill-wave',
    colorClass: 'text-info bg-info',
  },
  comunicaciones: {
    name: 'COMUNICACIONES',
    icon: 'fa-solid fa-mobile-screen',
    colorClass: 'text-secondary bg-secondary',
  },
  otros: {
    name: 'OTROS',
    icon: 'fa-solid fa-ellipsis',
    colorClass: 'text-secondary bg-secondary',
  },
  engrasada: {
    name: 'ENGRASADA',
    icon: 'fa-solid fa-oil-can',
    colorClass: 'text-info bg-info',
  },
  encarrosada: {
    name: 'ENCARROSADA',
    icon: 'fa-solid fa-truck-ramp-box',
    colorClass: 'text-primary bg-primary',
  },
  descarrosada: {
    name: 'DESCARROSADA',
    icon: 'fa-solid fa-truck-loading',
    colorClass: 'text-secondary bg-secondary',
  },
  bascula: {
    name: 'BASCULA',
    icon: 'fa-solid fa-weight-hanging',
    colorClass: 'text-info bg-info',
  },
  'lavado-brillado': {
    name: 'LAVADO-BRILLADO',
    icon: 'fa-solid fa-hands-bubbles',
    colorClass: 'text-success bg-success',
  },
  montallantas: {
    name: 'MONTALLANTAS',
    icon: 'fa-solid fa-wrench',
    colorClass: 'text-danger bg-danger',
  },
  accesorios: {
    name: 'ACCESORIOS',
    icon: 'fa-solid fa-plug',
    colorClass: 'text-warning bg-warning',
  },
  'alimentación conductor': {
    name: 'ALIMENTACION CONDUCTOR',
    icon: 'fa-solid fa-utensils',
    colorClass: 'text-success bg-success',
  },
  'hotel conductor': {
    name: 'HOTEL CONDUCTOR',
    icon: 'fa-solid fa-bed',
    colorClass: 'text-primary bg-primary',
  },
  'seguridad social conductor': {
    name: 'SEGURIDAD SOCIAL CONDUCTOR',
    icon: 'fa-solid fa-file-shield',
    colorClass: 'text-info bg-info',
  },
  'descuento empresa': {
    name: 'DESCUENTO EMPRESA',
    icon: 'fa-solid fa-building-circle-exclamation',
    colorClass: 'text-danger bg-danger',
  },
  retenciones: {
    name: 'RETENCIONES',
    icon: 'fa-solid fa-percent',
    colorClass: 'text-warning bg-warning',
  },
  'cambio cheque o papeleo': {
    name: 'CAMBIO CHEQUE O PAPELEO',
    icon: 'fa-solid fa-money-check-dollar',
    colorClass: 'text-success bg-success',
  },
  comisiones: {
    name: 'COMISIONES',
    icon: 'fa-solid fa-hand-holding-dollar',
    colorClass: 'text-info bg-info',
  },
  cargue: {
    name: 'CARGUE',
    icon: 'fa-solid fa-box-open',
    colorClass: 'text-primary bg-primary',
  },
  descargue: {
    name: 'DESCARGUE',
    icon: 'fa-solid fa-dolly',
    colorClass: 'text-secondary bg-secondary',
  },
  'impuesto 4x1000': {
    name: 'Impuesto 4x1000',
    icon: 'fa-solid fa-bank',
    colorClass: 'text-info bg-info',
  },
  créditos: {
    name: 'CRÉDITOS',
    icon: 'fa-solid fa-credit-card',
    colorClass: 'text-info bg-info',
  },
  'revisión tecnomecánica': {
    name: 'REVISIÓN TECNOMECÁNICA',
    icon: 'fa-solid fa-file-shield',
    colorClass: 'text-warning bg-warning',
  },
  'llantas y rines': {
    name: 'LLANTAS Y RINES',
    icon: 'fa-solid fa-circle-notch',
    colorClass: 'text-secondary bg-secondary',
  },
  'aceite, grasa, refrigerante': {
    name: 'ACEITE, GRASA, REFRIGERANTE',
    icon: 'fa-solid fa-oil-can',
    colorClass: 'text-info bg-info',
  },
  carrocería: {
    name: 'CARROCERÍA',
    icon: 'fa-solid fa-truck-front',
    colorClass: 'text-primary bg-primary',
  },
  'lujos y accesorios': {
    name: 'LUJOS Y ACCESORIOS',
    icon: 'fa-solid fa-star',
    colorClass: 'text-warning bg-warning',
  },
  eléctricos: {
    name: 'ELÉCTRICOS',
    icon: 'fa-solid fa-bolt',
    colorClass: 'text-warning bg-warning',
  },
  'mecánica general': {
    name: 'MECÁNICA GENERAL',
    icon: 'fa-solid fa-wrench',
    colorClass: 'text-danger bg-danger',
  },
  'mano de obra': {
    name: 'MANO DE OBRA',
    icon: 'fa-solid fa-user-gear',
    colorClass: 'text-indigo bg-indigo',
  },
  viajes: {
    name: 'VIAJES',
    icon: 'fa-solid fa-route',
    colorClass: 'text-primary bg-primary',
  },
  otro: {
    name: 'OTRO',
    icon: 'fa-solid fa-ellipsis',
    colorClass: 'text-secondary bg-secondary',
  },
};

export const DEFAULT_CATEGORY_CONFIG: CategoryConfig = {
  name: 'OTRO',
  icon: 'fa-solid fa-receipt',
  colorClass: 'text-secondary bg-secondary',
};

/**
 * Gets the category configuration based on the name.
 * @param name The category name
 * @returns The matching config or the default one.
 */
export function getCategoryConfigByName(name: string): CategoryConfig {
  if (!name) return DEFAULT_CATEGORY_CONFIG;
  const config = CATEGORY_UI_CONFIG[name.toLowerCase()];
  return config
    ? { ...config, name: name.toUpperCase() }
    : DEFAULT_CATEGORY_CONFIG;
}

/**
 * Fallback mapping for IDs if names are not available.
 * These match the original IDs in GExpenseCardComponent.
 */
export const CATEGORY_ID_MAP: Record<number, string> = {
  1: 'combustible',
  2: 'peajes',
  3: 'alimentación',
  4: 'reparaciones',
  5: 'mantenimiento',
  6: 'lavado',
};

export function getCategoryConfigById(id: number): CategoryConfig {
  const nameKey = CATEGORY_ID_MAP[id];
  return nameKey ? getCategoryConfigByName(nameKey) : DEFAULT_CATEGORY_CONFIG;
}
