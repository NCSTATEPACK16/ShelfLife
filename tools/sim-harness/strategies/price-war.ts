import type { Command } from '../../../src/sim/index.js';
import { TICKS_PER_SIM_DAY } from '../../../src/sim/index.js';
import { BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import type { Strategy } from './types.js';

export const priceWarStrategy: Strategy = {
  name: 'price-war',
  decide(ctx) {
    const commands: Command[] = [];
    const cfg = ctx.config.strategies.priceWar;

    if (ctx.day === 0) {
      for (const goodId of BASELINE_STOCKED_GOOD_IDS) {
        const reference = ctx.economy.referencePriceOf(goodId);
        commands.push({ type: 'setPrice', goodId, price: Number((reference * (1 - cfg.cutFraction)).toFixed(2)) });
      }
    }

    if (ctx.day % cfg.promotionCadenceDays === 0) {
      const goodId = BASELINE_STOCKED_GOOD_IDS[Math.floor(ctx.day / cfg.promotionCadenceDays) % BASELINE_STOCKED_GOOD_IDS.length]!;
      commands.push({
        type: 'startPromotion',
        goodId,
        discountFraction: cfg.promotionDiscountFraction,
        durationTicks: cfg.promotionDurationDays * TICKS_PER_SIM_DAY,
      });
    }

    return commands;
  },
};
