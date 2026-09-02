import type { Command } from '../../../src/sim/index.js';
import { BASELINE_SHELF_INSTANCE_IDS, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import type { Strategy } from './types.js';

/** A long aisle spanning the flow-field path from the entrance toward the checkout, so a
 *  shopper's walk passes every stocked good — PLAN §5.4's literal path-exposure mechanic. */
const AISLE_SHELVES: readonly { x: number; y: number; goodId: string }[] = [
  { x: 3, y: 3, goodId: 'milk' },
  { x: 8, y: 8, goodId: 'bread' },
  { x: 13, y: 13, goodId: 'eggs' },
  { x: 16, y: 16, goodId: 'snacks' },
];

export const layoutOptimizerStrategy: Strategy = {
  name: 'layout-optimizer',
  decide(ctx) {
    if (ctx.day !== 0) return [];
    const commands: Command[] = [];

    for (const instanceId of BASELINE_SHELF_INSTANCE_IDS) {
      commands.push({ type: 'removeFixture', instanceId });
    }

    AISLE_SHELVES.forEach((shelf, i) => {
      commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: shelf.x, y: shelf.y, rotation: 0 });
      commands.push({ type: 'stockFixture', instanceId: NEXT_INSTANCE_ID_AFTER_BASELINE + i, goodId: shelf.goodId });
    });

    return commands;
  },
};
