import { describe, expect, it } from 'vitest';
import { replay } from '../../core/world.js';
import { fullMarketWorld, registerFullMarketStack } from './system.test.js';

describe('pricing drives store choice', () => {
  it('a priceHunter defects when the player store gets dear and returns on a loss leader', () => {
    // This is the test that finally connects phase 1.9's pricing to store choice.
    // Before 2.0c, a loss leader only affected the basket of a shopper who had already
    // decided to walk in.
    const { world, market } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'priceHunter', position: { x: 2, y: -1 } });
    for (let i = 0; i < 1440 * 10; i++) world.step();
    const atReference = market.choiceProbabilities(1)[0]!;

    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 8 });
    for (let i = 0; i < 1440 * 10; i++) world.step();
    const whenDear = market.choiceProbabilities(1)[0]!;
    expect(whenDear).toBeLessThan(atReference);

    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 0.4 });
    for (let i = 0; i < 1440 * 10; i++) world.step();
    expect(market.choiceProbabilities(1)[0]!).toBeGreaterThan(whenDear);
  });
});

describe('loyalty is stickiness', () => {
  it('a loyal household tolerates a price shock a disloyal one does not', () => {
    // If this fails, βl is not load-bearing and the model is wrong — not the test.
    const a = fullMarketWorld();
    const b = fullMarketWorld();
    for (const w of [a, b]) {
      w.world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 1, y: -1 } });
      w.world.step();
    }
    for (let i = 0; i < 20; i++) a.loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });

    for (const w of [a, b]) {
      w.world.commands.push({ type: 'setPrice', goodId: 'milk', price: 6 });
      for (let i = 0; i < 1440 * 10; i++) w.world.step();
    }
    expect(a.market.choiceProbabilities(1)[0]!).toBeGreaterThan(b.market.choiceProbabilities(1)[0]!);
  });
});

describe('word of mouth reaches store choice', () => {
  it('a delighted neighbour measurably shifts a household probability', () => {
    // Diffusion that never changes a decision is dead code.
    const quiet = fullMarketWorld();
    const loud = fullMarketWorld();
    for (const w of [quiet, loud]) {
      w.world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 1 } });
      w.world.commands.push({ type: 'addHousehold', householdId: 2, segment: 'family', position: { x: 0, y: 2 } });
      w.world.step();
    }
    for (let i = 0; i < 30; i++) {
      loud.loyalty.nudge(1, 0, 0.02); // stand-in for repeated neighbour delight
    }
    for (const w of [quiet, loud]) for (let i = 0; i < 1440 * 10; i++) w.world.step();
    expect(loud.market.choiceProbabilities(1)[0]!).toBeGreaterThan(quiet.market.choiceProbabilities(1)[0]!);
  });
});

describe('replay fidelity', () => {
  it('replays hash-identically through replay()', () => {
    const { world } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 1, y: 1 } });
    for (let i = 0; i < 1440 * 8; i++) world.step();
    // replay() rather than a hand-pushed command log: pushing a multi-tick log before any
    // step() collapses it onto tick 0 and silently shifts later commands a tick earlier.
    // Phase 1.8 learned this the hard way.
    const replayed = replay(world.seed, world.commands.log, world.tick, (w) => registerFullMarketStack(w));
    expect(replayed.hash).toBe(world.hash);
  });
});
