import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_STAFF_ID, BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import { randomStrategy } from './random.js';

function fakeEconomy() {
  return { referencePriceOf: (goodId: string) => (goodId === 'milk' ? 3.49 : 2.99) } as any;
}

describe('randomStrategy', () => {
  it('never emits a command with actionChance 0', () => {
    const config = {
      ...DEFAULT_HARNESS_CONFIG,
      strategies: { ...DEFAULT_HARNESS_CONFIG.strategies, random: { actionChance: 0 } },
    };
    const commands = randomStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config,
      economy: fakeEconomy(),
    } as any);
    expect(commands).toEqual([]);
  });

  it('always emits exactly one command with actionChance 1, targeting a baseline-stocked good or staff', () => {
    const config = {
      ...DEFAULT_HARNESS_CONFIG,
      strategies: { ...DEFAULT_HARNESS_CONFIG.strategies, random: { actionChance: 1 } },
    };
    const commands = randomStrategy.decide({
      day: 3,
      rng: new Stream(7),
      config,
      economy: fakeEconomy(),
    } as any);
    expect(commands).toHaveLength(1);
    const command = commands[0]!;
    if (command.type === 'setPrice' || command.type === 'startPromotion') {
      expect(BASELINE_STOCKED_GOOD_IDS).toContain(command.goodId);
    } else {
      expect(command.type).toBe('trainStaff');
      expect((command as { staffId: number }).staffId).toBe(BASELINE_STAFF_ID);
    }
  });

  it('is deterministic for the same seed', () => {
    const config = {
      ...DEFAULT_HARNESS_CONFIG,
      strategies: { ...DEFAULT_HARNESS_CONFIG.strategies, random: { actionChance: 1 } },
    };
    const a = randomStrategy.decide({ day: 5, rng: new Stream(99), config, economy: fakeEconomy() } as any);
    const b = randomStrategy.decide({ day: 5, rng: new Stream(99), config, economy: fakeEconomy() } as any);
    expect(a).toEqual(b);
  });
});
