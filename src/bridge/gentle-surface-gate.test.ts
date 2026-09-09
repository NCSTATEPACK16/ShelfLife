import { describe, expect, it } from 'vitest';
import { World } from '../sim/core/world.js';
import { TELL_TERMS } from '../sim/content/gentle-surface.js';
import { DEFAULT_STAFFING_CONFIG } from '../sim/systems/checkout/config.js';
import { CheckoutSystem } from '../sim/systems/checkout/system.js';
import { EconomySystem } from '../sim/systems/economy/system.js';
import { DEFAULT_CATALOG } from '../sim/systems/grid/catalog.js';
import { BuildGrid } from '../sim/systems/grid/grid.js';
import type { GoodDef } from '../sim/systems/goods/types.js';
import { InventorySystem } from '../sim/systems/inventory/system.js';
import type { SupplyPolicy } from '../sim/systems/inventory/types.js';
import { MarketSystem } from '../sim/systems/market/system.js';
import { PathingSystem } from '../sim/systems/pathing/system.js';
import { ShoppersSystem } from '../sim/systems/shoppers/system.js';

const ADVERSE_CATALOG: readonly GoodDef[] = [
  // Required item; price flips negative-surprise -> positive-surprise partway through.
  { id: 'milk', name: 'Milk', unitPrice: 3, cost: 1.8, depletionPerDay: 0.15, reorderThreshold: 0.3, impulseBase: 0.05, category: 'dairy' },
  // Required item, permanently out of stock below -> guaranteed fillRateMiss.
  { id: 'bread', name: 'Bread', unitPrice: 2, cost: 1.2, depletionPerDay: 0.3, reorderThreshold: 0.3, impulseBase: 1, category: 'bakery' },
  // Required item on a fast-spoiling policy -> guaranteed spoiledEncounters; also an
  // impulse-eligible dairy good combo-adjacent to bread (bakery) -> adjacencyBonus.
  { id: 'eggs', name: 'Eggs', unitPrice: 4, cost: 2.5, depletionPerDay: 0.2, reorderThreshold: 0.3, impulseBase: 1, category: 'dairy' },
  // Never required (depletionPerDay 0); impulse-only, no combo partner -> promoLift once
  // promoted, needState/impulsePurchase before that depending on shopper segment.
  { id: 'snacks', name: 'Snacks', unitPrice: 4, cost: 2, depletionPerDay: 0, reorderThreshold: 0.3, impulseBase: 1, category: 'snacks' },
];

const POLICIES: readonly SupplyPolicy[] = [
  { goodId: 'milk', reorderPoint: 5, orderUpToLevel: 1000, leadTimeTicks: 10, supplierReliability: 1, spoilageTauDays: 10_000 },
  // bread: never reorders (huge lead time) and starts at 0 stock — always outOfStock.
  { goodId: 'bread', reorderPoint: 0, orderUpToLevel: 0, leadTimeTicks: 1_000_000, supplierReliability: 1, spoilageTauDays: 10_000 },
  // eggs: generous stock, but spoils almost immediately after delivery.
  { goodId: 'eggs', reorderPoint: 5, orderUpToLevel: 1000, leadTimeTicks: 10, supplierReliability: 1, spoilageTauDays: 0.0001 },
  { goodId: 'snacks', reorderPoint: 5, orderUpToLevel: 1000, leadTimeTicks: 10, supplierReliability: 1, spoilageTauDays: 10_000 },
];

/**
 * Phase 2.2's actual gate: every declared tell fires from a real sim signal at least
 * once, not just "the content schema is complete" (tools/check-gentle-surface.mjs
 * already proves that). One deliberately adverse store — understaffed relative to
 * bursts, a permanently out-of-stock shelf, a fast-spoiling shelf, a repriced good, a
 * dirty floor, an adjacent category combo, a promoted good, and both a family and a
 * non-family household — driven for enough ticks that every mechanic gets a real chance
 * to fire.
 */
