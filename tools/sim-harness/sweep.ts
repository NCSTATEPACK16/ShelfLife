import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from './config.js';
import { runOnce, type RunResult } from './run.js';
import type { StrategyName } from './strategies/index.js';

export interface LevelStrategyResult {
  readonly level: number;
  readonly strategy: StrategyName;
  readonly runs: readonly RunResult[];
  readonly winRate: number;
  readonly medianDaysToWin: number | null;
  readonly ebitda: { readonly mean: number; readonly p10: number; readonly p50: number; readonly p90: number };
  readonly meanShareTrajectory: readonly number[];
}

/** Deterministic per-run seed derivation — XOR-folds the run index so nearby indices don't
 *  produce nearby seeds. */
export function deriveRunSeed(baseSeed: number, runIndex: number): number {
  return (baseSeed ^ Math.imul(runIndex + 1, 0x9e3779b1)) >>> 0;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index]!;
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function sweep(
  level: number,
  strategyName: StrategyName,
  runs: number,
  days: number,
  baseSeed: number,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): LevelStrategyResult {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(runOnce(level, strategyName, deriveRunSeed(baseSeed, i), days, config));
  }

  const winRate = results.filter((r) => r.won).length / results.length;
  const daysToWinSorted = results
    .map((r) => r.daysToWin)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const ebitdaSorted = results.map((r) => r.totalEbitda).sort((a, b) => a - b);

  const maxDays = Math.max(0, ...results.map((r) => r.shareTrajectory.length));
  const meanShareTrajectory: number[] = [];
  for (let day = 0; day < maxDays; day++) {
    const values = results
      .map((r) => r.shareTrajectory[day])
      .filter((v): v is number => v !== undefined && !Number.isNaN(v));
    meanShareTrajectory.push(values.length === 0 ? NaN : values.reduce((sum, v) => sum + v, 0) / values.length);
  }

  return {
    level,
    strategy: strategyName,
    runs: results,
    winRate,
    medianDaysToWin: median(daysToWinSorted),
    ebitda: {
      mean: ebitdaSorted.reduce((sum, v) => sum + v, 0) / ebitdaSorted.length,
      p10: percentile(ebitdaSorted, 0.1),
      p50: percentile(ebitdaSorted, 0.5),
      p90: percentile(ebitdaSorted, 0.9),
    },
    meanShareTrajectory,
  };
}
