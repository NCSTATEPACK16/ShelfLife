import { describe, expect, it } from 'vitest';
import { deriveRunSeed, sweep } from './sweep.js';

describe('deriveRunSeed', () => {
  it('is deterministic and varies by run index', () => {
    expect(deriveRunSeed(100, 0)).toBe(deriveRunSeed(100, 0));
    expect(deriveRunSeed(100, 0)).not.toBe(deriveRunSeed(100, 1));
  });
});

describe('sweep', () => {
  it('aggregates a short do-nothing sweep into a well-formed result', () => {
    const result = sweep(1, 'do-nothing', 3, 5, 42);
    expect(result.level).toBe(1);
    expect(result.strategy).toBe('do-nothing');
    expect(result.runs).toHaveLength(3);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.ebitda.p10).toBeLessThanOrEqual(result.ebitda.p50);
    expect(result.ebitda.p50).toBeLessThanOrEqual(result.ebitda.p90);
    expect(result.meanShareTrajectory).toHaveLength(5);
  });

  it('gives each of the three runs a distinct, reproducible seed', () => {
    const a = sweep(1, 'do-nothing', 3, 2, 7);
    const b = sweep(1, 'do-nothing', 3, 2, 7);
    expect(a.runs.map((r) => r.seed)).toEqual(b.runs.map((r) => r.seed));
    expect(new Set(a.runs.map((r) => r.seed)).size).toBe(3);
  });
});
