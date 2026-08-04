import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { MarketSystem } from './system.js';

function worldWithMarket(): { world: World; market: MarketSystem } {
  const world = new World({ seed: 1 });
  const market = new MarketSystem();
  world.register(market);
  return { world, market };
}

describe('MarketSystem household ownership', () => {
  it('claims addHousehold and stores the household', () => {
    const { world, market } = worldWithMarket();
    world.commands.push({ type: 'addHousehold', householdId: 7, segment: 'family', position: { x: 2, y: 3 } });
    world.step();
    expect(market.household(7).segment).toBe('family');
    expect(market.household(7).position).toEqual({ x: 2, y: 3 });
  });

  it('throws for an unknown household id', () => {
    const { market } = worldWithMarket();
    expect(() => market.household(99)).toThrow('Unknown household id: 99');
  });

  it('returns household ids in ascending order regardless of insertion order', () => {
    const { world, market } = worldWithMarket();
    for (const id of [5, 1, 3]) {
      world.commands.push({ type: 'addHousehold', householdId: id, segment: 'family', position: { x: 0, y: 0 } });
    }
    world.step();
    expect(market.householdIds()).toEqual([1, 3, 5]);
  });

  it('depletes pantries once per sim day', () => {
    const { world, market } = worldWithMarket();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    const dayZero = market.household(1).pantry['milk'] ?? 1;
    for (let i = 0; i < 1440; i++) world.step();
    expect(market.household(1).pantry['milk']!).toBeLessThan(dayZero);
  });
});
