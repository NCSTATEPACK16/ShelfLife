import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { BuildGrid } from '../grid/grid.js';
import { DEFAULT_PATHING_CONFIG } from '../pathing/config.js';
import { computeSteering } from '../pathing/steering.js';
import type { PathingSystem } from '../pathing/system.js';
import type { Vec2 } from '../pathing/types.js';
import { DEFAULT_SHOPPERS_CONFIG } from './config.js';
import { advancePantryDay, deriveShoppingList } from './household.js';
import type { Household, Shopper, ShopperState } from './types.js';

const EXIT_DESTINATION_ID = 'exit';
const REGISTER_DESTINATION_ID = 'register';
const REGISTER_FIXTURE_ID = 'register';
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
 * Scope cuts recorded in docs/superpowers/plans/2026-08-01-shoppers.md: no queueing,
 * spoilage, staff, or finance ledger — those are 1.7/1.8/1.9. Satisfaction only sums
 * `fillRate` and `discovery`; the other §5.3 terms are wired as 0 until their systems
 * exist.
 */
export class ShoppersSystem implements System {
  readonly name = 'shoppers';
  readonly #grid: BuildGrid;
  readonly #pathing: PathingSystem;
  readonly #catalog: readonly GoodDef[];
  readonly #catalogById: ReadonlyMap<string, GoodDef>;
  readonly #households = new Map<number, Household>();
  readonly #stocking = new Map<number, string>();
  readonly #shoppers = new Map<number, Shopper>();
  #exitRegistered = false;
  #lastSeenGridVersion = -1;

  constructor(grid: BuildGrid, pathing: PathingSystem, catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG) {
    this.#grid = grid;
    this.#pathing = pathing;
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

    if (this.#grid.version !== this.#lastSeenGridVersion) {
      this.#lastSeenGridVersion = this.#grid.version;
      this.#refreshRegisterDestination(world);
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
        .u32(shopper.impulseHits);
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
          requested: household.list.length,
          impulseHits: 0,
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

  #refreshRegisterDestination(world: World): void {
    const cells = this.#grid
      .placements()
      .filter((p) => p.fixtureId === REGISTER_FIXTURE_ID)
      .flatMap((p) => this.#grid.footprintCells(p.fixtureId, p.x, p.y, p.rotation));
    this.#pathing.applyCommand(world, {
      type: 'registerPathingDestination',
      destinationId: REGISTER_DESTINATION_ID,
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

    const cart = [...moved.cart, goodId];
    const remainingList = moved.remainingList.slice(1);
    const impulseHits = moved.impulseHits + this.#rollImpulse(world, moved, goodId);
    const state: ShopperState = remainingList.length === 0 ? 'checkingOut' : 'shopping';
    return { ...moved, cart, remainingList, impulseHits, state };
  }

  #stepCheckingOut(world: World, shopper: Shopper): Shopper {
    if (!this.#pathing.destinationIds().includes(REGISTER_DESTINATION_ID)) return shopper; // no register yet

    const moved = this.#moveToward(shopper, REGISTER_DESTINATION_ID);
    const cellX = Math.floor(moved.position.x);
    const cellY = Math.floor(moved.position.y);
    const distance = this.#pathing.distanceAt(REGISTER_DESTINATION_ID, cellX, cellY);
    if (distance < 0 || distance > DEFAULT_SHOPPERS_CONFIG.adjacentCellThreshold) return moved;

    const total = moved.cart.reduce((sum, goodId) => sum + (this.#catalogById.get(goodId)?.unitPrice ?? 0), 0);
    world.events.emit({
      type: 'saleCompleted',
      shopperId: moved.id,
      householdId: moved.householdId,
      total,
      items: moved.cart,
    });

    const household = this.#households.get(moved.householdId);
    if (household) {
      const pantry = { ...household.pantry };
      for (const goodId of moved.cart) pantry[goodId] = 1;
      const list = deriveShoppingList(pantry, this.#catalog);
      this.#households.set(moved.householdId, { ...household, pantry, list });
    }

    return { ...moved, state: 'leaving' };
  }

  #stepLeaving(world: World, shopper: Shopper): Shopper | null {
    const moved = this.#moveToward(shopper, EXIT_DESTINATION_ID);
    const cellX = Math.floor(moved.position.x);
    const cellY = Math.floor(moved.position.y);
    const distance = this.#pathing.distanceAt(EXIT_DESTINATION_ID, cellX, cellY);
    if (distance < 0 || distance > DEFAULT_PATHING_CONFIG.arrivalRadius) return moved;

    const fillRate = moved.requested === 0 ? 1 : moved.cart.length / moved.requested;
    const discovery = moved.impulseHits > 0 ? 1 : 0;
    const satisfaction = Math.min(
      1,
      Math.max(
        0,
        DEFAULT_SHOPPERS_CONFIG.fillRateWeight * fillRate + DEFAULT_SHOPPERS_CONFIG.discoveryWeight * discovery,
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
