import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_STAFFING_CONFIG } from '../checkout/config.js';
import type { CheckoutSystem } from '../checkout/system.js';
import { DEFAULT_ECONOMY_CONFIG } from '../economy/config.js';
import type { EconomySystem } from '../economy/system.js';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { BuildGrid } from '../grid/grid.js';
import type { MarketSystem } from '../market/system.js';
import type { Household } from '../market/types.js';
import { DEFAULT_INVENTORY_CONFIG } from '../inventory/config.js';
import type { InventorySystem } from '../inventory/system.js';
import { DEFAULT_PATHING_CONFIG } from '../pathing/config.js';
import { computeSteering } from '../pathing/steering.js';
import type { PathingSystem } from '../pathing/system.js';
import type { Vec2 } from '../pathing/types.js';
import { DEFAULT_SHOPPERS_CONFIG } from './config.js';
import type { Shopper, ShopperState } from './types.js';
import { DEFAULT_GENTLE_SURFACE_CONTENT, thresholdFor } from '../../content/gentle-surface.js';

const EXIT_DESTINATION_ID = 'exit';
const ENTRANCE_POSITION: Vec2 = { x: 0.5, y: 0.5 };

function goodDestinationId(goodId: string): string {
  return `good:${goodId}`;
}

/**
 * Shopper agent system (PLAN.md §16 phase 1.6). Owns active shopper trips (FSM: entering
 * -> shopping -> checkingOut -> leaving -> [removed]), driving them with
 * `PathingSystem`/`computeSteering` — the API both were designed against without a caller
 * since phase 1.5. Households moved to `MarketSystem` in phase 2.0c.
 *

 * Satisfaction sums `fillRate`, `discovery`, `spoiledEncounters` (1.7's `InventorySystem`),
 * and — since phase 1.8's `CheckoutSystem` — `queuePenalty`, plus a self-checkout service
 * penalty. `staffInteraction`/`cleanliness` aren't consumed as satisfaction terms yet
 * (cleanliness exists as a `CheckoutSystem` value, just not read here). No finance ledger
 * yet — see docs/superpowers/plans/2026-08-01-{shoppers,inventory,checkout-staff}.md for
 * the recorded scope cuts.
 */
export class ShoppersSystem implements System {
  readonly name = 'shoppers';
  readonly #market: MarketSystem;
  readonly #grid: BuildGrid;
  readonly #pathing: PathingSystem;
  readonly #inventory: InventorySystem;
  readonly #checkout: CheckoutSystem;
  readonly #economy: EconomySystem;
  readonly #catalogById: ReadonlyMap<string, GoodDef>;
  readonly #stocking = new Map<number, string>();
  readonly #shoppers = new Map<number, Shopper>();
  #exitRegistered = false;

  constructor(
    market: MarketSystem,
    grid: BuildGrid,
    pathing: PathingSystem,
    inventory: InventorySystem,
    checkout: CheckoutSystem,
    economy: EconomySystem,
    catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG,
  ) {
    this.#market = market;
    this.#grid = grid;
    this.#pathing = pathing;
    this.#inventory = inventory;
    this.#checkout = checkout;
    this.#economy = economy;
    this.#catalogById = new Map(catalog.map((g) => [g.id, g]));
  }

