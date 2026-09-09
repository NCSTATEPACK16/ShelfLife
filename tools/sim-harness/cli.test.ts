import { describe, expect, it } from 'vitest';
import { formatCsv, formatJson, parseArgs } from './cli.js';
import type { LevelStrategyResult } from './sweep.js';

describe('parseArgs', () => {
  it('parses required and optional flags', () => {
    const args = parseArgs(['--level', '2', '--strategy', 'service', '--runs', '10', '--days', '30']);
    expect(args).toEqual({
      level: 2,
      strategy: 'service',
      runs: 10,
      days: 30,
      seed: 20260901,
      out: 'csv',
      outFile: null,
    });
  });

  it('throws on a missing required flag', () => {
    expect(() => parseArgs(['--strategy', 'service'])).toThrow(/--level/);
  });

  it('throws on an unknown strategy', () => {
    expect(() => parseArgs(['--level', '1', '--strategy', 'nonsense'])).toThrow(/Unknown strategy/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--level', '1', '--strategy', 'random', '--bogus', '1'])).toThrow(/Unknown argument/);
  });
});

function fakeResult(): LevelStrategyResult {
  return {
    level: 1,
    strategy: 'do-nothing',
    runs: [
      { seed: 1, won: false, daysToWin: null, totalEbitda: -100, shareTrajectory: [0.1] },
      { seed: 2, won: true, daysToWin: 5, totalEbitda: 200, shareTrajectory: [0.6] },
    ],
    winRate: 0.5,
    medianDaysToWin: 5,
    ebitda: { mean: 50, p10: -100, p50: 50, p90: 200 },
    meanShareTrajectory: [0.35],
  };
}

describe('formatCsv', () => {
  it('writes one row per run plus a summary block', () => {
    const csv = formatCsv(fakeResult());
    expect(csv).toContain('seed,won,daysToWin,totalEbitda');
    expect(csv).toContain('1,false,,-100.00');
    expect(csv).toContain('2,true,5,200.00');
    expect(csv).toContain('winRate=0.500');
  });
});

describe('formatJson', () => {
  it('round-trips the full result', () => {
    const result = fakeResult();
    expect(JSON.parse(formatJson(result))).toEqual(result);
  });
});
