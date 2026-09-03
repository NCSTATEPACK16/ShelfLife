import { describe, expect, it } from 'vitest';
import { replay, World } from '../../core/world.js';
import { DEFAULT_STAFFING_CONFIG } from '../checkout/config.js';
import { CheckoutSystem } from '../checkout/system.js';
import { EconomySystem } from '../economy/system.js';
import { BuildGrid } from '../grid/grid.js';
import { DEFAULT_CATALOG } from '../grid/catalog.js';
import { InventorySystem } from '../inventory/system.js';
import type { SupplyPolicy } from '../inventory/types.js';
import { MarketSystem } from '../market/system.js';
import { PathingSystem } from '../pathing/system.js';
import type { GoodDef } from '../goods/types.js';
import { ShoppersSystem } from './system.js';

const CATALOG: readonly GoodDef[] = [
  { id: 'milk', name: 'Milk', unitPrice: 3, cost: 1.8, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05, category: 'dairy' },
  // Depletes far slower than milk, so a fixed number of days can put milk on the list
  // without also pulling bread onto it — keeps the full-trip test's list deterministic
  // and single-item without needing to also stock and route to a second good.
  { id: 'bread', name: 'Bread', unitPrice: 2, cost: 1.2, depletionPerDay: 0.01, reorderThreshold: 0.3, impulseBase: 0.05, category: 'bakery' },
];

// Generous stock, perfectly reliable, and freshness that never crosses either threshold
// within these tests' tick ranges — these tests are about the shopper FSM, not inventory
// edge cases (InventorySystem has its own dedicated test suite for those).
const POLICIES: readonly SupplyPolicy[] = [
  { goodId: 'milk', reorderPoint: 5, orderUpToLevel: 1000, leadTimeTicks: 10, supplierReliability: 1, spoilageTauDays: 10_000 },
  { goodId: 'bread', reorderPoint: 5, orderUpToLevel: 1000, leadTimeTicks: 10, supplierReliability: 1, spoilageTauDays: 10_000 },
];

function worldWithShoppers(seed = 1): {
  world: World;
  grid: BuildGrid;
  pathing: PathingSystem;
  inventory: InventorySystem;
  checkout: CheckoutSystem;
  economy: EconomySystem;
  market: MarketSystem;
  shoppers: ShoppersSystem;
} {
  const world = new World({ seed });
  const grid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
  const pathing = new PathingSystem(grid);
  world.register(pathing);
  const inventory = new InventorySystem(POLICIES);
  world.register(inventory);
  const checkout = new CheckoutSystem(grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory, CATALOG);
  world.register(economy);
  const market = new MarketSystem(null, CATALOG);
  world.register(market);
  const shoppers = new ShoppersSystem(market, grid, pathing, inventory, checkout, economy, CATALOG);
  world.register(shoppers);
  return { world, grid, pathing, inventory, checkout, economy, market, shoppers };
}

