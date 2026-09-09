import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { CheckoutSystem } from '../checkout/system.js';
import type { EconomySystem } from '../economy/system.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { GoodDef } from '../goods/types.js';
import type { InventorySystem } from '../inventory/system.js';
import type { LoyaltySystem } from '../loyalty/system.js';
import type { TripOutcome } from '../loyalty/types.js';
import type { RivalsView } from '../rivals/types.js';
import { travelCost } from './catchment.js';
import { chooseStore, indexToFit, softmax, storeUtility, type StoreTerms } from './choice.js';
import { DEFAULT_CATCHMENT_CONFIG, DEFAULT_MARKET_CONFIG, DEFAULT_SEGMENT_CONFIG } from './config.js';
import type { CatchmentConfig, MarketConfig, SegmentConfig } from './config.js';
import { advancePantryDay, deriveShoppingList } from './household.js';
import { PLAYER_STORE_ID, playerStoreTerms, rivalStoreTerms } from './terms.js';
import type { Household, Position } from './types.js';

/** The live systems a household's store choice reads from. `null` keeps household-only behaviour. */
export interface MarketDeps {
  readonly inventory: InventorySystem;
  readonly checkout: CheckoutSystem;
  readonly economy: EconomySystem;
  readonly loyalty: LoyaltySystem;
}

/**
 * The market (PLAN.md §5.1, §16 phase 2.0c).
 *
 * Owns households — pantry, shopping list, segment, and catchment position — plus,
 * once `deps` is supplied, the daily trip scheduler and the store-choice logit. A
 * household whose list crosses `tripListThreshold` evaluates the logit across the
 * player's store and every rival; a player-store draw spawns a real `ShoppersSystem`
 * agent, a rival draw resolves at reduced fidelity (§5.8) with no agent at all.
 *
 * `deps: null` is what Task 2's original household-only tests construct — scheduling is
 * additive, not a replacement.
 */
export class MarketSystem implements System {
  readonly name = 'market';
  readonly #catalog: readonly GoodDef[];
  readonly #segments: SegmentConfig;
  readonly #rivalsView: RivalsView | null;
  readonly #catchmentConfig: CatchmentConfig;
  readonly #config: MarketConfig;
  readonly #deps: MarketDeps | null;
  readonly #households = new Map<number, Household>();
  readonly #tripInFlight = new Set<number>();
  /** Derived read-model for KPIs/tests — not hashed, recomputed from hashed inputs on every schedule. */
  readonly #probabilities = new Map<number, readonly number[]>();
  #pending: TripOutcome[] = [];
  #nextShopperId = 1;

  constructor(
    deps: MarketDeps | null = null,
    catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG,
    segments: SegmentConfig = DEFAULT_SEGMENT_CONFIG,
    rivalsView: RivalsView | null = null,
    catchment: CatchmentConfig = DEFAULT_CATCHMENT_CONFIG,
    config: MarketConfig = DEFAULT_MARKET_CONFIG,
  ) {
    this.#deps = deps;
    this.#catalog = catalog;
    this.#segments = segments;
    this.#rivalsView = rivalsView;
    this.#catchmentConfig = catchment;
    this.#config = config;
  }

