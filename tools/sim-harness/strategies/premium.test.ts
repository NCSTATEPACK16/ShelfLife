import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import { premiumStrategy } from './premium.js';

function fakeEconomy() {
  return { referencePriceOf: () => 3 } as any;
}

describe('premiumStrategy', () => {
  it('marks up all four catalog goods and expands assortment, only on day 0', () => {
    const commands = premiumStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    const priceCommands = commands.filter((c) => c.type === 'setPrice') as { price: number }[];
    expect(priceCommands).toHaveLength(4);
    for (const c of priceCommands) expect(c.price).toBeGreaterThan(3);

    const placeCommands = commands.filter((c) => c.type === 'placeFixture');
    expect(placeCommands).toHaveLength(2);
    const stockCommands = commands.filter((c) => c.type === 'stockFixture') as { instanceId: number }[];
    expect(stockCommands.map((c) => c.instanceId).sort()).toEqual([
      NEXT_INSTANCE_ID_AFTER_BASELINE,
      NEXT_INSTANCE_ID_AFTER_BASELINE + 1,
    ]);

    expect(premiumStrategy.decide({ day: 1, rng: new Stream(1), config: DEFAULT_HARNESS_CONFIG, economy: fakeEconomy() } as any)).toEqual([]);
  });
});