describe('ShoppersSystem — commands and wiring', () => {
  it('addHousehold creates a fully-stocked household with an empty list', () => {
    const { world, shoppers } = worldWithShoppers();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    const household = shoppers.household(1);
    expect(household.list).toEqual([]);
  });

  it('addHousehold stores the segment and applies its consumptionMultiplier on depletion', () => {
    const { world, shoppers } = worldWithShoppers();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'convenience', position: { x: 0, y: 0 } });
    world.step();
    expect(shoppers.household(1).segment).toBe('convenience');
  });

  it('addHousehold stores the catchment position', () => {
    const { world, shoppers } = worldWithShoppers();
    world.commands.push({
      type: 'addHousehold',
      householdId: 1,
      segment: 'family',
      position: { x: 2, y: -5 },
    });
    world.step();
    expect(shoppers.household(1).position).toEqual({ x: 2, y: -5 });
  });

  it('folds household position into the world hash', () => {
    const a = worldWithShoppers();
    a.world.commands.push({
      type: 'addHousehold',
      householdId: 1,
      segment: 'family',
      position: { x: 1, y: 1 },
    });
    a.world.step();

    const b = worldWithShoppers();
    b.world.commands.push({
      type: 'addHousehold',
      householdId: 1,
      segment: 'family',
      position: { x: 9, y: 9 },
    });
    b.world.step();

    // Same seed, same tick, same everything except where the household lives.
    expect(a.world.hash).not.toBe(b.world.hash);
  });

  it('stockFixture registers a good-specific pathing destination from the fixture cells', () => {
    const { world, grid, pathing } = worldWithShoppers();
    grid.place('shelf_basic', 3, 3, 0);
    const instanceId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId, goodId: 'milk' });
    world.step();
    expect(pathing.destinationIds()).toContain('good:milk');
    expect(pathing.distanceAt('good:milk', 0, 0)).toBeGreaterThan(0);
  });

  it('does not claim kernel, grid, or pathing command types', () => {
    const { shoppers, world } = worldWithShoppers();
    expect(shoppers.applyCommand(world, { type: 'noop' })).toBe(false);
    expect(
      shoppers.applyCommand(world, { type: 'placeFixture', fixtureId: 'shelf_basic', x: 0, y: 0, rotation: 0 }),
    ).toBe(false);
  });

  it('advances every household pantry by one day at each day boundary', () => {
    const { world, shoppers } = worldWithShoppers();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    // TICKS_PER_SIM_DAY (1,440) further ticks crosses exactly one day boundary.
    world.run(1440);
    const household = shoppers.household(1);
    // milk depletes 0.15/day from a full pantry (1.0) -> 0.85, still above its 0.3 threshold.
    expect(household.pantry.milk).toBeCloseTo(0.85);
    expect(household.list).toEqual([]);
  });

  it('spawnShopper snapshots the household list at spawn time', () => {
    const { world, shoppers } = worldWithShoppers();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();
    const shopper = shoppers.shopper(100);
    expect(shopper.householdId).toBe(1);
    expect(shopper.cart).toEqual([]);
    expect(shopper.requested).toBe(0); // household starts fully stocked
    // Entering is a one-tick pass-through; an empty list sends it straight to checkout.
    expect(shopper.state).toBe('checkingOut');
  });

  it('stockedGoodAt returns the good stocked at a fixture instance', () => {
    const { world, grid, shoppers } = worldWithShoppers();
    grid.place('shelf_basic', 3, 3, 0);
    const instanceId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId, goodId: 'milk' });
    world.step();
    expect(shoppers.stockedGoodAt(instanceId)).toBe('milk');
  });

  it('stockedGoodAt returns null for an unstocked instance', () => {
    const { shoppers } = worldWithShoppers();
    expect(shoppers.stockedGoodAt(999999)).toBeNull();
  });

  it('spawnShopper starts a new shopper with staffInteractionGood null and queuePenaltyRisingFired false', () => {
    const { world, shoppers } = worldWithShoppers();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();
    const shopper = shoppers.shopper(100);
    expect(shopper.staffInteractionGood).toBeNull();
    expect(shopper.queuePenaltyRisingFired).toBe(false);
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const { world, grid } = worldWithShoppers(seed);
    grid.place('shelf_basic', 3, 3, 0);
    const instanceId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.run(30);
    const finalHash = world.hash;

    // Uses core/world.js's `replay()` rather than hand-pushing the log, because this
    // log spans multiple ticks (two commands at tick 0, one more at tick 1 after the
    // manual `world.step()` above) — pushing every entry before any step() collapses
    // them all onto tick 0, shifting spawnShopper a tick earlier than it actually
    // happened. That shift was invisible back when an unstaffed checkout just froze the
    // shopper forever (tick-of-freeze didn't matter); it stopped being invisible the
    // moment phase 1.8 made checkingOut with no open lane a real, immediately-resolved
    // transition. `replay()` schedules each command against its real recorded tick.
    const replayGrid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
    replayGrid.place('shelf_basic', 3, 3, 0);
    const replayed = replay(seed, world.commands.log, 31, (w) => {
      const replayPathing = new PathingSystem(replayGrid);
      w.register(replayPathing);
      const replayInventory = new InventorySystem(POLICIES);
      w.register(replayInventory);
      const replayCheckout = new CheckoutSystem(replayGrid, replayPathing);
      w.register(replayCheckout);
      const replayEconomy = new EconomySystem(replayCheckout, replayInventory, CATALOG);
      w.register(replayEconomy);
      const replayMarket = new MarketSystem(null, CATALOG);
      w.register(replayMarket);
      w.register(
        new ShoppersSystem(replayMarket, replayGrid, replayPathing, replayInventory, replayCheckout, replayEconomy, CATALOG),
      );
    });
    expect(replayed.hash).toBe(finalHash);
  });
});

