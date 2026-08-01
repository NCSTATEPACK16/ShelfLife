import { describe, expect, it } from 'vitest';
import { DEFAULT_GOODS_CATALOG, parseGoodsCatalog } from './catalog.js';

describe('parseGoodsCatalog', () => {
  it('parses a valid catalog', () => {
    const parsed = parseGoodsCatalog([
      { id: 'milk', name: 'Milk', unitPrice: 3.49, cost: 2.09, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05 },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe('milk');
  });

  it('rejects a duplicate id', () => {
    expect(() =>
      parseGoodsCatalog([
        { id: 'milk', name: 'A', unitPrice: 1, cost: 0.6, depletionPerDay: 0.1, reorderThreshold: 0.3, impulseBase: 0.05 },
        { id: 'milk', name: 'B', unitPrice: 1, cost: 0.6, depletionPerDay: 0.1, reorderThreshold: 0.3, impulseBase: 0.05 },
      ]),
    ).toThrow();
  });

  it('rejects an out-of-range reorderThreshold', () => {
    expect(() =>
      parseGoodsCatalog([
        { id: 'milk', name: 'Milk', unitPrice: 1, cost: 0.6, depletionPerDay: 0.1, reorderThreshold: 1.5, impulseBase: 0.05 },
      ]),
    ).toThrow();
  });

  it('loads content/goods/catalog.json into DEFAULT_GOODS_CATALOG', () => {
    expect(DEFAULT_GOODS_CATALOG.length).toBeGreaterThan(0);
    expect(DEFAULT_GOODS_CATALOG.find((g) => g.id === 'milk')).toBeDefined();
  });
});
