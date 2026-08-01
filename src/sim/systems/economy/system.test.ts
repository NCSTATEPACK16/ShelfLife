import { describe, expect, it } from 'vitest';
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import { World } from '../../core/world.js';
import { CheckoutSystem } from '../checkout/system.js';
import type { GoodDef } from '../goods/types.js';
import { InventorySystem } from '../inventory/system.js';
import type { SupplyPolicy } from '../inventory/types.js';
import { PathingSystem } from '../pathing/system.js';
import { BuildGrid } from '../grid/grid.js';
import { DEFAULT_CATALOG } from '../grid/catalog.js';
import { EconomySystem } from './system.js';

const CATALOG: readonly GoodDef[] = [
  { id: 'milk', name: 'Milk', unitPrice: 3, cost: 2, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05 },
];

const FAST_SPOILING_POLICY: SupplyPolicy = {
  goodId: 'milk',
  reorderPoint: 0, // never reorder — this test just wants one spoiled unit
  orderUpToLevel: 1,
  leadTimeTicks: 1_000_000,
  supplierReliability: 1,
  spoilageTauDays: 0.001,
};

function worldWithEconomy(seed = 1): {
  world: World;
  economy: EconomySystem;
  checkout: CheckoutSystem;
  inventory: InventorySystem;
} {
  const world = new World({ seed });
  const grid = new BuildGrid({ width: 10, height: 10 }, DEFAULT_CATALOG);
  const pathing = new PathingSystem(grid);
  world.register(pathing);
  const checkout = new CheckoutSystem(grid, pathing);
  world.register(checkout);
  const inventory = new InventorySystem(undefined, undefined, CATALOG);
  world.register(inventory);
  const economy = new EconomySystem(checkout, inventory, CATALOG);
  world.register(economy);
  return { world, economy, checkout, inventory };
}

describe('EconomySystem — pricing', () => {
  it('defaults to the catalog unitPrice', () => {
    const { economy } = worldWithEconomy();
    expect(economy.priceOf('milk', 0)).toBe(3);
  });

  it('setPrice overrides the catalog price', () => {
    const { world, economy } = worldWithEconomy();
    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 5 });
    world.step();
    expect(economy.priceOf('milk', world.tick)).toBe(5);
  });

  it('startPromotion discounts the current price until it expires', () => {
    const { world, economy } = worldWithEconomy();
    world.commands.push({ type: 'startPromotion', goodId: 'milk', discountFraction: 0.2, durationTicks: 100 });
    world.step();
    expect(economy.priceOf('milk', world.tick)).toBeCloseTo(3 * 0.8);
    world.run(100);
    expect(economy.priceOf('milk', world.tick)).toBeCloseTo(3);
  });

  it('referencePriceOf always returns the catalog price, ignoring overrides/promotions', () => {
    const { world, economy } = worldWithEconomy();
    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 10 });
    world.step();
    expect(economy.referencePriceOf('milk')).toBe(3);
  });

  it('isLossLeader is true once price drops to or below cost', () => {
    const { world, economy } = worldWithEconomy();
    expect(economy.isLossLeader('milk', world.tick)).toBe(false);
    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 1.5 });
    world.step();
    expect(economy.isLossLeader('milk', world.tick)).toBe(true);
  });

  it('does not claim kernel command types', () => {
    const { economy, world } = worldWithEconomy();
    expect(economy.applyCommand(world, { type: 'noop' })).toBe(false);
  });
});

describe('EconomySystem — P&L', () => {
  it('recordSale feeds revenue/cogs into the next daily statement', () => {
    const { world, economy } = worldWithEconomy();
    world.step();
    economy.recordSale(9, 6, world.tick);
    economy.recordSale(3, 2, world.tick);
    world.run(TICKS_PER_SIM_DAY);
    const statements = economy.statements();
    expect(statements).toHaveLength(1);
    expect(statements[0]!.revenue).toBeCloseTo(12);
    expect(statements[0]!.cogs).toBeCloseTo(8);
  });

  it('a statement always includes rent and utilities even with no sales', () => {
    const { world, economy } = worldWithEconomy();
    world.run(TICKS_PER_SIM_DAY);
    const statement = economy.statements()[0]!;
    expect(statement.rent).toBeGreaterThan(0);
    expect(statement.utilities).toBeGreaterThan(0);
    expect(statement.ebitda).toBeLessThan(0); // no revenue, only fixed costs
  });

  it('labor comes from CheckoutSystem#dailyWageCost', () => {
    const { world, economy, checkout, inventory } = worldWithEconomy();
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
    world.step();
    world.run(TICKS_PER_SIM_DAY);
    expect(economy.statements()[0]!.labor).toBe(checkout.dailyWageCost());
    void inventory;
  });

  it('spoilage comes from InventorySystem#drainSpoilageValue and resets it', () => {
    const world = new World({ seed: 1 });
    const grid = new BuildGrid({ width: 10, height: 10 }, DEFAULT_CATALOG);
    const pathing = new PathingSystem(grid);
    world.register(pathing);
    const checkout = new CheckoutSystem(grid, pathing);
    world.register(checkout);
    const inventory = new InventorySystem([FAST_SPOILING_POLICY], undefined, CATALOG);
    world.register(inventory);
    const economy = new EconomySystem(checkout, inventory, CATALOG);
    world.register(economy);

    world.step();
    world.run(TICKS_PER_SIM_DAY - (world.tick % TICKS_PER_SIM_DAY) - 1); // to just before day's end
    expect(inventory.consume('milk', world.tick)).toBe('spoiled'); // tau of 0.001 days is long gone
    world.step(); // crosses the day boundary, closing the statement
    expect(economy.statements()).toHaveLength(1);
    expect(economy.statements()[0]!.spoilage).toBeCloseTo(2); // milk's cost
  });

  it('ledger drills to the entries that produced a statement (drilldown)', () => {
    const { world, economy } = worldWithEconomy();
    world.step();
    economy.recordSale(9, 6, world.tick);
    world.run(TICKS_PER_SIM_DAY);
    const statement = economy.statements()[0]!;
    const dayStart = statement.day * TICKS_PER_SIM_DAY;
    const dayEnd = dayStart + TICKS_PER_SIM_DAY;
    const revenueEntries = economy
      .ledger()
      .filter((e) => e.category === 'revenue' && e.tick >= dayStart && e.tick < dayEnd);
    const summed = revenueEntries.reduce((sum, e) => sum + e.amount, 0);
    expect(summed).toBeCloseTo(statement.revenue);
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const { world } = worldWithEconomy(seed);
    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 4 });
    world.commands.push({ type: 'startPromotion', goodId: 'milk', discountFraction: 0.1, durationTicks: 50 });
    world.run(60);
    const finalHash = world.hash;

    const replayGrid = new BuildGrid({ width: 10, height: 10 }, DEFAULT_CATALOG);
    const replayed = new World({ seed });
    const replayPathing = new PathingSystem(replayGrid);
    replayed.register(replayPathing);
    const replayCheckout = new CheckoutSystem(replayGrid, replayPathing);
    replayed.register(replayCheckout);
    const replayInventory = new InventorySystem(undefined, undefined, CATALOG);
    replayed.register(replayInventory);
    replayed.register(new EconomySystem(replayCheckout, replayInventory, CATALOG));
    for (const entry of world.commands.log) replayed.commands.push(entry.command);
    replayed.run(60);
    expect(replayed.hash).toBe(finalHash);
  });
});
