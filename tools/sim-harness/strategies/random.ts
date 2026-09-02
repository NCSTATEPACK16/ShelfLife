import type { Command } from '../../../src/sim/index.js';
import { TICKS_PER_SIM_DAY } from '../../../src/sim/index.js';
import { BASELINE_STAFF_ID, BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import type { Strategy, StrategyContext } from './types.js';

const ACTION_KINDS = ['price', 'promotion', 'train'] as const;

function randomAction(ctx: StrategyContext): Command {
  const kind = ctx.rng.pick(ACTION_KINDS);
  switch (kind) {
    case 'price': {
      const goodId = ctx.rng.pick(BASELINE_STOCKED_GOOD_IDS);
      const reference = ctx.economy.referencePriceOf(goodId);
      const factor = 0.7 + ctx.rng.nextFloat() * 0.6; // [0.7, 1.3)
      return { type: 'setPrice', goodId, price: Number((reference * factor).toFixed(2)) };
    }
    case 'promotion': {
      const goodId = ctx.rng.pick(BASELINE_STOCKED_GOOD_IDS);
      const discountFraction = 0.1 + ctx.rng.nextFloat() * 0.3; // [0.1, 0.4)
      return { type: 'startPromotion', goodId, discountFraction, durationTicks: 3 * TICKS_PER_SIM_DAY };
    }
    case 'train':
      return { type: 'trainStaff', staffId: BASELINE_STAFF_ID };
  }
}

export const randomStrategy: Strategy = {
  name: 'random',
  decide(ctx) {
    if (!ctx.rng.chance(ctx.config.strategies.random.actionChance)) return [];
    return [randomAction(ctx)];
  },
};
