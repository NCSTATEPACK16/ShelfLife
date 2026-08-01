import { describe, expect, it } from 'vitest';
import type { GoodDef } from '../goods/types.js';
import { advancePantryDay, deriveShoppingList } from './household.js';

const CATALOG: readonly GoodDef[] = [
  { id: 'milk', name: 'Milk', unitPrice: 3, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05 },
  { id: 'bread', name: 'Bread', unitPrice: 2, depletionPerDay: 0.2, reorderThreshold: 0.3, impulseBase: 0.05 },
];

describe('deriveShoppingList', () => {
  it('lists goods below their reorderThreshold, in catalog order', () => {
    const list = deriveShoppingList({ milk: 0.2, bread: 0.9 }, CATALOG);
    expect(list).toEqual(['milk']);
  });

  it('treats a good missing from the pantry as fully stocked', () => {
    const list = deriveShoppingList({}, CATALOG);
    expect(list).toEqual([]);
  });

  it('returns an empty list when nothing is below threshold', () => {
    expect(deriveShoppingList({ milk: 1, bread: 1 }, CATALOG)).toEqual([]);
  });
});

describe('advancePantryDay', () => {
  it('depletes every good by its depletionPerDay, clamped to zero', () => {
    const household = advancePantryDay({ id: 1, pantry: { milk: 0.1, bread: 1 }, list: [] }, CATALOG);
    expect(household.pantry.milk).toBeCloseTo(0); // 0.1 - 0.15 clamps to 0
    expect(household.pantry.bread).toBeCloseTo(0.8);
  });

  it('recomputes the shopping list after depleting', () => {
    const household = advancePantryDay({ id: 1, pantry: { milk: 0.4, bread: 1 }, list: [] }, CATALOG);
    expect(household.pantry.milk).toBeCloseTo(0.25);
    expect(household.list).toEqual(['milk']);
  });

  it('does not mutate the input household', () => {
    const original = { id: 1, pantry: { milk: 0.4 }, list: [] };
    advancePantryDay(original, CATALOG);
    expect(original.pantry.milk).toBe(0.4);
  });
});
