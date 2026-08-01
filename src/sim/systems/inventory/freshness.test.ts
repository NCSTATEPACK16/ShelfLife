import { describe, expect, it } from 'vitest';
import { freshnessAt } from './freshness.js';

describe('freshnessAt', () => {
  it('is 1 at the moment of delivery', () => {
    expect(freshnessAt(100, 100, 1000)).toBe(1);
  });

  it('matches exp(-t/tau) exactly for a given age', () => {
    const deliveredAtTick = 0;
    const now = 500;
    const tauTicks = 1000;
    expect(freshnessAt(deliveredAtTick, now, tauTicks)).toBeCloseTo(Math.exp(-500 / 1000), 12);
  });

  it('approaches 0 as age grows far beyond tau', () => {
    expect(freshnessAt(0, 100_000, 1000)).toBeLessThan(1e-40);
  });

  it('never returns a negative age result for now < deliveredAtTick', () => {
    // Shouldn't happen in practice (a batch can't be queried before it existed), but the
    // formula should not blow up if it does.
    expect(freshnessAt(100, 50, 1000)).toBe(1);
  });
});
