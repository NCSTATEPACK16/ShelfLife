import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { CheckoutSystem } from '../checkout/system.js';
import { EconomySystem } from '../economy/system.js';
import { GridSystem } from '../grid/system.js';
import { InventorySystem } from '../inventory/system.js';
import { LoyaltySystem } from '../loyalty/system.js';
import { PathingSystem } from '../pathing/system.js';
import { ShoppersSystem } from '../shoppers/system.js';
import { DEFAULT_RIVAL_STORES } from './config.js';
import { MarketSystem } from './system.js';

function worldWithMarket(): { world: World; market: MarketSystem } {
  const world = new World({ seed: 1 });
  const market = new MarketSystem();
  world.register(market);
  return { world, market };
}

/**
 * The full stack in registration order (grid, pathing, inventory, checkout, economy,
 * market, shoppers, loyalty, reputation) — everything `#scheduleTrips` needs live. Uses
 * `self_checkout` rather than `register` so no staffing command is needed to keep a lane
 * open. `stockShelf: false` leaves the shelf empty, so the player store loses on
 * assortment and quality — used to prove a household will pick the rival.
 */
function fullMarketWorld(options: { stockShelf?: boolean } = {}): {
  world: World;
  market: MarketSystem;
  shoppers: ShoppersSystem;
  loyalty: LoyaltySystem;
} {
  const stockShelf = options.stockShelf ?? true;
  const world = new World({ seed: 1 });
  const grid = new GridSystem({ width: 24, height: 24 });
  world.register(grid);
  const pathing = new PathingSystem(grid.grid);
  world.register(pathing);
  const inventory = new InventorySystem();
  world.register(inventory);
  const checkout = new CheckoutSystem(grid.grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory);
  world.register(economy);
  const marketBox: { current?: MarketSystem } = {};
  const loyalty = new LoyaltySystem(
    {
      householdIds: () => marketBox.current!.householdIds(),
      pendingOutcomes: () => marketBox.current!.pendingOutcomes(),
    },
    DEFAULT_RIVAL_STORES,
  );
  const market = new MarketSystem({ inventory, checkout, economy, loyalty });
  marketBox.current = market;
  world.register(market);
  const shoppers = new ShoppersSystem(market, grid.grid, pathing, inventory, checkout, economy);
  world.register(shoppers);
  world.register(loyalty);

  world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 10, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'self_checkout', x: 20, y: 20, rotation: 0 });
  if (stockShelf) {
    world.commands.push({ type: 'stockFixture', instanceId: 1, goodId: 'milk' });
    world.commands.push({ type: 'stockFixture', instanceId: 1, goodId: 'bread' });
  }
  return { world, market, shoppers, loyalty };
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

describe('trip scheduling (§5.4)', () => {
  it('schedules no trip while the list is below threshold', () => {
    const { world, market } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    expect(market.pendingOutcomes()).toHaveLength(0);
  });

  it('spawns a shopper once the pantry drains past the threshold', () => {
    const { world, shoppers } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    let completedTrips = 0;
    for (let i = 0; i < 1440 * 12; i++) {
      world.step();
      for (const e of world.events.drain()) {
        if (e.type === 'shopperTripCompleted') completedTrips++;
      }
    }
    // No spawnShopper command was ever pushed. If a shopper exists (or has already
    // completed a trip), the scheduler made it.
    expect(shoppers.activeShopperIds().length + completedTrips).toBeGreaterThan(0);
  });

  it('never schedules a second trip while one is in flight', () => {
    const { world, shoppers } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    for (let i = 0; i < 1440 * 12; i++) world.step();
    expect(shoppers.activeShopperIds().length).toBeLessThanOrEqual(1);
  });
});

describe('store choice', () => {
  it('sends a household to the rival when the player store is far worse', () => {
    // Player store: nothing stocked, no open lane. Sav-A-Lott wins on every term.
    const { world, market } = fullMarketWorld({ stockShelf: false });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'priceHunter', position: { x: 4, y: -3 } });
    for (let i = 0; i < 1440 * 12; i++) world.step();
    const probabilities = market.choiceProbabilities(1);
    expect(probabilities[1]!).toBeGreaterThan(probabilities[0]!);
  });

  it('resolves a rival trip without spawning an agent', () => {
    const { world, market, shoppers } = fullMarketWorld({ stockShelf: false });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'priceHunter', position: { x: 4, y: -3 } });
    let rivalTrips = 0;
    for (let i = 0; i < 1440 * 20; i++) {
      world.step();
      for (const e of world.events.drain()) {
        if (e.type === 'rivalTripCompleted') rivalTrips++;
      }
    }
    expect(rivalTrips).toBeGreaterThan(0);
    expect(market.pendingOutcomes).toBeDefined();
    expect(shoppers.activeShopperIds()).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('two worlds with the same seed schedule identically', () => {
    const a = fullMarketWorld();
    const b = fullMarketWorld();
    for (const w of [a, b]) {
      w.world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 1, y: 1 } });
    }
    for (let i = 0; i < 1440 * 15; i++) {
      a.world.step();
      b.world.step();
    }
    expect(a.world.hash).toBe(b.world.hash);
  });
});