function buildAdverseGateWorld(): {
  world: World;
  inventory: InventorySystem;
  checkout: CheckoutSystem;
  shoppers: ShoppersSystem;
  registerId: number;
  selfCheckoutId: number;
} {
  const world = new World({ seed: 2026 });
  const grid = new BuildGrid({ width: 16, height: 16 }, DEFAULT_CATALOG);
  const pathing = new PathingSystem(grid);
  world.register(pathing);
  const inventory = new InventorySystem(POLICIES, undefined, ADVERSE_CATALOG);
  world.register(inventory);
  // Faster decay than default and a lower per-staff restore, so even one assigned
  // staff member's tidying loses to traffic decay — cleanlinessLow needs to be reachable
  // even though a staffed register is also open (for staffInteractionGood coverage).
  // Shorter balk/abandon tolerances so a real shopper burst produces queuePenaltyRising
  // and queuePenaltyBalk within a practical tick budget.
  const checkout = new CheckoutSystem(grid, pathing, {
    ...DEFAULT_STAFFING_CONFIG,
    cleanlinessDecayPerTick: 0.002,
    cleanlinessRestorePerStaffPerTick: 0.0002,
    balkToleranceTicks: 15,
    abandonToleranceTicks: 25,
  });
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory, ADVERSE_CATALOG);
  world.register(economy);
  const market = new MarketSystem(null, ADVERSE_CATALOG);
  world.register(market);
  const shoppers = new ShoppersSystem(market, grid, pathing, inventory, checkout, economy, ADVERSE_CATALOG);
  world.register(shoppers);

  // A tight cluster so every good is within exposureRadius of a shopper picking up milk:
  // milk(6,6) bread(7,6) eggs(6,7) snacks(7,7).
  grid.place('shelf_endcap', 6, 6, 0);
  const milkShelf = grid.placements()[0]!.instanceId;
  grid.place('shelf_endcap', 7, 6, 0);
  const breadShelf = grid.placements()[1]!.instanceId;
  grid.place('shelf_endcap', 6, 7, 0);
  const eggsShelf = grid.placements()[2]!.instanceId;
  grid.place('shelf_endcap', 7, 7, 0);
  const snacksShelf = grid.placements()[3]!.instanceId;
  world.commands.push({ type: 'stockFixture', instanceId: milkShelf, goodId: 'milk' });
  world.commands.push({ type: 'stockFixture', instanceId: breadShelf, goodId: 'bread' });
  world.commands.push({ type: 'stockFixture', instanceId: eggsShelf, goodId: 'eggs' });
  world.commands.push({ type: 'stockFixture', instanceId: snacksShelf, goodId: 'snacks' });

  // One staffed register (good interaction, morale above threshold) and one
  // self-checkout (absent interaction) — both open lanes, so a shopper burst queues on
  // both and understaffing relative to the burst still produces real queues.
  grid.place('register', 12, 12, 0);
  const registerId = grid.placements()[4]!.instanceId;
  grid.place('self_checkout', 12, 14, 0);
  const selfCheckoutId = grid.placements()[5]!.instanceId;
  world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.9 });
  world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: registerId });

  // milk priced well above reference at first (priceSurpriseNegative on early trips).
  world.commands.push({ type: 'setPrice', goodId: 'milk', price: 9 });

  world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
  world.commands.push({ type: 'addHousehold', householdId: 2, segment: 'priceHunter', position: { x: 0, y: 0 } });
  world.step();
  return { world, inventory, checkout, shoppers, registerId, selfCheckoutId };
}

describe('gentle surface gate: all 15 terms fire', () => {
  it('fires a tellFired event for every declared term across a long adverse run', () => {
    const { world, inventory, checkout, shoppers, registerId, selfCheckoutId } = buildAdverseGateWorld();
    const seen = new Set<string>();
    let nextShopperId = 100;
    let priceFlipped = false;
    let promoted = false;
    let blockersInjected = false;

    for (let i = 0; i < 30_000; i++) {
      // A steady cadence of new trips from both households, whenever their list has
      // something and they aren't already shopping — keeps the store under continuous
      // load without ever teleporting in a synchronized flood (see understaffing.test.ts
      // for why staggering matters for real queue formation).
      if (i % 40 === 0) {
        for (const householdId of [1, 2] as const) {
          if (shoppers.household(householdId).list.length > 0) {
            world.commands.push({ type: 'spawnShopper', shopperId: nextShopperId++, householdId });
          }
        }
      }
      // At tick 12,000, a synthetic blocker (not tracked by ShoppersSystem, same
      // precedent as checkout/system.test.ts's own balk/abandon tests) occupies each
      // lane indefinitely — real burst-spawned shoppers below then queue behind them and
      // accumulate real wait ticks, regardless of their own cart sizes (many burst
      // shoppers have near-empty carts, which alone would clear a lane almost
      // instantly and never build a queue).
      if (!blockersInjected && i === 12_000) {
        checkout.reserveLane(registerId);
        checkout.joinQueue(999_997, registerId, 100_000, world.tick);
        checkout.reserveLane(selfCheckoutId);
        checkout.joinQueue(999_998, selfCheckoutId, 100_000, world.tick);
        blockersInjected = true;
      }
      // A real burst starting at tick 12,000, staggered one shopper per tick (not a
      // simultaneous teleport-in — see understaffing.test.ts on why lockstep arrivals
      // hide queueing) — enough sustained demand on two now-blocked lanes, with tight
      // balk/abandon tolerances above, to guarantee real queueing and both rising and
      // balk tells.
      if (i >= 12_000 && i < 12_080 && i % 2 === 0) {
        const householdId = (i / 2) % 2 === 0 ? 1 : 2;
        world.commands.push({ type: 'spawnShopper', shopperId: nextShopperId++, householdId });
      }
      // Flip milk's price low partway through -> priceSurprisePositive on later trips.
      if (!priceFlipped && i === 15_000) {
        world.commands.push({ type: 'setPrice', goodId: 'milk', price: 0.2 });
        priceFlipped = true;
      }
      // Promote snacks partway through -> promoLift on later impulse hits.
      if (!promoted && i === 18_000) {
        world.commands.push({ type: 'startPromotion', goodId: 'snacks', discountFraction: 0.3, durationTicks: 100_000 });
        promoted = true;
      }

      world.step();
      for (const e of world.events.drain()) {
        if (e.type === 'tellFired') seen.add(e.term);
      }
    }

    // 'visibility' has no bubble/event by design (world-mark-only) — verified separately
    // below via a direct stock/capacity read, not via tellFired.
    const missing = TELL_TERMS.filter((t) => t !== 'visibility' && !seen.has(t));
    expect(missing).toEqual([]);

    expect(inventory.stockOf('milk')).toBeGreaterThan(0);
    expect(inventory.capacityOf('milk')).toBeGreaterThan(0);
    void checkout;
  }, 30_000);
});
