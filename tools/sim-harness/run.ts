import { TICKS_PER_SIM_DAY } from '../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from './config.js';
import { computeShareTrajectory, computeWinResult, TripCounter } from '../../src/sim/systems/campaign/objectives.js';
import { strategyFor, type StrategyName } from './strategies/index.js';
import { buildHarnessWorld } from './world.js';

export interface RunResult {
  readonly seed: number;
  readonly won: boolean;
  readonly daysToWin: number | null;
  readonly totalEbitda: number;
  readonly shareTrajectory: readonly number[];
}

export function runOnce(
  level: number,
  strategyName: StrategyName,
  seed: number,
  days: number,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): RunResult {
  const harnessWorld = buildHarnessWorld(level, seed, config);
  const strategy = strategyFor(strategyName);
  const tripCounter = new TripCounter();
  const rng = harnessWorld.world.rng.get('harness');

  for (let day = 0; day < days; day++) {
    const commands = strategy.decide({
      world: harnessWorld.world,
      day,
      economy: harnessWorld.economy,
      checkout: harnessWorld.checkout,
      rng,
      config,
    });
    for (const command of commands) harnessWorld.world.commands.push(command);

    for (let tick = 0; tick < TICKS_PER_SIM_DAY; tick++) {
      harnessWorld.world.step();
      tripCounter.recordTick(harnessWorld.market.pendingOutcomes(), harnessWorld.targetStoreIndex);
    }
    tripCounter.closeDay();
  }

  const shareTrajectory = computeShareTrajectory(tripCounter.dailyCounts(), config.winCondition.trailingWindowDays);
  const { won, daysToWin } = computeWinResult(shareTrajectory, config.winCondition.shareThreshold);
  const totalEbitda = harnessWorld.economy.statements().reduce((sum, statement) => sum + statement.ebitda, 0);

  return { seed, won, daysToWin, totalEbitda, shareTrajectory };
}
