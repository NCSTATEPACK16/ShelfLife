import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import { priceWarStrategy } from './price-war.js';

function fakeEconomy() {
  return { referencePriceOf: (goodId: string) => (goodId === 'milk' ? 3.49 : 2.99) } as any;
}

describe('priceWarStrategy', () => {
  it('cuts price on both baseline goods on day 0', () => {
    const commands = priceWarStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    const priceCommands = commands.filter((c) => c.type === 'setPrice');
    expect(priceCommands).toHaveLength(BASELINE_STOCKED_GOOD_IDS.length);
    for (const c of priceCommands as { goodId: string; price: number }[]) {
      const reference = c.goodId === 'milk' ? 3.49 : 2.99;
      expect(c.price).toBeLessThan(reference);
    }
  });

  it('starts a promotion only on cadence days', () => {
    const cadence = DEFAULT_HARNESS_CONFIG.strategies.priceWar.promotionCadenceDays;
    const onCadence = priceWarStrategy.decide({
      day: cadence,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    expect(onCadence.some((c) => c.type === 'startPromotion')).toBe(true);

    const offCadence = priceWarStrategy.decide({
      day: cadence + 1,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    expect(offCadence.some((c) => c.type === 'startPromotion')).toBe(false);
  });
});
