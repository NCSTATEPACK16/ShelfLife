import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_STAFFING_CONFIG } from '../checkout/config.js';
import type { CheckoutSystem } from '../checkout/system.js';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { BuildGrid } from '../grid/grid.js';
import { DEFAULT_INVENTORY_CONFIG } from '../inventory/config.js';
import type { InventorySystem } from '../inventory/system.js';
import { DEFAULT_PATHING_CONFIG } from '../pathing/config.js';
import { computeSteering } from '../pathing/steering.js';
import type { PathingSystem } from '../pathing/system.js';
import type { Vec2 } from '../pathing/types.js';
import { DEFAULT_SHOPPERS_CONFIG } from './config.js';
import { advancePantryDay, deriveShoppingList } from './household.js';
import type { Household, Shopper, ShopperState } from './types.js';

const EXIT_DESTINATION_ID = 'exit';
const ENTRANCE_POSITION: Vec2 = { x: 0.5, y: 0.5 };

function goodDestinationId(goodId: string): string {
  return `good:${goodId}`;
}

/**
 * Shopper agent + household system (PLAN.md §16 phase 1.6). Owns households (pantry,
 * shopping list) and active shopper trips (FSM: entering -> shopping -> checkingOut ->
 * leaving -> [removed]), driving them with `PathingSystem`/`computeSteering` — the API
 * both were designed against without a caller since phase 1.5.
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
  readonly #grid: BuildGrid;
  readonly #pathing: PathingSystem;
  readonly #inventory: InventorySystem;
  readonly #checkout: CheckoutSystem;
  readonly #catalog: readonly GoodDef[];
  readonly #catalogById: ReadonlyMap<string, GoodDef>;
  readonly #households = new Map<number, Household>();
  readonly #stocking = new Map<number, string>();
  readonly #shoppers = new Map<number, Shopper>();
  #exitRegistered = false;

  constructor(
    grid: BuildGrid,
    pathing: PathingSystem,
    inventory: InventorySystem,
    checkout: CheckoutSystem,
    catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG,
  ) {
    this.#grid = grid;
    this.#pathing = pathing;
    this.#inventory = inventory;
    this.#checkout = checkout;
    this.#catalog = catalog;
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

    if (world.tick % TICKS_PER_SIM_DAY === 0) {
      for (const [id, household] of this.#households) {
        this.#households.set(id, advancePantryDay(household, this.#catalog));
      }
    }

    for (const [id, shopper] of this.#shoppers) {
      const next = this.#stepShopper(world, shopper);
      if (next) this.#shoppers.set(id, next);
      else this.#shoppers.delete(id);
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const householdIds = [...this.#households.keys()].sort((a, b) => a - b);
    hasher.u32(householdIds.length);
    for (const id of householdIds) {
      const household = this.#households.get(id)!;
      hasher.u32(id);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
      hasher.u32(household.list.length);
      for (const goodId of household.list) hasher.str(goodId);
    }

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
        .bool(shopper.abandoned);
      hasher.u32(shopper.remainingList.length);
      for (const goodId of shopper.remainingList) hasher.str(goodId);
      hasher.u32(shopper.cart.length);
      for (const goodId of shopper.cart) hasher.str(goodId);
    }
  }

  applyCommand(world: World, command: Command): boolean {
    switch (command.type) {
      case 'addHousehold':
        this.#households.set(command.householdId, {
          id: command.householdId,
          pantry: {},
          list: deriveShoppingList({}, this.#catalog),
        });
        return true;
      case 'stockFixture':
        this.#stocking.set(command.instanceId, command.goodId);
        this.#refreshGoodDestination(world, command.goodId);
        return true;
      case 'spawnShopper': {
        const household = this.#households.get(command.householdId);
        if (!household) throw new Error(`Unknown household id: ${command.householdId}`);
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
        });
        return true;
      }
      default:
        return false;
    }
  }

  household(id: number): Household {
    const household = this.#households.get(id);
    if (!household) throw new Error(`Unknown household id: ${id}`);
    return household;
  }

  shopper(id: number): Shopper {
    const shopper = this.#shoppers.get(id);
    if (!shopper) throw new Error(`Unknown shopper id: ${id}`);
    return shopper;
  }

  activeShopperIds(): readonly number[] {
    return [...this.#shoppers.keys()].sort((a, b) => a - b);
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

    if (result === 'spoiled') {
      // §5.3's spoiledEncounters: the shopper recoils and puts it back — no sale, no
      // impulse roll, and this list item stays unfulfilled (a fillRate miss too).
      return { ...moved, remainingList, spoiledEncounters: moved.spoiledEncounters + 1, state };
    }
    if (result === 'outOfStock') {
      // Nothing on the shelf — move on, unfulfilled. This is §5.3's single most
      // important tell (fillRateMiss), already carried by fillRate itself.
      return { ...moved, remainingList, state };
    }

    const good = this.#catalogById.get(goodId);
    const price = good?.unitPrice ?? 0;
    const paid = result === 'markdown' ? price * (1 - DEFAULT_INVENTORY_CONFIG.markdownDiscount) : price;
    const cart = [...moved.cart, goodId];
    const cartTotal = moved.cartTotal + paid;
    const impulseHits = moved.impulseHits + this.#rollImpulse(world, moved, goodId);
    return { ...moved, cart, cartTotal, remainingList, impulseHits, state };
  }

  #stepCheckingOut(world: World, shopper: Shopper): Shopper {
    if (shopper.checkoutLaneId === null) {
      const laneId = this.#checkout.shortestOpenLane();
      if (laneId === null) {
        // No open lane at all — the understaffing story: nothing to queue for, so the
        // trip ends here rather than waiting forever for a lane that will never open.
        return { ...shopper, state: 'leaving', balked: true };
      }
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
      world.events.emit({
        type: 'saleCompleted',
        shopperId: shopper.id,
        householdId: shopper.householdId,
        total: shopper.cartTotal,
        items: shopper.cart,
      });
      const household = this.#households.get(shopper.householdId);
      if (household) {
        const pantry = { ...household.pantry };
        for (const goodId of shopper.cart) pantry[goodId] = 1;
        const list = deriveShoppingList(pantry, this.#catalog);
        this.#households.set(shopper.householdId, { ...household, pantry, list });
      }
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
    const satisfaction = Math.min(
      1,
      Math.max(
        0,
        DEFAULT_SHOPPERS_CONFIG.fillRateWeight * fillRate +
          DEFAULT_SHOPPERS_CONFIG.discoveryWeight * discovery -
          DEFAULT_SHOPPERS_CONFIG.spoiledEncountersWeight * spoiled -
          DEFAULT_SHOPPERS_CONFIG.queuePenaltyWeight * queuePenalty -
          abandonPenalty -
          selfCheckoutPenalty,
      ),
    );
    world.events.emit({
      type: 'shopperTripCompleted',
      shopperId: moved.id,
      householdId: moved.householdId,
      satisfaction,
      fillRate,
      impulseHits: moved.impulseHits,
    });
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
      if (world.rng.get('impulse').chance(good.impulseBase)) hits++;
    }
    return hits;
  }
}