describe('tellFired for stepShopping terms', () => {
  it('fires fillRateMiss when a stocked shelf has run out', () => {
    const world = new World({ seed: 1 });
    const grid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
    const pathing = new PathingSystem(grid);
    world.register(pathing);
    // Seeded at 1 unit, drained to empty below, never reorders — the shelf destination
    // exists (stockFixture registers it) but consume() then always returns 'outOfStock'.
    const emptyPolicies: readonly SupplyPolicy[] = [
      { goodId: 'milk', reorderPoint: 0, orderUpToLevel: 1, leadTimeTicks: 1_000_000, supplierReliability: 1, spoilageTauDays: 100 },
    ];
    const inventory = new InventorySystem(emptyPolicies);
    world.register(inventory);
    const checkout = new CheckoutSystem(grid, pathing);
    world.register(checkout);
    const economy = new EconomySystem(checkout, inventory, CATALOG);
    world.register(economy);
    const market = new MarketSystem(null, CATALOG);
    world.register(market);
    const shoppers = new ShoppersSystem(market, grid, pathing, inventory, checkout, economy, CATALOG);
    world.register(shoppers);

    grid.place('shelf_basic', 6, 6, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    expect(inventory.consume('milk', world.tick)).toBe('sold'); // drains the single seeded unit
    world.run(5 * 1440); // milk crosses its reorderThreshold, entering the list
    expect(shoppers.household(1).list).toEqual(['milk']);

    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();

    let sawFillRateMiss = false;
    for (let i = 0; i < 2000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term === 'fillRateMiss')) {
        sawFillRateMiss = true;
      }
    }
    expect(sawFillRateMiss).toBe(true);
  });

  it('fires spoiledEncounters when a good comes back spoiled', () => {
    const world = new World({ seed: 1 });
    const grid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
    const pathing = new PathingSystem(grid);
    world.register(pathing);
    const fastSpoilPolicies: readonly SupplyPolicy[] = [
      { goodId: 'milk', reorderPoint: 0, orderUpToLevel: 5, leadTimeTicks: 1_000_000, supplierReliability: 1, spoilageTauDays: 0.0001 },
    ];
    const inventory = new InventorySystem(fastSpoilPolicies);
    world.register(inventory);
    const checkout = new CheckoutSystem(grid, pathing);
    world.register(checkout);
    const economy = new EconomySystem(checkout, inventory, CATALOG);
    world.register(economy);
    const market = new MarketSystem(null, CATALOG);
    world.register(market);
    const shoppers = new ShoppersSystem(market, grid, pathing, inventory, checkout, economy, CATALOG);
    world.register(shoppers);

    grid.place('shelf_basic', 6, 6, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    world.run(5 * 1440); // milk crosses its 0.3 reorder threshold, entering the list
    expect(shoppers.household(1).list).toEqual(['milk']);

    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();

    let sawSpoiled = false;
    for (let i = 0; i < 2000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term === 'spoiledEncounters')) {
        sawSpoiled = true;
      }
    }
    expect(sawSpoiled).toBe(true);
  });

  it('fires priceSurpriseNegative when paying well above reference', () => {
    const { world, grid, shoppers } = worldWithShoppers(42);
    grid.place('shelf_basic', 6, 6, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 10 }); // reference is 3
    world.step();
    world.run(5 * 1440);
    expect(shoppers.household(1).list).toEqual(['milk']);

    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();

    let sawNegative = false;
    for (let i = 0; i < 2000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term === 'priceSurpriseNegative')) {
        sawNegative = true;
      }
    }
    expect(sawNegative).toBe(true);
  });

  it('fires priceSurprisePositive on a steep discount', () => {
    const { world, grid, shoppers } = worldWithShoppers(42);
    grid.place('shelf_basic', 6, 6, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 0.5 }); // reference is 3
    world.step();
    world.run(5 * 1440);
    expect(shoppers.household(1).list).toEqual(['milk']);

    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();

    let sawPositive = false;
    for (let i = 0; i < 2000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term === 'priceSurprisePositive')) {
        sawPositive = true;
      }
    }
    expect(sawPositive).toBe(true);
  });

  it('stays silent on priceSurprise within threshold (price at reference)', () => {
    const { world, grid, shoppers } = worldWithShoppers(42);
    grid.place('shelf_basic', 6, 6, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    world.run(5 * 1440);
    expect(shoppers.household(1).list).toEqual(['milk']);

    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();

    let sawPriceSurpriseTell = false;
    for (let i = 0; i < 2000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term.startsWith('priceSurprise'))) {
        sawPriceSurpriseTell = true;
      }
    }
    expect(sawPriceSurpriseTell).toBe(false);
  });
});

