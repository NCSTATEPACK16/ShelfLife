import os from 'node:os';
import { Worker } from 'node:worker_threads';
import type { StrategyName } from './strategies/index.js';
import type { LevelStrategyResult } from './sweep.js';

export interface SweepTask {
  readonly level: number;
  readonly strategy: StrategyName;
  readonly runs: number;
  readonly days: number;
  readonly baseSeed: number;
}

/**
 * Runs many independent sweeps across a worker-thread pool, one OS thread per core by
 * default. Each sweep is a pure function of its task inputs — its own World and RNG state,
 * nothing shared or mutated across tasks — so parallel execution never changes a sweep's
 * result, only how long all of them take together. `gate.ts`'s 18 (level, strategy) sweeps
 * are the reason this exists: at the default runs/days, running them serially is the
 * dominant cost of `npm run balance:gate`.
 */
export function sweepAllParallel(
  tasks: readonly SweepTask[],
  workerUrl: URL,
  poolSize: number = Math.max(1, os.cpus().length),
): Promise<LevelStrategyResult[]> {
  return new Promise((resolve, reject) => {
    const results: LevelStrategyResult[] = new Array(tasks.length);
    let nextIndex = 0;
    let remaining = tasks.length;

    if (remaining === 0) {
      resolve(results);
      return;
    }

    const workerCount = Math.min(poolSize, tasks.length);
    const workers: Worker[] = [];
    let settled = false;

    const fail = (err: unknown): void => {
      if (settled) return;
      settled = true;
      for (const w of workers) void w.terminate();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const runNext = (worker: Worker): void => {
      if (settled) return;
      if (nextIndex >= tasks.length) {
        void worker.terminate();
        return;
      }
      const index = nextIndex++;
      worker.postMessage(tasks[index]);
      worker.once('message', (result: LevelStrategyResult) => {
        results[index] = result;
        remaining--;
        if (remaining === 0) {
          settled = true;
          for (const w of workers) void w.terminate();
          resolve(results);
        } else {
          runNext(worker);
        }
      });
    };

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(workerUrl);
      worker.once('error', fail);
      workers.push(worker);
      runNext(worker);
    }
  });
}
