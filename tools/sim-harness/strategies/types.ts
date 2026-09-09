import type { CheckoutSystem, Command, EconomySystem, Stream, World } from '../../../src/sim/index.js';
import type { HarnessConfig } from '../config.js';

export const STRATEGY_NAMES = [
  'do-nothing',
  'random',
  'price-war',
  'premium',
  'service',
  'layout-optimizer',
] as const;

export type StrategyName = (typeof STRATEGY_NAMES)[number];

export interface StrategyContext {
  readonly world: World;
  /** 0-based sim day. */
  readonly day: number;
  readonly economy: EconomySystem;
  readonly checkout: CheckoutSystem;
  readonly rng: Stream;
  readonly config: HarnessConfig;
}

export interface Strategy {
  readonly name: StrategyName;
  /** Called once per sim day (the NIGHT decision point, PLAN.md §4). */
  decide(ctx: StrategyContext): readonly Command[];
}
