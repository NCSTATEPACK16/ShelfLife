import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_SUPPLY_POLICIES } from './catalog.js';
import { DEFAULT_INVENTORY_CONFIG } from './config.js';
import type { InventoryConfig } from './config.js';
import { freshnessAt } from './freshness.js';
import type { Batch, ConsumeResult, StockedGood, SupplyPolicy } from './types.js';

/**
 * Inventory & suppliers (PLAN.md §16 phase 1.7). Tracked per good, not per physical
 * shelf — the store's total stock of a good is one ledger regardless of which fixture
 * displays it (see the phase plan's scope cuts). Fully autonomous: no commands, no
 * caller drives it, `update()` alone lands deliveries and places reorders.
 */
export class InventorySystem implements System {
  readonly name = 'inventory';
  readonly #policies: ReadonlyMap<string, SupplyPolicy>;
  readonly #config: InventoryConfig;
  readonly #catalogById: ReadonlyMap<string, GoodDef>;
  readonly #stocked = new Map<string, StockedGood>();
  #spoilageValue = 0;

  constructor(
    policies: readonly SupplyPolicy[] = DEFAULT_SUPPLY_POLICIES,
    config: InventoryConfig = DEFAULT_INVENTORY_CONFIG,
    catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG,
  ) {
    this.#policies = new Map(policies.map((p) => [p.goodId, p]));
    this.#config = config;
    this.#catalogById = new Map(catalog.map((g) => [g.id, g]));
    for (const policy of policies) {
      this.#stocked.set(policy.goodId, {
        goodId: policy.goodId,
        batches: [{ quantity: policy.orderUpToLevel, deliveredAtTick: 0 }],
        pendingOrders: [],
      });
    }
  }

  update(world: World): void {
    for (const [goodId, stocked] of this.#stocked) {
      const arrived = stocked.pendingOrders.filter((o) => o.arrivesAtTick <= world.tick);
      if (arrived.length === 0) continue;
      const stillPending = stocked.pendingOrders.filter((o) => o.arrivesAtTick > world.tick);
      const batches: Batch[] = [
        ...stocked.batches,
        ...arrived.map((o) => ({ quantity: o.quantity, deliveredAtTick: world.tick })),
      ];
      this.#stocked.set(goodId, { ...stocked, batches, pendingOrders: stillPending });
    }

    for (const [goodId, policy] of this.#policies) {
      const stocked = this.#stocked.get(goodId)!;
      if (stocked.pendingOrders.length > 0) continue; // already in transit
      const totalStock = totalOf(stocked);
      if (totalStock > policy.reorderPoint) continue;

      const inTransitCount = [...this.#stocked.values()].reduce((sum, s) => sum + s.pendingOrders.length, 0);
      if (inTransitCount >= this.#config.dockCapacity) continue;

      const orderedQty = policy.orderUpToLevel - totalStock;
      const reliable = world.rng.get('spoilage').chance(policy.supplierReliability);
      const deliveredQty = reliable ? orderedQty : Math.round(orderedQty / 2);
      this.#stocked.set(goodId, {
        ...stocked,
        pendingOrders: [...stocked.pendingOrders, { quantity: deliveredQty, arrivesAtTick: world.tick + policy.leadTimeTicks }],
      });
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const goodIds = [...this.#stocked.keys()].sort();
    hasher.u32(goodIds.length);
    for (const goodId of goodIds) {
      const stocked = this.#stocked.get(goodId)!;
      hasher.str(goodId).u32(stocked.batches.length);
      for (const batch of stocked.batches) hasher.u32(batch.quantity).u32(batch.deliveredAtTick);
      hasher.u32(stocked.pendingOrders.length);
      for (const order of stocked.pendingOrders) hasher.u32(order.quantity).u32(order.arrivesAtTick);
    }
    hasher.f64(this.#spoilageValue);
  }

  applyCommand(_world: World, _command: Command): boolean {
    return false; // fully autonomous — claims no command types
  }

  stockOf(goodId: string): number {
    const stocked = this.#stocked.get(goodId);
    return stocked ? totalOf(stocked) : 0;
  }

  /** Freshness (0-1) of the oldest batch — what the next `consume()` call would draw from. */
  freshnessOf(goodId: string, tick: number): number {
    const stocked = this.#stocked.get(goodId);
    const oldest = stocked?.batches[0];
    if (!oldest) return 0;
    return freshnessAt(oldest.deliveredAtTick, tick, this.#tauTicks(goodId));
  }

  /** Draws one unit from the oldest batch, applying markdown/shrink by its freshness. */
  consume(goodId: string, tick: number): ConsumeResult {
    const stocked = this.#stocked.get(goodId);
    const oldest = stocked?.batches[0];
    if (!stocked || !oldest) return 'outOfStock';

    const freshness = freshnessAt(oldest.deliveredAtTick, tick, this.#tauTicks(goodId));
    const remaining = oldest.quantity - 1;
    const batches = remaining > 0 ? [{ ...oldest, quantity: remaining }, ...stocked.batches.slice(1)] : stocked.batches.slice(1);
    this.#stocked.set(goodId, { ...stocked, batches });

    if (freshness < this.#config.shrinkThreshold) {
      this.#spoilageValue += this.#catalogById.get(goodId)?.cost ?? 0;
      return 'spoiled'; // written off, not sold
    }
    if (freshness < this.#config.markdownThreshold) return 'markdown';
    return 'sold';
  }

  /** COGS lost to spoilage since the last drain (PLAN.md §5.7's Spoilage line) — resets to 0. */
  drainSpoilageValue(): number {
    const value = this.#spoilageValue;
    this.#spoilageValue = 0;
    return value;
  }

  #tauTicks(goodId: string): number {
    const policy = this.#policies.get(goodId);
    return (policy?.spoilageTauDays ?? 1) * TICKS_PER_SIM_DAY;
  }
}

function totalOf(stocked: StockedGood): number {
  return stocked.batches.reduce((sum, b) => sum + b.quantity, 0);
}
