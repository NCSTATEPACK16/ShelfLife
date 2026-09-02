import type { Command } from '../../../src/sim/index.js';
import { BASELINE_STOCKED_GOOD_IDS, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import type { Strategy } from './types.js';

const EXPANSION_GOODS: readonly ['eggs', 'snacks'] = ['eggs', 'snacks'];
const EXPANSION_SHELF_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 10, y: 16 },
  { x: 10, y: 19 },
];

export const premiumStrategy: Strategy = {
  name: 'premium',
  decide(ctx) {
    if (ctx.day !== 0) return [];
    const commands: Command[] = [];
    const markup = ctx.config.strategies.premium.markupFraction;

    for (const goodId of [...BASELINE_STOCKED_GOOD_IDS, ...EXPANSION_GOODS]) {
      const reference = ctx.economy.referencePriceOf(goodId);
      commands.push({ type: 'setPrice', goodId, price: Number((reference * (1 + markup)).toFixed(2)) });
    }

    EXPANSION_GOODS.forEach((goodId, i) => {
      const pos = EXPANSION_SHELF_POSITIONS[i]!;
      commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: pos.x, y: pos.y, rotation: 0 });
      commands.push({ type: 'stockFixture', instanceId: NEXT_INSTANCE_ID_AFTER_BASELINE + i, goodId });
    });

    return commands;
  },
};
