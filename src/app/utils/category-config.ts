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
    icon: 'fa-solid fa-square-p',
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