describe('live queuePenalty tells', () => {
  function buildQueuedBehindBlockerWorld(staffingOverrides: { balkToleranceTicks: number; abandonToleranceTicks: number }): {
    world: World;
    checkout: CheckoutSystem;
    shoppers: ShoppersSystem;
    laneId: number;
  } {
    const world = new World({ seed: 1 });
    const grid = new BuildGrid({ width: 12, height: 12 }, DEFAULT_CATALOG);
    const pathing = new PathingSystem(grid);
    world.register(pathing);
    const inventory = new InventorySystem(POLICIES);
    world.register(inventory);
    const checkout = new CheckoutSystem(grid, pathing, {
      ...DEFAULT_STAFFING_CONFIG,
      ...staffingOverrides,
    });
    world.register(checkout);
    const economy = new EconomySystem(checkout, inventory, CATALOG);
    world.register(economy);
    const market = new MarketSystem(null, CATALOG);
    world.register(market);
    const shoppers = new ShoppersSystem(market, grid, pathing, inventory, checkout, economy, CATALOG);
    world.register(shoppers);

    grid.place('shelf_basic', 3, 3, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    grid.place('register', 10, 10, 0);
    const laneId = grid.placements()[1]!.instanceId;
    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
    world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: laneId });
    world.step();
    // A synthetic blocker (not tracked by ShoppersSystem, same precedent as
    // checkout/system.test.ts's own balk/abandon tests) occupies the lane indefinitely
    // so the real shopper below queues behind it and accumulates real wait ticks.
    checkout.reserveLane(laneId);
    checkout.joinQueue(999_999, laneId, 100_000, world.tick);

    world.run(5 * 1440); // milk crosses its reorder threshold, entering the list
    expect(shoppers.household(1).list).toEqual(['milk']);
    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();

    return { world, checkout, shoppers, laneId };
  }

  it('fires queuePenaltyRising once, mid-trip, once wait crosses the rising threshold', () => {
    const { world, shoppers } = buildQueuedBehindBlockerWorld({ balkToleranceTicks: 200, abandonToleranceTicks: 400 });
    let firedCount = 0;
    for (let i = 0; i < 3000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      firedCount += world.events.drain().filter((e) => e.type === 'tellFired' && e.term === 'queuePenaltyRising').length;
    }
    expect(firedCount).toBe(1); // fires once, not once per tick above threshold
  });

  it('fires queuePenaltyBalk exactly when the trip abandons', () => {
    const { world, shoppers } = buildQueuedBehindBlockerWorld({ balkToleranceTicks: 50, abandonToleranceTicks: 51 });
    let balkTellSeen = false;
    for (let i = 0; i < 3000 && shoppers.activeShopperIds().includes(100); i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term === 'queuePenaltyBalk')) {
        balkTellSeen = true;
      }
    }
    expect(balkTellSeen).toBe(true);
    expect(shoppers.activeShopperIds()).not.toContain(100);
  });
});

describe('ShoppersSystem — a full trip (PLAN.md §16 phase 1.6 gate)', () => {
  it('a shopper walks in, fills a correct list, pays, leaves', () => {
    const { world, grid, shoppers } = worldWithShoppers(42);
    grid.place('shelf_basic', 6, 6, 0);
    const shelfId = grid.placements()[0]!.instanceId;
    grid.place('register', 10, 10, 0);
    const registerId = grid.placements()[1]!.instanceId;

    world.commands.push({ type: 'stockFixture', instanceId: shelfId, goodId: 'milk' });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
    world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: registerId });
    world.step();

    // Five days of depletion at 0.15/day takes milk from 1.0 to 0.25, below its 0.3
    // reorder threshold — this is what puts "milk" on the household's list.
    world.run(5 * 1440);
    expect(shoppers.household(1).list).toEqual(['milk']);

    world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    world.step();
    expect(shoppers.shopper(100).state).toBe('shopping');

    for (let i = 0; i < 2000 && shoppers.activeShopperIds().includes(100); i++) world.step();

    expect(shoppers.activeShopperIds()).not.toContain(100);
    expect(shoppers.household(1).list).toEqual([]); // replenished at checkout
    expect(shoppers.household(1).pantry.milk).toBe(1);

    const events = world.events.drain();
    const sale = events.find((e) => e.type === 'saleCompleted');
    const trip = events.find((e) => e.type === 'shopperTripCompleted');
    expect(sale).toMatchObject({ shopperId: 100, householdId: 1, total: 3, items: ['milk'] });
    expect(trip).toMatchObject({ shopperId: 100, householdId: 1, fillRate: 1 });
    if (trip?.type === 'shopperTripCompleted') expect(trip.satisfaction).toBeGreaterThan(0);
  });
});
