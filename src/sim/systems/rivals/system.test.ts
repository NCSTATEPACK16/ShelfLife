import { describe, expect, it } from 'vitest';
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import { World } from '../../core/world.js';
import { DEFAULT_RIVAL_STORES } from '../market/config.js';
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

  it('reacts on the weekly boundary: sustained player wins push a rival to cut price', () => {
    // Every recorded trip goes to the player (storeIndex 0) → rival is losing share.
    const r = make(() => [{ storeIndex: 0 }]);
    const world = new World({ seed: 1 });
    world.register(r);
    const before = r.effectiveStore(0, 'family').priceIndex;
    for (let t = 1; t <= TICKS_PER_SIM_DAY * 7; t++) world.step();
    expect(r.effectiveStore(0, 'family').priceIndex).toBeLessThanOrEqual(before);
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
