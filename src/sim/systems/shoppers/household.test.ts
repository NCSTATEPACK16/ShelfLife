import { describe, expect, it } from 'vitest';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_SEGMENT_CONFIG } from '../market/index.js';
import { advancePantryDay, deriveShoppingList } from './household.js';

const CATALOG: readonly GoodDef[] = [
  { id: 'milk', name: 'Milk', unitPrice: 3, cost: 1.8, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05 },
  { id: 'bread', name: 'Bread', unitPrice: 2, cost: 1.2, depletionPerDay: 0.2, reorderThreshold: 0.3, impulseBase: 0.05 },
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
    const household = advancePantryDay(
      { id: 1, segment: 'family', pantry: { milk: 0.1, bread: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    expect(household.pantry.milk).toBeCloseTo(0); // 0.1 - 0.15 clamps to 0
    expect(household.pantry.bread).toBeCloseTo(0.8);
  });

  it('recomputes the shopping list after depleting', () => {
    const household = advancePantryDay(
      { id: 1, segment: 'family', pantry: { milk: 0.4, bread: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    expect(household.pantry.milk).toBeCloseTo(0.25);
    expect(household.list).toEqual(['milk']);
  });

  it('does not mutate the input household', () => {
    const original = { id: 1, segment: 'family' as const, pantry: { milk: 0.4 }, list: [] };
    advancePantryDay(original, CATALOG, DEFAULT_SEGMENT_CONFIG);
    expect(original.pantry.milk).toBe(0.4);
  });

  it('depletes faster for a segment with a higher consumptionMultiplier', () => {
    const base = { pantry: { milk: 1 }, list: [] };
    const priceHunter = advancePantryDay(
      { ...base, id: 1, segment: 'priceHunter' },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    const convenience = advancePantryDay(
      { ...base, id: 2, segment: 'convenience' },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    // segments.json5: priceHunter consumptionMultiplier 0.9, convenience 1.1 — convenience
    // depletes strictly faster from the same starting stock.
    expect(convenience.pantry.milk).toBeLessThan(priceHunter.pantry.milk!);
  });
});
