import { ModelExpense } from '../models/expense-model';
import { getCategoryConfigByName } from './category-config';

export interface ExpenseShortcut {
  /** Null en los accesos por defecto: el offcanvas los resuelve por nombre */
  categoryId: number | null;
  name: string;
  icon: string;
}

/** Cantidad de accesos rápidos que se muestran por cada tipo de gasto */
export const SHORTCUTS_PER_TYPE = 3;

/**
 * Accesos sugeridos mientras el propietario no tenga historial suficiente.
 * El uso real los va reemplazando: solo completan los cupos que falten.
 */
export const DEFAULT_EXPENSE_SHORTCUTS: Record<number, string[]> = {
  // Viaje
  3: ['COMBUSTIBLE', 'PEAJES', 'CARGUE'],
  // Vehículo
  1: ['LLANTAS Y RINES', 'ACEITE, GRASA, REFRIGERANTE', 'MECÁNICA GENERAL'],
  // Conductor
  2: ['ALIMENTACIÓN CONDUCTOR', 'HOTEL CONDUCTOR', 'VARIOS'],
  // Mantenimiento
  4: ['MANO DE OBRA', 'LUJOS Y ACCESORIOS', 'SEGUROS'],
};

/** Compara nombres de categoría sin tildes ni mayúsculas */
export function normalizeCategoryName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replaceAll(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/**
 * Las categorías vienen en mayúsculas: se muestran con solo la inicial en alta
 * ("VARIOS" → "Varios") para el tooltip del acceso rápido.
 */
export function formatCategoryLabel(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

interface CategoryUsage {
  categoryId: number;
  name: string;
  count: number;
}

/**
 * Devuelve los accesos rápidos de un tipo de gasto: primero las categorías más
 * usadas en el historial recibido y, si no alcanzan, las sugeridas por defecto.
 */
export function buildExpenseShortcuts(
  expenses: ModelExpense[],
  typeId: number,
): ExpenseShortcut[] {
  const usage = new Map<number, CategoryUsage>();

  for (const expense of expenses) {
    const category = expense.category;
    if (!category?.id || category.expenseTypeId !== typeId) continue;

    const current = usage.get(category.id);
    if (current) {
      current.count++;
    } else {
      usage.set(category.id, {
        categoryId: category.id,
        name: category.name,
        count: 1,
      });
    }
  }

  const shortcuts: ExpenseShortcut[] = [...usage.values()]
    .sort(
      (a, b) =>
        b.count - a.count ||
        a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }),
    )
    .slice(0, SHORTCUTS_PER_TYPE)
    .map((item) => ({
      categoryId: item.categoryId,
      name: formatCategoryLabel(item.name),
      icon: getCategoryConfigByName(item.name).icon,
    }));

  const used = new Set(shortcuts.map((s) => normalizeCategoryName(s.name)));
  for (const name of DEFAULT_EXPENSE_SHORTCUTS[typeId] ?? []) {
    if (shortcuts.length >= SHORTCUTS_PER_TYPE) break;
    if (used.has(normalizeCategoryName(name))) continue;
    used.add(normalizeCategoryName(name));
    shortcuts.push({
      categoryId: null,
      name: formatCategoryLabel(name),
      icon: getCategoryConfigByName(name).icon,
    });
  }

  return shortcuts;
}
