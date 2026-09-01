import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { LoyaltySystem } from '../loyalty/system.js';
import type { TripOutcome } from '../loyalty/types.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from '../market/config.js';
import type { Position } from '../market/types.js';
import { staticRivalsView } from '../rivals/system.js';
import { ReputationSystem } from './system.js';
import type { NeighborReader } from './types.js';

class FakeMarket implements NeighborReader {
  outcomes: TripOutcome[] = [];
  constructor(private readonly positions: Map<number, Position>) {}
  householdIds(): readonly number[] {
    return [...this.positions.keys()].sort((a, b) => a - b);
  }
  householdPosition(id: number): Position {
    const p = this.positions.get(id);
    if (!p) throw new Error(`Unknown household id: ${id}`);
    return p;
  }
  pendingOutcomes(): readonly TripOutcome[] {
    return this.outcomes;
  }
}

function setup(): { world: World; market: FakeMarket; loyalty: LoyaltySystem; reputation: ReputationSystem } {
  // 1 is nearest 2, then 3, then 4, then 5 — a deliberate line so k=3 has an
  // unambiguous answer.
  const positions = new Map<number, Position>([
    [1, { x: 0, y: 0 }],
    [2, { x: 1, y: 0 }],
    [3, { x: 2, y: 0 }],
    [4, { x: 3, y: 0 }],
    [5, { x: 9, y: 0 }],
  ]);
  const world = new World({ seed: 1 });
  const market = new FakeMarket(positions);
  const loyalty = new LoyaltySystem(market, staticRivalsView(DEFAULT_RIVAL_STORES));
  world.register(loyalty);
  const reputation = new ReputationSystem(market, loyalty);
  world.register(reputation);
  return { world, market, loyalty, reputation };
}

describe('the neighbour relation', () => {
  it('picks the k nearest by catchment travel cost, excluding self', () => {
    const { reputation } = setup();
    expect(reputation.neighborsOf(1)).toEqual([2, 3, 4]);
  });

  it('breaks ties by ascending household id', () => {
    const positions = new Map<number, Position>([
      [10, { x: 0, y: 0 }],
      [7, { x: 1, y: 0 }],
      [3, { x: 0, y: 1 }],
      [5, { x: -1, y: 0 }],
      [9, { x: 0, y: -1 }],
    ]);
    const world = new World({ seed: 1 });
    const market = new FakeMarket(positions);
    const loyalty = new LoyaltySystem(market, staticRivalsView(DEFAULT_RIVAL_STORES));
    world.register(loyalty);
    const reputation = new ReputationSystem(market, loyalty);
    world.register(reputation);
    // Every neighbour is exactly one unit away, so id order decides.
    expect(reputation.neighborsOf(10)).toEqual([3, 5, 7]);
  });
});

describe('diffusion (§5.3)', () => {
  it('raises exactly k neighbours on a delighted trip', () => {
    const { world, market, loyalty } = setup();
    const before = [2, 3, 4, 5].map((id) => loyalty.get(id, 0));
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.95 }];
    world.step();
    expect(loyalty.get(2, 0)).toBeGreaterThan(before[0]!);
    expect(loyalty.get(3, 0)).toBeGreaterThan(before[1]!);
    expect(loyalty.get(4, 0)).toBeGreaterThan(before[2]!);
    expect(loyalty.get(5, 0)).toBeCloseTo(before[3]!);
  });

  it('lowers neighbours on a disgusted trip', () => {
    const { world, market, loyalty } = setup();
    const before = loyalty.get(2, 0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.1 }];
    world.step();
    expect(loyalty.get(2, 0)).toBeLessThan(before);
  });

  it('stays silent for an unremarkable trip', () => {
    const { world, market, loyalty } = setup();
    const before = loyalty.get(2, 0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.5 }];
    world.step();
    expect(loyalty.get(2, 0)).toBeCloseTo(before);
  });

  it('does not cascade — a nudged neighbour never re-emits', () => {
    // Household 5 is nobody's neighbour but 4's; if diffusion recursed, a delighted
    // trip by 1 would eventually reach it.
    const { world, market, loyalty } = setup();
    const before = loyalty.get(5, 0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 1 }];
    world.step();
    expect(loyalty.get(5, 0)).toBeCloseTo(before);
  });

  it('emits a wordOfMouth event naming who was affected', () => {
    const { world, market } = setup();
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.95 }];
    world.step();
    const seen = world.events.drain().filter((e) => e.type === 'wordOfMouth');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sourceHouseholdId: 1, storeIndex: 0, polarity: 1 });
  });

  it('applies outcomes in ascending source-household order', () => {
    const { world, market, loyalty } = setup();
    market.outcomes = [
      { householdId: 3, storeIndex: 0, satisfaction: 0.95 },
      { householdId: 1, storeIndex: 0, satisfaction: 0.95 },
    ];
    world.step();
    // Both fire; the assertion that matters is that the result does not depend on
    // buffer order — see the determinism test below.
    expect(loyalty.get(2, 0)).toBeGreaterThan(DEFAULT_MARKET_CONFIG.initialLoyalty);
  });

  it('is independent of the order outcomes were appended', () => {
    const a = setup();
    const b = setup();
    a.market.outcomes = [
      { householdId: 3, storeIndex: 0, satisfaction: 0.95 },
      { householdId: 1, storeIndex: 0, satisfaction: 0.05 },
    ];
    b.market.outcomes = [
      { householdId: 1, storeIndex: 0, satisfaction: 0.05 },
      { householdId: 3, storeIndex: 0, satisfaction: 0.95 },
    ];
    a.world.step();
    b.world.step();
    expect(a.world.hash).toBe(b.world.hash);
  });
});
