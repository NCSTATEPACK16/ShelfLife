import { describe, expect, it } from 'vitest';
import type { GoodDef } from '../goods/types.js';
import { travelCost } from './catchment.js';
import { DEFAULT_CATCHMENT_CONFIG, DEFAULT_SEGMENT_CONFIG } from './config.js';
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
      { id: 1, segment: 'family', position: { x: 0, y: 0 }, pantry: { milk: 0.1, bread: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    expect(household.pantry.milk).toBeCloseTo(0); // 0.1 - 0.15 clamps to 0
    expect(household.pantry.bread).toBeCloseTo(0.8);
  });

  it('recomputes the shopping list after depleting', () => {
    const household = advancePantryDay(
      { id: 1, segment: 'family', position: { x: 0, y: 0 }, pantry: { milk: 0.4, bread: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    expect(household.pantry.milk).toBeCloseTo(0.25);
    expect(household.list).toEqual(['milk']);
  });

  it('does not mutate the input household', () => {
    const original = {
      id: 1,
      segment: 'family' as const,
      position: { x: 0, y: 0 },
      pantry: { milk: 0.4 },
      list: [],
    };
    advancePantryDay(original, CATALOG, DEFAULT_SEGMENT_CONFIG);
    expect(original.pantry.milk).toBe(0.4);
  });

  it('depletes faster for a segment with a higher consumptionMultiplier', () => {
    const base = { position: { x: 0, y: 0 }, pantry: { milk: 1 }, list: [] };
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

describe('household catchment position', () => {
  it('gives two households at different positions different, deterministic travel costs', () => {
    const near = {
      id: 1,
      segment: 'family' as const,
      position: { x: 1, y: 0 },
      pantry: {},
      list: [],
    };
    const far = {
      id: 2,
      segment: 'family' as const,
      position: { x: 3, y: 4 },
      pantry: {},
      list: [],
    };
    const store = DEFAULT_CATCHMENT_CONFIG.playerStorePosition;
    const unit = DEFAULT_CATCHMENT_CONFIG.distanceCostPerUnit;

    const nearCost = travelCost(near.position, store, DEFAULT_CATCHMENT_CONFIG);
    const farCost = travelCost(far.position, store, DEFAULT_CATCHMENT_CONFIG);

    // Hand-computed Manhattan distance from the origin: 1 and 3 + 4 = 7.
    expect(nearCost).toBeCloseTo(1 * unit);
    expect(farCost).toBeCloseTo(7 * unit);
    expect(farCost).toBeGreaterThan(nearCost);
  });

  it('is deterministic — the same household position yields the same cost every call', () => {
    const position = { x: -2, y: 5 };
    const first = travelCost(position, DEFAULT_CATCHMENT_CONFIG.playerStorePosition, DEFAULT_CATCHMENT_CONFIG);
    const second = travelCost(position, DEFAULT_CATCHMENT_CONFIG.playerStorePosition, DEFAULT_CATCHMENT_CONFIG);
    expect(first).toBe(second);
  });
});
