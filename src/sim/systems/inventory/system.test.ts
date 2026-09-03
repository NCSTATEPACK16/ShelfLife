import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import type { SupplyPolicy } from './types.js';
import { DEFAULT_INVENTORY_CONFIG } from './config.js';
import { InventorySystem } from './system.js';

const RELIABLE_POLICY: SupplyPolicy = {
  goodId: 'milk',
  reorderPoint: 2,
  orderUpToLevel: 5,
  leadTimeTicks: 10,
  supplierReliability: 1,
  spoilageTauDays: 100, // long enough that spoilage never fires in these tests
};

const UNRELIABLE_POLICY: SupplyPolicy = { ...RELIABLE_POLICY, supplierReliability: 0 };

const NO_REORDER_POLICY: SupplyPolicy = { ...RELIABLE_POLICY, leadTimeTicks: 1_000_000 };

function worldWithInventory(
  policies: readonly SupplyPolicy[],
  seed = 1,
  catalog?: ConstructorParameters<typeof InventorySystem>[2],
): { world: World; inventory: InventorySystem } {
  const world = new World({ seed });
  const inventory = catalog ? new InventorySystem(policies, undefined, catalog) : new InventorySystem(policies);
  world.register(inventory);
  return { world, inventory };
}

describe('InventorySystem', () => {
  it('seeds every policy good at its orderUpToLevel from construction', () => {
    const { inventory } = worldWithInventory([RELIABLE_POLICY]);
    expect(inventory.stockOf('milk')).toBe(5);
  });

  it('consume() sells one unit at a time, FIFO, when freshness is above the markdown threshold', () => {
    const { world, inventory } = worldWithInventory([RELIABLE_POLICY]);
    world.step();
    expect(inventory.consume('milk', world.tick)).toBe('sold');
    expect(inventory.stockOf('milk')).toBe(4);
  });

  it('consume() returns outOfStock once every unit is gone, with no reorder pending', () => {
    const { world, inventory } = worldWithInventory([NO_REORDER_POLICY]);
    world.step();
    for (let i = 0; i < 5; i++) expect(inventory.consume('milk', world.tick)).toBe('sold');
    expect(inventory.consume('milk', world.tick)).toBe('outOfStock');
  });

  it('places a full reorder and lands it after leadTimeTicks when the supplier is reliable', () => {
    const { world, inventory } = worldWithInventory([RELIABLE_POLICY]);
    world.step();
    // Drain to the reorder point (5 -> 2 after 3 sales) — the next update() should place an order.
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick);
    expect(inventory.stockOf('milk')).toBe(2);

    // The reorder itself is only placed on the *next* update() after the manual
    // consume() calls above (tick 2), so the order lands at tick 2 + leadTimeTicks.
    world.run(RELIABLE_POLICY.leadTimeTicks);
    expect(inventory.stockOf('milk')).toBe(2); // not arrived yet

    world.step(); // crosses the order's arrivesAtTick
    expect(inventory.stockOf('milk')).toBe(RELIABLE_POLICY.orderUpToLevel);
  });

  it('an unreliable supplier delivers only half the ordered quantity', () => {
    const { world, inventory } = worldWithInventory([UNRELIABLE_POLICY]);
    world.step();
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick); // stock now 2, at the reorder point

    world.run(UNRELIABLE_POLICY.leadTimeTicks + 1); // one extra tick to land the order (see above)
    // Ordered qty = 5 - 2 = 3; half of that, rounded, is delivered on top of the 2 remaining.
    expect(inventory.stockOf('milk')).toBe(2 + Math.round(3 / 2));
  });

  it('never places a second order while one is already in transit', () => {
    const { world, inventory } = worldWithInventory([RELIABLE_POLICY]);
    world.step();
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick); // triggers a reorder next update()
    world.step();
    world.step(); // a second update() at/under the reorder point must not double-order
    world.run(RELIABLE_POLICY.leadTimeTicks);
    expect(inventory.stockOf('milk')).toBe(RELIABLE_POLICY.orderUpToLevel); // not double-topped-up
  });

  it("respects dockCapacity — a second good's order queues until a slot frees", () => {
    const potatoes: SupplyPolicy = { ...RELIABLE_POLICY, goodId: 'potatoes' };
    // Explicit tiny capacity so this test doesn't depend on the content file's value.
    const world = new World({ seed: 1 });
    const inventory = new InventorySystem([RELIABLE_POLICY, potatoes], { ...DEFAULT_INVENTORY_CONFIG, dockCapacity: 1 });
    world.register(inventory);
    world.step();
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick);
    inventory.consume('milk', world.tick); // milk hits reorder point
    inventory.consume('potatoes', world.tick);
    inventory.consume('potatoes', world.tick);
    inventory.consume('potatoes', world.tick); // potatoes also hits reorder point
    world.step(); // only one of the two orders can be placed (dock capacity 1)
    world.run(RELIABLE_POLICY.leadTimeTicks);
    const milkTopped = inventory.stockOf('milk') === RELIABLE_POLICY.orderUpToLevel;
    const potatoesTopped = inventory.stockOf('potatoes') === RELIABLE_POLICY.orderUpToLevel;
    expect(milkTopped !== potatoesTopped).toBe(true); // exactly one got its order in this window
  });

  it('does not claim kernel command types', () => {
    const { inventory, world } = worldWithInventory([RELIABLE_POLICY]);
    expect(inventory.applyCommand(world, { type: 'noop' })).toBe(false);
  });

  it('drainSpoilageValue accumulates cost for every spoiled unit and resets on read', () => {
    const spoilsFast: SupplyPolicy = { ...RELIABLE_POLICY, spoilageTauDays: 0.001 };
    const catalog = [
      { id: 'milk', name: 'Milk', unitPrice: 3, cost: 1.5, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05, category: 'dairy' },
    ];
    const { world, inventory } = worldWithInventory([spoilsFast], 1, catalog);
    world.step();
    world.run(1440); // one full day — well past a tau of 0.001 days
    expect(inventory.consume('milk', world.tick)).toBe('spoiled');
    expect(inventory.drainSpoilageValue()).toBeCloseTo(1.5);
    expect(inventory.drainSpoilageValue()).toBe(0); // drained, not re-readable
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const { world } = worldWithInventory([RELIABLE_POLICY], seed);
    world.run(RELIABLE_POLICY.leadTimeTicks + 10);
    const finalHash = world.hash;

    const replayed = new World({ seed });
    replayed.register(new InventorySystem([RELIABLE_POLICY]));
    replayed.run(RELIABLE_POLICY.leadTimeTicks + 10);
    expect(replayed.hash).toBe(finalHash);
  });
});
