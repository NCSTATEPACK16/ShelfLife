import { describe, expect, it } from 'vitest';
import { runOnce } from './run.js';

describe('runOnce', () => {
  it('produces a well-formed RunResult for a short do-nothing run', () => {
    const result = runOnce(1, 'do-nothing', 12345, 10);
    expect(result.seed).toBe(12345);
    expect(typeof result.won).toBe('boolean');
    expect(result.won ? typeof result.daysToWin === 'number' : result.daysToWin === null).toBe(true);
    expect(Number.isFinite(result.totalEbitda)).toBe(true);
    expect(result.shareTrajectory).toHaveLength(10);
  });

  it('is deterministic for the same seed', () => {
    const a = runOnce(2, 'random', 999, 5);
    const b = runOnce(2, 'random', 999, 5);
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = runOnce(2, 'random', 1, 5);
    const b = runOnce(2, 'random', 2, 5);
    expect(a.shareTrajectory).not.toEqual(b.shareTrajectory);
  });
});
