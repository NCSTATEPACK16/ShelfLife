import { describe, expect, it } from 'vitest';
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import { World } from '../../core/world.js';
import { freshnessAt } from './freshness.js';
import { InventorySystem } from './system.js';
import type { SupplyPolicy } from './types.js';

/**
 * PLAN.md §16 phase 1.7's literal gate: "an unattended store runs out of milk on the
 * correct day; harness confirms spoilage economics within 2%." No shopper or UI is
 * involved — "unattended" means steady background consumption with no reordering
 * possible (dockCapacity: 0), so the day it runs out is exactly computable in advance
 * and this test proves the system lands on it precisely, not approximately.
 */
describe('InventorySystem — spoilage economics (PLAN.md §16 phase 1.7 gate)', () => {
  it('runs out of milk on the exact predicted day when the supplier can never reorder', () => {
    const policy: SupplyPolicy = {
      goodId: 'milk',
      reorderPoint: 5,
      orderUpToLevel: 10,
      leadTimeTicks: 1,
      supplierReliability: 1,
      spoilageTauDays: 1000, // long enough that spoilage never intervenes in this test
    };
    const world = new World({ seed: 1 });
    const inventory = new InventorySystem([policy], {
      dockCapacity: 0, // "unattended": no reorder can ever be placed
      markdownThreshold: 0.35,
      shrinkThreshold: 0.15,
      markdownDiscount: 0.3,
    });
    world.register(inventory);
    world.step();

    // Starts at orderUpToLevel (10) and this test consumes exactly one unit per sim day.
    // With no reorder possible, day `orderUpToLevel` is the last day a sale succeeds and
    // day `orderUpToLevel + 1` is the first day it doesn't — an exact, precomputed claim.
    for (let day = 1; day <= policy.orderUpToLevel; day++) {
      world.run(TICKS_PER_SIM_DAY);
      expect(inventory.consume('milk', world.tick), `day ${day} should still have stock`).toBe('sold');
    }

    world.run(TICKS_PER_SIM_DAY);
    expect(inventory.consume('milk', world.tick)).toBe('outOfStock');
    expect(inventory.stockOf('milk')).toBe(0);
  });

  it('freshness matches the exp(-t/tau) formula within 2% at several ages', () => {
    const tauDays = 7;
    const tauTicks = tauDays * TICKS_PER_SIM_DAY;
    for (const ageDays of [0, 1, 3, 7, 14, 30]) {
      const ageTicks = ageDays * TICKS_PER_SIM_DAY;
      const actual = freshnessAt(0, ageTicks, tauTicks);
      const expected = Math.exp(-ageTicks / tauTicks);
      const percentError = expected === 0 ? 0 : Math.abs(actual - expected) / expected;
      expect(percentError).toBeLessThan(0.02);
    }
  });
});
