import { pathToFileURL } from 'node:url';
import { sweepAllParallel, type SweepTask } from './parallel-sweep.js';
import { STRATEGY_NAMES, type StrategyName } from './strategies/index.js';
import type { LevelStrategyResult } from './sweep.js';

export interface GateCheckResult {
  readonly level: number;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

const COHERENT_STRATEGIES: readonly StrategyName[] = ['price-war', 'premium', 'service', 'layout-optimizer'];

export function checkAcceptanceRule(results: readonly LevelStrategyResult[]): GateCheckResult {
  const level = results[0]!.level;
  const failures: string[] = [];
  const byStrategy = new Map(results.map((r) => [r.strategy, r]));

  const doNothing = byStrategy.get('do-nothing')!;
  if (doNothing.winRate > 0.05) {
    failures.push(`do-nothing win rate ${doNothing.winRate.toFixed(3)} exceeds 0.05`);
  }

  const random = byStrategy.get('random')!;
  if (random.winRate > 0.1) {
    failures.push(`random win rate ${random.winRate.toFixed(3)} exceeds 0.10`);
  }

  const inRange = COHERENT_STRATEGIES.filter((name) => {
    const r = byStrategy.get(name)!;
    return r.winRate >= 0.55 && r.winRate <= 0.75;
  });
  if (inRange.length < 2) {
    failures.push(`only ${inRange.length} coherent strategies land in 55-75% win rate (need >= 2)`);
  }

  return { level, passed: failures.length === 0, failures };
}

export function checkMonotonicCl(
  resultsByLevel: ReadonlyMap<number, readonly LevelStrategyResult[]>,
  strategy: StrategyName,
): readonly string[] {
  const levels = [...resultsByLevel.keys()].sort((a, b) => a - b);
  const failures: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prevLevel = levels[i - 1]!;
    const curLevel = levels[i]!;
    const prev = resultsByLevel.get(prevLevel)!.find((r) => r.strategy === strategy)!;
    const cur = resultsByLevel.get(curLevel)!.find((r) => r.strategy === strategy)!;
    if (cur.winRate > prev.winRate) {
      failures.push(
        `${strategy}: level ${curLevel} win rate ${cur.winRate.toFixed(3)} exceeds level ${prevLevel}'s ${prev.winRate.toFixed(3)}`,
      );
    }
  }
  return failures;
}

/**
 * Each (level, strategy) sweep is independent — its own World/RNG per run, nothing shared —
 * so all 18 run across a worker-thread pool (one OS thread per core) instead of serially.
 * At the default runs/days this is the difference between minutes and tens of minutes.
 */
export async function runGate(runs: number, days: number, baseSeed: number): Promise<void> {
  const levels = [1, 2, 3];
  const tasks: SweepTask[] = [];
  for (const level of levels) {
    for (const strategy of STRATEGY_NAMES) {
      tasks.push({ level, strategy, runs, days, baseSeed });
    }
  }

  const workerUrl = new URL('./sweepWorker.js', import.meta.url);
  const allResults = await sweepAllParallel(tasks, workerUrl);

  const resultsByLevel = new Map<number, LevelStrategyResult[]>();
  for (const level of levels) resultsByLevel.set(level, []);
  for (const result of allResults) resultsByLevel.get(result.level)!.push(result);

  let allPassed = true;
  for (const level of levels) {
    const check = checkAcceptanceRule(resultsByLevel.get(level)!);
    console.log(`Level ${level}: ${check.passed ? 'PASS' : 'FAIL'}`);
    for (const failure of check.failures) console.log(`  - ${failure}`);
    if (!check.passed) allPassed = false;
  }

  for (const strategy of STRATEGY_NAMES) {
    const failures = checkMonotonicCl(resultsByLevel, strategy);
    if (failures.length > 0) {
      allPassed = false;
      console.log(`Monotonic-CL check FAILED for ${strategy}:`);
      for (const failure of failures) console.log(`  - ${failure}`);
    }
  }

  console.log(allPassed ? 'GATE: PASS' : 'GATE: FAIL');
  if (!allPassed) process.exitCode = 1;
}

// 30 runs keeps the default `npm run balance:gate` invocation under ~2 minutes on a 6-core
// dev machine even after the lazy-hash fix and worker-pool parallelism (see parallel-sweep.ts):
// 18 sweeps of the full 90-day duration still cost real CPU-seconds, and 100 runs/sweep would
// exceed a 2-minute wall-clock budget even at perfect parallel efficiency on 6 cores. `--runs`
// overrides this for an actual phase 5.4 balance-tuning pass, where wall time matters less than
// win-rate precision (standard error shrinks with more runs, not more days).
const DEFAULT_GATE_RUNS = 30;
const DEFAULT_GATE_DAYS = 90;
const DEFAULT_GATE_SEED = 20260901;

function parseGateArgs(argv: readonly string[]): { runs: number; days: number; seed: number } {
  let runs = DEFAULT_GATE_RUNS;
  let days = DEFAULT_GATE_DAYS;
  let seed = DEFAULT_GATE_SEED;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      i++;
      const value = argv[i];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      return value;
    };
    switch (flag) {
      case '--runs':
        runs = Number(next());
        break;
      case '--days':
        days = Number(next());
        break;
      case '--seed':
        seed = Number(next());
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }
  return { runs, days, seed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { runs, days, seed } = parseGateArgs(process.argv.slice(2));
  runGate(runs, days, seed).catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
