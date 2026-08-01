import { describe, expect, it } from 'vitest';
import { parseCatalog, DEFAULT_CATALOG } from './catalog.js';

describe('parseCatalog', () => {
  it('parses a well-formed catalog', () => {
    const catalog = parseCatalog([
      { id: 'a', name: 'A', footprint: { width: 1, height: 1 }, walkable: false },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe('a');
  });

  it('rejects a catalog with a duplicate id', () => {
    expect(() =>
      parseCatalog([
        { id: 'a', name: 'A', footprint: { width: 1, height: 1 }, walkable: false },
        { id: 'a', name: 'A2', footprint: { width: 1, height: 1 }, walkable: false },
      ]),
    ).toThrow(/duplicate/i);
  });

  it('rejects a non-positive footprint dimension', () => {
    expect(() =>
      parseCatalog([{ id: 'a', name: 'A', footprint: { width: 0, height: 1 }, walkable: false }]),
    ).toThrow();
  });

  it('DEFAULT_CATALOG loads content/fixtures/catalog.json and validates', () => {
    expect(DEFAULT_CATALOG.length).toBeGreaterThan(0);
    expect(DEFAULT_CATALOG.find((f) => f.id === 'shelf_basic')).toBeDefined();
  });
});
