import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVAL_STORES, Stream } from '../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from './config.js';
import { buildHarnessWorld, generateHouseholds, MAX_LEVEL } from './world.js';

describe('buildHarnessWorld', () => {
  it('gives level N exactly the first N rivals by CL rank, target = level', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const { market, targetStoreIndex } = buildHarnessWorld(level, 1);
      expect(targetStoreIndex).toBe(level);
      // storeIndexOf uses the rival's id; the Nth rival (0-based level-1) must resolve.
      const expectedId = DEFAULT_RIVAL_STORES[level - 1]!.id;
      expect(market.storeIndexOf(expectedId)).toBe(level);
      expect(() => market.storeIndexOf(DEFAULT_RIVAL_STORES[level]?.id ?? 'no-such-store')).toThrow();
    }
  });

  it('rejects a level outside [1, MAX_LEVEL]', () => {
    expect(() => buildHarnessWorld(0, 1)).toThrow();
    expect(() => buildHarnessWorld(MAX_LEVEL + 1, 1)).toThrow();
  });
});

describe('generateHouseholds', () => {
  it('is deterministic for the same seed', () => {
    const a = generateHouseholds(new Stream(42), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    const b = generateHouseholds(new Stream(42), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = generateHouseholds(new Stream(1), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    const b = generateHouseholds(new Stream(2), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    expect(a).not.toEqual(b);
  });

  it('produces exactly householdCount households with unique ascending ids', () => {
    const households = generateHouseholds(new Stream(7), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    expect(households).toHaveLength(DEFAULT_HARNESS_CONFIG.world.householdCount);
    expect(households.map((h) => h.householdId)).toEqual(
      Array.from({ length: households.length }, (_, i) => i + 1),
    );
  });
});