  update(world: World): void {
    this.#pending = [];
    if (world.tick % TICKS_PER_SIM_DAY !== 0) return;
    for (const id of this.householdIds()) {
      this.#households.set(id, advancePantryDay(this.#households.get(id)!, this.#catalog, this.#segments));
    }
    if (this.#deps) this.#scheduleTrips(world);
  }

  hash(_world: World, hasher: Hasher): void {
    const ids = this.householdIds();
    hasher.u32(ids.length);
    for (const id of ids) {
      const household = this.#households.get(id)!;
      hasher.u32(id).str(household.segment).i32(household.position.x).i32(household.position.y);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
      hasher.u32(household.list.length);
      for (const goodId of household.list) hasher.str(goodId);
    }

    hasher.u32(this.#nextShopperId);
    const inFlight = [...this.#tripInFlight].sort((a, b) => a - b);
    hasher.u32(inFlight.length);
    for (const id of inFlight) hasher.u32(id);
    hasher.u32(this.#pending.length);
    for (const outcome of this.#pending) {
      hasher.u32(outcome.householdId).u32(outcome.storeIndex).f64(outcome.satisfaction);
    }
  }

  applyCommand(_world: World, command: Command): boolean {
    if (command.type !== 'addHousehold') return false;
    this.#households.set(command.householdId, {
      id: command.householdId,
      segment: command.segment,
      position: command.position,
      pantry: {},
      list: deriveShoppingList({}, this.#catalog),
    });
    return true;
  }

  household(id: number): Household {
    const household = this.#households.get(id);
    if (!household) throw new Error(`Unknown household id: ${id}`);
    return household;
  }

  hasHousehold(id: number): boolean {
    return this.#households.has(id);
  }

  /**
   * A completed sale refills the pantry for everything in the cart and recomputes the
   * list. Called by `ShoppersSystem`, which used to do this inline when it owned the
   * household map; a no-op for an unknown id, exactly as the old `if (household)` guard
   * was.
   */
  replenishPantry(householdId: number, goodIds: readonly string[]): void {
    const household = this.#households.get(householdId);
    if (!household) return;
    const pantry = { ...household.pantry };
    for (const goodId of goodIds) pantry[goodId] = 1;
    const list = deriveShoppingList(pantry, this.#catalog);
    this.#households.set(householdId, { ...household, pantry, list });
  }

  /** Ascending — never Map insertion order, since this drives hashing and RNG draws. */
  householdIds(): readonly number[] {
    return [...this.#households.keys()].sort((a, b) => a - b);
  }

  /**
   * The tick's completed trips. Populated by `#resolveRivalTrip` and by
   * `ShoppersSystem` as player trips finish; read by `LoyaltySystem` and
   * `ReputationSystem`, both registered after both writers.
   *
   * Cleared at the top of this system's own `update`, so it is still populated when the
   * world hashes at end of tick — which is why `hash` folds it in. Having the
   * last-registered system clear it instead would make correctness depend on
   * registration order in a way nothing else in this codebase does.
   */
  pendingOutcomes(): readonly TripOutcome[] {
    return this.#pending;
  }

  recordTripOutcome(outcome: TripOutcome): void {
    this.#pending.push(outcome);
    this.#tripInFlight.delete(outcome.householdId);
  }

  householdPosition(householdId: number): Position {
    return this.household(householdId).position;
  }

  choiceProbabilities(householdId: number): readonly number[] {
    return this.#probabilities.get(householdId) ?? [];
  }

  storeIndexOf(storeId: string): number {
    if (storeId === PLAYER_STORE_ID) return 0;
    const stores = this.#rivalsView?.stores() ?? [];
    const index = stores.findIndex((r) => r.id === storeId);
    if (index < 0) throw new Error(`Unknown store id: ${storeId}`);
    return index + 1;
  }

  #scheduleTrips(world: World): void {
    const deps = this.#deps!;
    for (const id of this.householdIds()) {
      const household = this.household(id);
      if (household.list.length < this.#config.tripListThreshold) continue;
      if (this.#tripInFlight.has(id)) continue;

      const weights = this.#segments.get(household.segment)!.weights;
      const terms = this.#termsFor(world, household, deps);
      const probabilities = softmax(
        terms.map((t) => storeUtility(t, weights)),
        weights.temperature,
      );
      this.#probabilities.set(id, probabilities);
      // One draw per scheduled trip, in ascending household id. `rivalNoise` has been
      // reserved in STREAM_NAMES since phase 1.3 and is unused until now.
      const chosen = chooseStore(probabilities, world.rng.get('rivalNoise').nextFloat());

      if (chosen === 0) {
        this.#tripInFlight.add(id);
        world.commands.push({ type: 'spawnShopper', shopperId: this.#nextShopperId++, householdId: id });
      } else {
        this.#resolveRivalTrip(world, id, chosen);
      }
    }
  }

  #termsFor(world: World, household: Household, deps: MarketDeps): StoreTerms[] {
    const affinity = this.#segments.get(household.segment)!.brandAffinity;
    const player = playerStoreTerms({
      list: household.list,
      catalog: this.#catalog,
      tick: world.tick,
      priceOf: (goodId, tick) => deps.economy.priceOf(goodId, tick),
      referencePriceOf: (goodId) => deps.economy.referencePriceOf(goodId),
      stockOf: (goodId) => deps.inventory.stockOf(goodId),
      freshnessOf: (goodId, tick) => deps.inventory.freshnessOf(goodId, tick),
      serviceScore: () => deps.checkout.serviceScore(),
      loyalty: deps.loyalty.get(household.id, 0),
      brandAffinity: affinity[PLAYER_STORE_ID] ?? 0,
      travelCost: travelCost(household.position, this.#catchmentConfig.playerStorePosition, this.#catchmentConfig),
      config: this.#config,
    });
    if (!this.#rivalsView) return [player];
    const rivalsView = this.#rivalsView;
    const rivals = rivalsView.stores().map((_store, i) => {
      const rival = rivalsView.effectiveStore(i, household.segment);
      return rivalStoreTerms(rival, {
        loyalty: deps.loyalty.get(household.id, i + 1),
        brandAffinity: affinity[rival.identity] ?? 0,
        travelCost: travelCost(household.position, rival.position, this.#catchmentConfig),
        config: this.#config,
      });
    });
    return [player, ...rivals];
  }

  /**
   * §5.8's "rivals run the same sim at reduced fidelity", demand side only: no agent, no
   * pathing, no queue, no spoilage. A weighted read of the rival's authored terms.
   */
  #resolveRivalTrip(world: World, householdId: number, storeIndex: number): void {
    const household = this.household(householdId);
    const rival = this.#rivalsView!.effectiveStore(storeIndex - 1, household.segment);
    const w = this.#config.rivalSatisfactionWeights;
    const satisfaction = Math.min(
      1,
      Math.max(
        0,
        w.quality * rival.quality +
          w.service * rival.service +
          w.ambiance * rival.ambiance +
          w.assortment * rival.assortmentBreadth +
          w.price * indexToFit(rival.priceIndex, this.#config.priceFitNeutral),
      ),
    );
    this.recordTripOutcome({ householdId, storeIndex, satisfaction });
    world.events.emit({
      type: 'rivalTripCompleted',
      householdId,
      storeId: rival.id,
      storeIndex,
      satisfaction,
    });
  }
}
