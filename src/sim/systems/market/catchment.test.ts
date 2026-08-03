import { describe, expect, it } from 'vitest';
import { travelCost } from './catchment.js';
import { DEFAULT_CATCHMENT_CONFIG, parseCatchmentConfig } from './config.js';

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
