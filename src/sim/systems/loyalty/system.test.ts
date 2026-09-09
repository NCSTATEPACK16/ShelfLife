import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from '../market/config.js';
import { staticRivalsView } from '../rivals/system.js';
import { LoyaltySystem } from './system.js';
import type { MarketReader, TripOutcome } from './types.js';

class FakeMarket implements MarketReader {
  outcomes: TripOutcome[] = [];
  constructor(private readonly ids: number[]) {}
  householdIds(): readonly number[] {
    return this.ids;
  }
  pendingOutcomes(): readonly TripOutcome[] {
    return this.outcomes;
  }
}

function setup(ids = [1, 2]): { world: World; market: FakeMarket; loyalty: LoyaltySystem } {
  const world = new World({ seed: 1 });
  const market = new FakeMarket(ids);
  const loyalty = new LoyaltySystem(market, staticRivalsView(DEFAULT_RIVAL_STORES));
  world.register(loyalty);
  return { world, market, loyalty };
}

describe('LoyaltySystem state', () => {
  it('indexes the player at 0 and rivals from 1', () => {
    const { loyalty } = setup();
    expect(loyalty.storeCount).toBe(DEFAULT_RIVAL_STORES.length + 1);
  });

  it('starts every household at the authored initial loyalty', () => {
    const { loyalty } = setup();
    expect(loyalty.get(1, 0)).toBeCloseTo(DEFAULT_MARKET_CONFIG.initialLoyalty);
  });
});

describe('per-trip update (§5.2)', () => {
  it('raises loyalty when satisfaction beats the household expectation', () => {
    const { loyalty } = setup();
    const before = loyalty.get(1, 0);
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.9 });
    expect(loyalty.get(1, 0)).toBeGreaterThan(before);
  });

  it('lowers loyalty when satisfaction falls short of it', () => {
    const { loyalty } = setup();
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.9 });
    const raised = loyalty.get(1, 0);
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.1 });
    expect(loyalty.get(1, 0)).toBeLessThan(raised);
  });

  it('moves the household expectation toward observed satisfaction', () => {
    // Without this, S̄ stays frozen at its initial constant and α stops meaning
    // anything after the first few trips.
    const { loyalty } = setup();
    const before = loyalty.meanSatisfaction(1);
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    expect(loyalty.meanSatisfaction(1)).toBeGreaterThan(before);
  });

  it('clamps to [0,1] under repeated delight', () => {
    const { loyalty } = setup();
    for (let i = 0; i < 500; i++) loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    expect(loyalty.get(1, 0)).toBeLessThanOrEqual(1);
    expect(loyalty.get(1, 0)).toBeGreaterThanOrEqual(0);
  });

  it('resets days-since-visit for the visited store only', () => {
    const { world, market, loyalty } = setup();
    for (let i = 0; i < 1440 * 3; i++) world.step();
    expect(loyalty.daysSinceVisit(1, 0)).toBeGreaterThan(0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.5 }];
    world.step();
    expect(loyalty.daysSinceVisit(1, 0)).toBe(0);
    expect(loyalty.daysSinceVisit(1, 1)).toBeGreaterThan(0);
  });
});

describe('daily decay (§5.2)', () => {
  it('decays loyalty monotonically across absent days and stops at zero', () => {
    const { world, loyalty } = setup();
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    const start = loyalty.get(1, 0);
    for (let i = 0; i < 1440 * 10; i++) world.step();
    const after = loyalty.get(1, 0);
    expect(after).toBeLessThan(start);
    for (let i = 0; i < 1440 * 400; i++) world.step();
    expect(loyalty.get(1, 0)).toBe(0);
  });
});

describe('word-of-mouth nudges', () => {
  it('applies a signed delta and stays clamped', () => {
    const { loyalty } = setup();
    const before = loyalty.get(2, 1);
    loyalty.nudge(2, 1, DEFAULT_MARKET_CONFIG.womDelta);
    expect(loyalty.get(2, 1)).toBeCloseTo(before + DEFAULT_MARKET_CONFIG.womDelta);
    loyalty.nudge(2, 1, -10);
    expect(loyalty.get(2, 1)).toBe(0);
  });
});

describe('determinism', () => {
  it('hashes identically for identical histories', () => {
    const a = setup();
    const b = setup();
    a.loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.7 });
    b.loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.7 });
    for (let i = 0; i < 1440 * 2; i++) {
      a.world.step();
      b.world.step();
    }
    expect(a.world.hash).toBe(b.world.hash);
  });
});
