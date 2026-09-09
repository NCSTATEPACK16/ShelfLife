import { describe, expect, it } from 'vitest';
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import { World } from '../../core/world.js';
import { DEFAULT_RIVAL_STORES } from '../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import { RivalsSystem } from './system.js';

function make(outcomes: () => { storeIndex: number }[]) {
  return new RivalsSystem({ outcomes, playerPriceLevel: () => 1.0 }, DEFAULT_RIVAL_STORES);
}

describe('RivalsSystem', () => {
  it('exposes a derived effective store for each rival at construction', () => {
    const r = make(() => []);
    expect(r.count()).toBe(DEFAULT_RIVAL_STORES.length);
    const s = r.effectiveStore(0, 'family');
    expect(s.priceIndex).toBeGreaterThan(0);
  });

  it('reacts on the weekly boundary: sustained player wins move price toward the undercut target', () => {
    // Every recorded trip goes to the player (storeIndex 0) → rival is losing share.
    // Sav-A-Lott's *derived* initial price is floored at minPriceIndex (0.82 base minus its
    // priceAggression-scaled cut lands below the floor), which sits below its own
    // priceAggression-scaled undercut target against a player at reference price — so the
    // correct reaction here is a small move *up* toward that target, not down. Asserting a
    // strict decrease would just re-encode the pre-fix bug (reactWeekly's target used to clamp
    // to `current`, which made price monotonically non-increasing regardless of priceAggression).
    const r = make(() => [{ storeIndex: 0 }]);
    const world = new World({ seed: 1 });
    world.register(r);
    const before = r.effectiveStore(0, 'family').priceIndex;
    const priceAggression = DEFAULT_RIVAL_STORES[0]!.personality!.priceAggression;
    const target = 1.0 * (1 - DEFAULT_RIVALS_CONFIG.undercutFraction * priceAggression);
    for (let t = 1; t <= TICKS_PER_SIM_DAY * 7; t++) world.step();
    const after = r.effectiveStore(0, 'family').priceIndex;
    expect(after).not.toBe(before);
    expect(Math.abs(after - target)).toBeLessThan(Math.abs(before - target));
    expect(after).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
  });

  it('draws no RNG (rivalNoise draw count unchanged over a weekly tick)', () => {
    const r = make(() => [{ storeIndex: 0 }]);
    const world = new World({ seed: 1 });
    world.register(r);
    const drawsBefore = world.rng.get('rivalNoise').draws;
    for (let t = 1; t <= TICKS_PER_SIM_DAY * 7; t++) world.step();
    expect(world.rng.get('rivalNoise').draws).toBe(drawsBefore);
  });
});
