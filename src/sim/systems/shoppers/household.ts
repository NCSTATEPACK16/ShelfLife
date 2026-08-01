import type { GoodDef } from '../goods/types.js';
import type { Household } from './types.js';

/** Goods below their `reorderThreshold`, in catalog order (deterministic — no ties to break). */
export function deriveShoppingList(
  pantry: Readonly<Record<string, number>>,
  catalog: readonly GoodDef[],
): readonly string[] {
  const list: string[] = [];
  for (const good of catalog) {
    const stock = pantry[good.id] ?? 1;
    if (stock < good.reorderThreshold) list.push(good.id);
  }
  return list;
}

/** Depletes every good in `household.pantry` by one day, then recomputes the shopping list. */
export function advancePantryDay(household: Household, catalog: readonly GoodDef[]): Household {
  const pantry: Record<string, number> = {};
  for (const good of catalog) {
    const stock = household.pantry[good.id] ?? 1;
    pantry[good.id] = Math.max(0, stock - good.depletionPerDay);
  }
  return { ...household, pantry, list: deriveShoppingList(pantry, catalog) };
}