  update(world: World): void {
    if (!this.#exitRegistered) {
      this.#exitRegistered = true;
      this.#pathing.applyCommand(world, {
        type: 'registerPathingDestination',
        destinationId: EXIT_DESTINATION_ID,
        cells: [{ x: this.#grid.dimensions.width - 1, y: this.#grid.dimensions.height - 1 }],
      });
    }

    for (const [id, shopper] of this.#shoppers) {
      const next = this.#stepShopper(world, shopper);
      if (next) this.#shoppers.set(id, next);
      else this.#shoppers.delete(id);
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const stockedInstanceIds = [...this.#stocking.keys()].sort((a, b) => a - b);
    hasher.u32(stockedInstanceIds.length);
    for (const instanceId of stockedInstanceIds) {
      hasher.u32(instanceId).str(this.#stocking.get(instanceId)!);
    }

    const shopperIds = [...this.#shoppers.keys()].sort((a, b) => a - b);
    hasher.u32(shopperIds.length);
    for (const id of shopperIds) {
      const shopper = this.#shoppers.get(id)!;
      hasher
        .u32(id)
        .u32(shopper.householdId)
        .f64(shopper.position.x)
        .f64(shopper.position.y)
        .str(shopper.state)
        .u32(shopper.requested)
        .u32(shopper.impulseHits)
        .u32(shopper.spoiledEncounters)
        .f64(shopper.cartTotal)
        .u32(shopper.checkoutLaneId ?? 0)
        .bool(shopper.checkoutJoined)
        .u32(shopper.checkoutJoinedAtTick ?? 0)
        .u32(shopper.checkoutWaitTicks)
        .bool(shopper.usedSelfCheckout)
        .bool(shopper.balked)
        .bool(shopper.abandoned)
        .f64(shopper.priceSurpriseSum)
        .bool(shopper.staffInteractionGood ?? false)
        .bool(shopper.staffInteractionGood !== null) // distinguishes null from false
        .bool(shopper.queuePenaltyRisingFired);
      hasher.u32(shopper.remainingList.length);
      for (const goodId of shopper.remainingList) hasher.str(goodId);
      hasher.u32(shopper.cart.length);
      for (const goodId of shopper.cart) hasher.str(goodId);
    }
  }

  applyCommand(world: World, command: Command): boolean {
    switch (command.type) {
      case 'stockFixture':
        this.#stocking.set(command.instanceId, command.goodId);
        this.#refreshGoodDestination(world, command.goodId);
        return true;
      case 'spawnShopper': {
        if (!this.#market.hasHousehold(command.householdId)) {
          throw new Error(`Unknown household id: ${command.householdId}`);
        }
        const household = this.#market.household(command.householdId);
        this.#shoppers.set(command.shopperId, {
          id: command.shopperId,
          householdId: command.householdId,
          position: ENTRANCE_POSITION,
          state: 'entering',
          remainingList: household.list,
          cart: [],
          cartTotal: 0,
          requested: household.list.length,
          impulseHits: 0,
          spoiledEncounters: 0,
          checkoutLaneId: null,
          checkoutJoined: false,
          checkoutJoinedAtTick: null,
          checkoutWaitTicks: 0,
          usedSelfCheckout: false,
          balked: false,
          abandoned: false,
          priceSurpriseSum: 0,
          staffInteractionGood: null,
          queuePenaltyRisingFired: false,
        });
        return true;
      }
      default:
        return false;
    }
  }

  /** Delegates to `MarketSystem`, which has owned households since phase 2.0c. */
  household(id: number): Household {
    return this.#market.household(id);
  }

  shopper(id: number): Shopper {
    const shopper = this.#shoppers.get(id);
    if (!shopper) throw new Error(`Unknown shopper id: ${id}`);
    return shopper;
  }

  activeShopperIds(): readonly number[] {
    return [...this.#shoppers.keys()].sort((a, b) => a - b);
  }

  /** The good stocked at a fixture instance, or null if unstocked. Render-only accessor —
   *  feeds the visibility world-mark tell (shelf full/half/empty). */
  stockedGoodAt(instanceId: number): string | null {
    return this.#stocking.get(instanceId) ?? null;
  }

  #refreshGoodDestination(world: World, goodId: string): void {
    const cells = this.#grid
      .placements()
      .filter((p) => this.#stocking.get(p.instanceId) === goodId)
      .flatMap((p) => this.#grid.footprintCells(p.fixtureId, p.x, p.y, p.rotation));
    this.#pathing.applyCommand(world, {
      type: 'registerPathingDestination',
      destinationId: goodDestinationId(goodId),
      cells,
    });
  }

  /** Returns the shopper's next state, or `null` if the trip is complete (remove it). */
  #stepShopper(world: World, shopper: Shopper): Shopper | null {
    if (shopper.state === 'entering') {
      const state: ShopperState = shopper.remainingList.length > 0 ? 'shopping' : 'checkingOut';
      return { ...shopper, state };
    }
    if (shopper.state === 'shopping') return this.#stepShopping(world, shopper);
    if (shopper.state === 'checkingOut') return this.#stepCheckingOut(world, shopper);
    if (shopper.state === 'leaving') return this.#stepLeaving(world, shopper);
    return null; // 'done' — should not persist, but tolerate it defensively.
  }

  #stepShopping(world: World, shopper: Shopper): Shopper {
    const goodId = shopper.remainingList[0]!;
    const destId = goodDestinationId(goodId);
    if (!this.#pathing.destinationIds().includes(destId)) {
      // Nothing stocks this good — skip it rather than route forever toward nothing.
      const remainingList = shopper.remainingList.slice(1);
      if (remainingList.length === 0) return { ...shopper, remainingList, state: 'checkingOut' };
      return { ...shopper, remainingList };
    }

    const moved = this.#moveToward(shopper, destId);
    const cellX = Math.floor(moved.position.x);
    const cellY = Math.floor(moved.position.y);
    const distance = this.#pathing.distanceAt(destId, cellX, cellY);
    if (distance < 0 || distance > DEFAULT_SHOPPERS_CONFIG.adjacentCellThreshold) return moved;

    const result = this.#inventory.consume(goodId, world.tick);
    const remainingList = moved.remainingList.slice(1);
    const state: ShopperState = remainingList.length === 0 ? 'checkingOut' : 'shopping';
    const shelfInstanceId = [...this.#stocking.entries()].find(([, g]) => g === goodId)?.[0];

    if (result === 'spoiled') {
      // §5.3's spoiledEncounters: the shopper recoils and puts it back — no sale, no
      // impulse roll, and this list item stays unfulfilled (a fillRate miss too).
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'spoiledEncounters',
        magnitude: 1,
        ...(shelfInstanceId !== undefined ? { worldRef: { instanceId: shelfInstanceId } } : {}),
      });
      return { ...moved, remainingList, spoiledEncounters: moved.spoiledEncounters + 1, state };
    }
    if (result === 'outOfStock') {
      // Nothing on the shelf — move on, unfulfilled. This is §5.3's single most
      // important tell (fillRateMiss), already carried by fillRate itself.
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'fillRateMiss',
        magnitude: 1,
        ...(shelfInstanceId !== undefined ? { worldRef: { instanceId: shelfInstanceId } } : {}),
      });
      return { ...moved, remainingList, state };
    }

    const price = this.#economy.priceOf(goodId, world.tick);
    const paid = result === 'markdown' ? price * (1 - DEFAULT_INVENTORY_CONFIG.markdownDiscount) : price;
    // §5.3's priceSurprise: positive when a shopper pays less than the catalog reference
    // price, negative when more — the "put it back" tell is a view concern (see the
    // phase plan's scope cuts), the sim just carries the number into satisfaction.
    const reference = this.#economy.referencePriceOf(goodId);
    const priceSurprise = reference > 0 ? (reference - paid) / reference : 0;
    if (priceSurprise <= -thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'priceSurpriseNegative')) {
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'priceSurpriseNegative',
        magnitude: Math.min(1, -priceSurprise),
      });
    } else if (priceSurprise >= thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'priceSurprisePositive')) {
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'priceSurprisePositive',
        magnitude: Math.min(1, priceSurprise),
      });
    }
    const cart = [...moved.cart, goodId];
    const cartTotal = moved.cartTotal + paid;
    const priceSurpriseSum = moved.priceSurpriseSum + priceSurprise;
    const impulseHits = moved.impulseHits + this.#rollImpulse(world, moved, goodId);
    return { ...moved, cart, cartTotal, priceSurpriseSum, remainingList, impulseHits, state };
  }

  #stepCheckingOut(world: World, shopper: Shopper): Shopper {
    if (shopper.checkoutLaneId === null) {
      const laneId = this.#checkout.shortestOpenLane();
      if (laneId === null) {
        // No open lane at all — the understaffing story: nothing to queue for, so the
        // trip ends here rather than waiting forever for a lane that will never open.
        return { ...shopper, state: 'leaving', balked: true };
      }
      this.#checkout.reserveLane(laneId);
      return { ...shopper, checkoutLaneId: laneId, usedSelfCheckout: this.#checkout.isSelfCheckout(laneId) };
    }

    const laneId = shopper.checkoutLaneId;
    const destId = this.#checkout.laneDestinationId(laneId);

    if (!shopper.checkoutJoined) {
      const moved = this.#moveToward(shopper, destId);
      const cellX = Math.floor(moved.position.x);
      const cellY = Math.floor(moved.position.y);
      const distance = this.#pathing.distanceAt(destId, cellX, cellY);
      if (distance < 0 || distance > DEFAULT_SHOPPERS_CONFIG.adjacentCellThreshold) return moved;
      this.#checkout.joinQueue(moved.id, laneId, moved.cart.length, world.tick);
      return { ...moved, checkoutJoined: true, checkoutJoinedAtTick: world.tick };
    }

    const outcome = this.#checkout.statusOf(shopper.id);
    if (outcome === 'waiting' || outcome === 'beingServed' || outcome === 'notInQueue') return shopper;

    const waitTicks = shopper.checkoutJoinedAtTick !== null ? world.tick - shopper.checkoutJoinedAtTick : 0;

    if (outcome === 'sold') {
      const cogs = shopper.cart.reduce((sum, goodId) => sum + (this.#catalogById.get(goodId)?.cost ?? 0), 0);
      this.#economy.recordSale(shopper.cartTotal, cogs, world.tick);
      world.events.emit({
        type: 'saleCompleted',
        shopperId: shopper.id,
        householdId: shopper.householdId,
        total: shopper.cartTotal,
        items: shopper.cart,
      });
      this.#market.replenishPantry(shopper.householdId, shopper.cart);
      return { ...shopper, state: 'leaving', checkoutWaitTicks: waitTicks };
    }

    if (outcome === 'abandoned') {
      // The cart (already deducted from inventory at pickup) is lost — no sale, no
      // pantry replenishment. A restock-cost mechanic is a documented follow-up, not
      // implemented here.
      world.events.emit({
        type: 'cartAbandoned',
        shopperId: shopper.id,
        householdId: shopper.householdId,
        items: shopper.cart,
      });
      return { ...shopper, state: 'leaving', checkoutWaitTicks: waitTicks, abandoned: true };
    }

    // 'balked'
    return { ...shopper, state: 'leaving', checkoutWaitTicks: waitTicks, balked: true };
  }

  #stepLeaving(world: World, shopper: Shopper): Shopper | null {
    const moved = this.#moveToward(shopper, EXIT_DESTINATION_ID);
    const cellX = Math.floor(moved.position.x);
    const cellY = Math.floor(moved.position.y);
    const distance = this.#pathing.distanceAt(EXIT_DESTINATION_ID, cellX, cellY);
    if (distance < 0 || distance > DEFAULT_PATHING_CONFIG.arrivalRadius) return moved;

    // A shopper who balked or abandoned never completes the sale — everything picked up
    // in-store goes home with nobody, so fillRate craters to 0 rather than crediting a
    // cart they never actually left with.
    const fillRate =
      moved.balked || moved.abandoned ? 0 : moved.requested === 0 ? 1 : moved.cart.length / moved.requested;
    const discovery = moved.impulseHits > 0 ? 1 : 0;
    const spoiled = moved.spoiledEncounters > 0 ? 1 : 0;
    // §5.3's queuePenalty(t) = (t/tolerance)^1.6, superlinear — a long wait hurts far
    // more than proportionally. Saturates at 1 for both balked and abandoned (both waited
    // at least balkToleranceTicks); abandonExtraPenalty is what keeps abandonment scoring
    // strictly worse, matching §5.6's "large satisfaction hit" language for cart loss.
    const queuePenalty = Math.min(1, (moved.checkoutWaitTicks / DEFAULT_STAFFING_CONFIG.balkToleranceTicks) ** 1.6);
    const abandonPenalty = moved.abandoned ? DEFAULT_SHOPPERS_CONFIG.abandonExtraPenalty : 0;
    const selfCheckoutPenalty = moved.usedSelfCheckout ? DEFAULT_STAFFING_CONFIG.selfCheckoutServiceScorePenalty : 0;
    const priceSurprise = moved.cart.length > 0 ? moved.priceSurpriseSum / moved.cart.length : 0;
    const satisfaction = Math.min(
      1,
      Math.max(
        0,
        DEFAULT_SHOPPERS_CONFIG.fillRateWeight * fillRate +
          DEFAULT_SHOPPERS_CONFIG.discoveryWeight * discovery -
          DEFAULT_SHOPPERS_CONFIG.spoiledEncountersWeight * spoiled -
          DEFAULT_SHOPPERS_CONFIG.queuePenaltyWeight * queuePenalty -
          abandonPenalty -
          selfCheckoutPenalty +
          DEFAULT_ECONOMY_CONFIG.priceSurpriseWeight * priceSurprise,
      ),
    );
    world.events.emit({
      type: 'shopperTripCompleted',
      shopperId: moved.id,
      householdId: moved.householdId,
      satisfaction,
      fillRate,
      impulseHits: moved.impulseHits,
      balked: moved.balked,
      abandoned: moved.abandoned,
    });
    // Feeds LoyaltySystem and ReputationSystem, both registered after this system.
    // Store index 0 is the player's store — a shopper who physically walked in is by
    // definition not at a rival.
    this.#market.recordTripOutcome({ householdId: moved.householdId, storeIndex: 0, satisfaction });
    return null;
  }

  #moveToward(shopper: Shopper, destinationId: string): Shopper {
    const cellX = Math.floor(shopper.position.x);
    const cellY = Math.floor(shopper.position.y);
    const direction = this.#pathing.directionAt(destinationId, cellX, cellY);
    const distance = this.#pathing.distanceAt(destinationId, cellX, cellY);
    const velocity = computeSteering(
      { position: shopper.position, neighbors: [] },
      direction,
      distance < 0 ? Number.POSITIVE_INFINITY : distance,
      DEFAULT_PATHING_CONFIG,
    );
    const position: Vec2 = { x: shopper.position.x + velocity.x, y: shopper.position.y + velocity.y };
    // Destinations are frequently non-walkable (a shelf or register — the flow field
    // still seeds distance 0 there so the field points toward it, but nothing stands
    // inside a fixture). Reject a step that would land in a non-walkable cell: the
    // shopper simply stops at the last walkable cell, which is exactly the "adjacent"
    // position `#stepShopping`/`#stepCheckingOut`'s arrival check is looking for.
    if (!this.#grid.isWalkable(Math.floor(position.x), Math.floor(position.y))) return shopper;
    return { ...shopper, position };
  }

  /** Path exposure (PLAN.md §5.4): roll impulse only for goods near where the shopper just walked. */
  #rollImpulse(world: World, shopper: Shopper, justPickedGoodId: string): number {
    let hits = 0;
    for (const [instanceId, goodId] of this.#stocking) {
      if (goodId === justPickedGoodId) continue;
      const placement = this.#grid.placements().find((p) => p.instanceId === instanceId);
      if (!placement) continue;
      const dx = placement.x - shopper.position.x;
      const dy = placement.y - shopper.position.y;
      if (Math.hypot(dx, dy) > DEFAULT_SHOPPERS_CONFIG.exposureRadius) continue;
      const good = this.#catalogById.get(goodId);
      if (!good) continue;
      // Elasticity (phase 1.9): scales §5.4's impulseBase by price relative to the
      // catalog reference — a price below reference lifts the impulse roll, a price
      // above it dampens it. Only affects impulse demand, not required list items (see
      // the phase plan's scope cuts).
      const reference = this.#economy.referencePriceOf(goodId);
      const current = this.#economy.priceOf(goodId, world.tick);
      const elasticityMultiplier =
        reference > 0 && current > 0 ? (reference / current) ** DEFAULT_ECONOMY_CONFIG.elasticityCoefficient : 1;
      const probability = Math.min(1, good.impulseBase * elasticityMultiplier);
      if (world.rng.get('impulse').chance(probability)) hits++;
    }
    return hits;
  }
}
