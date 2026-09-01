import { describe, expect, it } from 'vitest';
import { travelCost } from './catchment.js';
import {
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_RIVAL_STORES,
  parseCatchmentConfig,
  parseRivalStore,
} from './config.js';

const CONFIG = { playerStorePosition: { x: 0, y: 0 }, distanceCostPerUnit: 0.5 };

describe('parseCatchmentConfig', () => {
  it('parses a valid config', () => {
    const config = parseCatchmentConfig(CONFIG);
    expect(config.distanceCostPerUnit).toBe(0.5);
    expect(config.playerStorePosition).toEqual({ x: 0, y: 0 });
  });

  it('rejects a non-positive distanceCostPerUnit', () => {
    expect(() => parseCatchmentConfig({ ...CONFIG, distanceCostPerUnit: 0 })).toThrow();
    expect(() => parseCatchmentConfig({ ...CONFIG, distanceCostPerUnit: -1 })).toThrow();
  });

  it('rejects a non-integer position coordinate', () => {
    expect(() =>
      parseCatchmentConfig({ ...CONFIG, playerStorePosition: { x: 0.5, y: 0 } }),
    ).toThrow();
  });

  it('rejects a non-finite position coordinate', () => {
    expect(() =>
      parseCatchmentConfig({
        ...CONFIG,
        playerStorePosition: { x: Number.POSITIVE_INFINITY, y: 0 },
      }),
    ).toThrow();
  });

  it('loads content/balance/catchment.json5 into DEFAULT_CATCHMENT_CONFIG', () => {
    expect(DEFAULT_CATCHMENT_CONFIG.playerStorePosition).toEqual({ x: 0, y: 0 });
    expect(DEFAULT_CATCHMENT_CONFIG.distanceCostPerUnit).toBeGreaterThan(0);
  });
});

describe('travelCost', () => {
  it('is zero at identical positions', () => {
    expect(travelCost({ x: 3, y: -2 }, { x: 3, y: -2 }, CONFIG)).toBe(0);
  });

  it('is symmetric', () => {
    const a = { x: 1, y: 7 };
    const b = { x: -4, y: 2 };
    expect(travelCost(a, b, CONFIG)).toBe(travelCost(b, a, CONFIG));
  });

  it('uses Manhattan distance, not Euclidean', () => {
    // (0,0) -> (3,4): Manhattan is 3 + 4 = 7. Euclidean would be 5. If this test ever
    // reads 5 * distanceCostPerUnit, someone has swapped in a straight-line distance and
    // broken §5.1's "road-network distance on a coarse catchment graph, not Euclidean".
    expect(travelCost({ x: 0, y: 0 }, { x: 3, y: 4 }, CONFIG)).toBeCloseTo(7 * 0.5);
    expect(travelCost({ x: 0, y: 0 }, { x: 3, y: 4 }, CONFIG)).not.toBeCloseTo(5 * 0.5);
  });

  it('handles negative coordinates', () => {
    expect(travelCost({ x: -3, y: -4 }, { x: 0, y: 0 }, CONFIG)).toBeCloseTo(7 * 0.5);
  });

  it('scales linearly with distanceCostPerUnit', () => {
    const near = travelCost({ x: 0, y: 0 }, { x: 2, y: 0 }, CONFIG);
    const doubled = travelCost({ x: 0, y: 0 }, { x: 2, y: 0 }, {
      ...CONFIG,
      distanceCostPerUnit: 1.0,
    });
    expect(doubled).toBeCloseTo(near * 2);
  });
});

const RIVAL = {
  id: 'sav-a-lott',
  name: 'Sav-A-Lott',
  archetype: 'Dying deep-discounter',
  communityLove: 22,
  position: { x: 4, y: -3 },
  identity: 'deep-discount',
  quality: 0.35,
  service: 0.15,
  ambiance: 0.1,
  priceIndex: 0.82,
  assortmentBreadth: 0.45,
};

describe('parseRivalStore', () => {
  it('parses a valid rival', () => {
    const rival = parseRivalStore(RIVAL);
    expect(rival.id).toBe('sav-a-lott');
    expect(rival.communityLove).toBe(22);
  });

  it('rejects communityLove outside [0, 100]', () => {
    expect(() => parseRivalStore({ ...RIVAL, communityLove: -1 })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, communityLove: 101 })).toThrow();
  });

  it('accepts communityLove exactly at both bounds', () => {
    expect(parseRivalStore({ ...RIVAL, communityLove: 0 }).communityLove).toBe(0);
    expect(parseRivalStore({ ...RIVAL, communityLove: 100 }).communityLove).toBe(100);
  });

  it('rejects quality, service, or ambiance outside [0, 1]', () => {
    expect(() => parseRivalStore({ ...RIVAL, quality: 1.1 })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, service: -0.1 })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, ambiance: 2 })).toThrow();
  });

  it('rejects a non-integer rival position', () => {
    expect(() => parseRivalStore({ ...RIVAL, position: { x: 1.5, y: 0 } })).toThrow();
  });

  it('rejects an empty required string', () => {
    expect(() => parseRivalStore({ ...RIVAL, id: '' })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, name: '' })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, archetype: '' })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, identity: '' })).toThrow();
  });

  it('rejects a rival missing a required field', () => {
    const { quality: _quality, ...incomplete } = RIVAL;
    expect(() => parseRivalStore(incomplete)).toThrow();
  });

  it('loads content/rivals/sav-a-lott.json5 with PLAN.md §3 table values', () => {
    // Roster: Sav-A-Lott (L1), Grocerteria 24 (L2), BulkHaus Club (L3) — Rival Dynamics
    // (M2 2.0 sub-project A) grew this from 1 to 3.
    expect(DEFAULT_RIVAL_STORES).toHaveLength(3);
    const savALott = DEFAULT_RIVAL_STORES[0]!;
    expect(savALott.id).toBe('sav-a-lott');
    expect(savALott.archetype).toBe('Dying deep-discounter');
    expect(savALott.communityLove).toBe(22);
  });

  it('places Sav-A-Lott somewhere other than the player store', () => {
    // A rival co-located with the player would make travelCost identical for every
    // household, quietly neutering the term the logit sub-phase is about to consume.
    expect(DEFAULT_RIVAL_STORES[0]!.position).not.toEqual(
      DEFAULT_CATCHMENT_CONFIG.playerStorePosition,
    );
  });
});
