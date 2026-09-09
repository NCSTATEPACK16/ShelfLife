import { describe, expect, it } from 'vitest';
import { checkAcceptanceRule, checkMonotonicCl } from './gate.js';
import type { LevelStrategyResult } from './sweep.js';
import type { StrategyName } from './strategies/index.js';

function result(strategy: StrategyName, level: number, winRate: number): LevelStrategyResult {
  return {
    level,
    strategy,
    runs: [],
    winRate,
    medianDaysToWin: null,
    ebitda: { mean: 0, p10: 0, p50: 0, p90: 0 },
    meanShareTrajectory: [],
  };
}

describe('checkAcceptanceRule', () => {
  it('passes when do-nothing/random lose and at least two coherent strategies land in 55-75%', () => {
    const results: LevelStrategyResult[] = [
      result('do-nothing', 1, 0.0),
      result('random', 1, 0.05),
      result('price-war', 1, 0.6),
      result('premium', 1, 0.65),
      result('service', 1, 0.4),
      result('layout-optimizer', 1, 0.3),
    ];
    expect(checkAcceptanceRule(results)).toEqual({ level: 1, passed: true, failures: [] });
  });

  it('fails when do-nothing wins too often', () => {
    const results: LevelStrategyResult[] = [
      result('do-nothing', 1, 0.5),
      result('random', 1, 0.05),
      result('price-war', 1, 0.6),
      result('premium', 1, 0.65),
      result('service', 1, 0.4),
      result('layout-optimizer', 1, 0.3),
    ];
    const check = checkAcceptanceRule(results);
    expect(check.passed).toBe(false);
    expect(check.failures.some((f) => f.includes('do-nothing'))).toBe(true);
  });

  it('fails when fewer than two coherent strategies land in range', () => {
    const results: LevelStrategyResult[] = [
      result('do-nothing', 1, 0.0),
      result('random', 1, 0.05),
      result('price-war', 1, 0.6),
      result('premium', 1, 0.9),
      result('service', 1, 0.9),
      result('layout-optimizer', 1, 0.9),
    ];
    const check = checkAcceptanceRule(results);
    expect(check.passed).toBe(false);
    expect(check.failures.some((f) => f.includes('coherent'))).toBe(true);
  });
});

describe('checkMonotonicCl', () => {
  it('passes when win rate never increases with level', () => {
    const byLevel = new Map<number, LevelStrategyResult[]>([
      [1, [result('service', 1, 0.7)]],
      [2, [result('service', 2, 0.6)]],
      [3, [result('service', 3, 0.6)]],
    ]);
    expect(checkMonotonicCl(byLevel, 'service')).toEqual([]);
  });

  it('fails when a higher level wins more than a lower one', () => {
    const byLevel = new Map<number, LevelStrategyResult[]>([
      [1, [result('service', 1, 0.5)]],
      [2, [result('service', 2, 0.7)]],
    ]);
    const failures = checkMonotonicCl(byLevel, 'service');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('service');
  });
});
