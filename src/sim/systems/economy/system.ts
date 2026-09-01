import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { CheckoutSystem } from '../checkout/system.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { GoodDef } from '../goods/types.js';
import type { InventorySystem } from '../inventory/system.js';
import { DEFAULT_ECONOMY_CONFIG } from './config.js';
import type { EconomyConfig } from './config.js';
import type { DailyStatement, LedgerCategory, LedgerEntry, Promotion } from './types.js';

/**
 * Economy & pricing (PLAN.md §16 phase 1.9 — the last M1 phase). Per-SKU pricing,
 * promotions, and a full daily P&L kept as a tagged ledger, not just aggregates, so any
 * statement line "drills" to the exact entries that produced it (this phase's literal
 * gate). Direct-sibling-call pattern for labor/spoilage, same as every system since 1.5:
 * `CheckoutSystem#dailyWageCost` and `InventorySystem#drainSpoilageValue`.
 */
export class EconomySystem implements System {
  readonly name = 'economy';
  readonly #checkout: CheckoutSystem;
  readonly #inventory: InventorySystem;
  readonly #catalogById: ReadonlyMap<string, GoodDef>;
  readonly #config: EconomyConfig;
  readonly #prices = new Map<string, number>();
  readonly #promotions = new Map<string, Promotion>();
  readonly #ledger: LedgerEntry[] = [];
  readonly #statements: DailyStatement[] = [];
  #marketingDailyAmount = 0;

  constructor(
    checkout: CheckoutSystem,
    inventory: InventorySystem,
    catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG,
    config: EconomyConfig = DEFAULT_ECONOMY_CONFIG,
  ) {
    this.#checkout = checkout;
    this.#inventory = inventory;
    this.#catalogById = new Map(catalog.map((g) => [g.id, g]));
    this.#config = config;
  }

  update(world: World): void {
    const expired: string[] = [];
    for (const [goodId, promo] of this.#promotions) {
      if (world.tick >= promo.endsAtTick) expired.push(goodId);
    }
    for (const goodId of expired) this.#promotions.delete(goodId);

    if (world.tick % TICKS_PER_SIM_DAY === 0) {
      this.#closeDailyStatement(world);
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const goodIds = [...this.#prices.keys()].sort();
    hasher.u32(goodIds.length);
    for (const goodId of goodIds) hasher.str(goodId).f64(this.#prices.get(goodId)!);

    const promoIds = [...this.#promotions.keys()].sort();
    hasher.u32(promoIds.length);
    for (const goodId of promoIds) {
      const promo = this.#promotions.get(goodId)!;
      hasher.str(goodId).f64(promo.discountFraction).u32(promo.endsAtTick);
    }

    hasher.f64(this.#marketingDailyAmount);
    // The ledger/statements are a deterministic function of the (already-hashed) command
    // log replayed through recordSale()/dailyWageCost()/drainSpoilageValue() — hashing
    // them too would just duplicate what the drilldown/gate tests already prove, the
    // same reasoning PathingSystem's computed fields use (see phase 1.5).
  }

  applyCommand(world: World, command: Command): boolean {
    switch (command.type) {
      case 'setPrice':
        this.#prices.set(command.goodId, command.price);
        return true;
      case 'startPromotion':
        this.#promotions.set(command.goodId, {
          goodId: command.goodId,
          discountFraction: command.discountFraction,
          endsAtTick: world.tick + command.durationTicks,
        });
        return true;
      case 'setMarketingSpend':
        this.#marketingDailyAmount = command.dailyAmount;
        return true;
      default:
        return false;
    }
  }

  /** The catalog's authored price — the reference §5.3's priceSurprise and elasticity compare against. */
  referencePriceOf(goodId: string): number {
    return this.#catalogById.get(goodId)?.unitPrice ?? 0;
  }

  /** The price a shopper actually pays right now: an override (if set), promotion discounted. */
  priceOf(goodId: string, tick: number): number {
    const base = this.#prices.get(goodId) ?? this.referencePriceOf(goodId);
    const promo = this.#promotions.get(goodId);
    if (promo && tick < promo.endsAtTick) return base * (1 - promo.discountFraction);
    return base;
  }

  /**
   * The player's basket price index relative to reference — 1.0 at reference, `< 1`
   * discounted. Consumed by `RivalsSystem` (`RivalDeps#playerPriceLevel`) so a rival's
   * weekly price reaction has something real to undercut against.
   */
  priceLevel(tick: number): number {
    const ids = [...this.#catalogById.keys()];
    if (ids.length === 0) return 1;
    const sum = ids.reduce((total, id) => {
      const reference = this.referencePriceOf(id);
      return total + (reference > 0 ? this.priceOf(id, tick) / reference : 1);
    }, 0);
    return sum / ids.length;
  }

  isLossLeader(goodId: string, tick: number): boolean {
    const cost = this.#catalogById.get(goodId)?.cost ?? 0;
    return this.priceOf(goodId, tick) <= cost * this.#config.lossLeaderMarginThreshold;
  }

  /** Called directly by ShoppersSystem at the moment a sale completes. */
  recordSale(revenue: number, cogs: number, tick: number): void {
    this.#ledger.push({ tick, category: 'revenue', amount: revenue });
    this.#ledger.push({ tick, category: 'cogs', amount: cogs });
  }

  ledger(): readonly LedgerEntry[] {
    return this.#ledger;
  }

  statements(): readonly DailyStatement[] {
    return this.#statements;
  }

  latestStatement(): DailyStatement | null {
    return this.#statements[this.#statements.length - 1] ?? null;
  }

  #closeDailyStatement(world: World): void {
    const day = Math.floor(world.tick / TICKS_PER_SIM_DAY) - 1;
    const dayStartTick = world.tick - TICKS_PER_SIM_DAY;

    const labor = this.#checkout.dailyWageCost();
    const spoilage = this.#inventory.drainSpoilageValue();
    const rent = this.#config.rentPerDay;
    const utilities = this.#config.utilitiesPerDay;
    const marketing = this.#marketingDailyAmount;
    this.#ledger.push({ tick: world.tick, category: 'labor', amount: labor });
    this.#ledger.push({ tick: world.tick, category: 'spoilage', amount: spoilage });
    this.#ledger.push({ tick: world.tick, category: 'rent', amount: rent });
    this.#ledger.push({ tick: world.tick, category: 'utilities', amount: utilities });
    this.#ledger.push({ tick: world.tick, category: 'marketing', amount: marketing });

    const sumOf = (category: LedgerCategory): number =>
      this.#ledger
        .filter((e) => e.category === category && e.tick >= dayStartTick && e.tick < world.tick)
        .reduce((sum, e) => sum + e.amount, 0);

    const revenue = sumOf('revenue');
    const cogs = sumOf('cogs');
    const shrink = sumOf('shrink'); // always 0 this phase — no theft mechanic yet (see plan doc)

    this.#statements.push({
      day,
      revenue,
      cogs,
      labor,
      rent,
      utilities,
      marketing,
      shrink,
      spoilage,
      ebitda: revenue - cogs - labor - rent - utilities - marketing - shrink - spoilage,
    });
  }
}
