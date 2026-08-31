import {
  CheckoutSystem,
  DEFAULT_CATALOG,
  DEFAULT_RIVAL_STORES,
  EconomySystem,
  GridSystem,
  InventorySystem,
  LoyaltySystem,
  MarketSystem,
  PathingSystem,
  ReputationSystem,
  ShoppersSystem,
  World,
} from '../sim/index.js';
import type {
  Command,
  FixtureDef,
  GridDimensions,
  MarketReader,
  Placement,
  Position,
  Rotation,
  Segment,
  ShopperState,
  SimEvent,
} from '../sim/index.js';

export interface BuildModeSnapshot {
  readonly dimensions: GridDimensions;
  readonly catalog: readonly FixtureDef[];
  readonly placements: readonly Placement[];
}

/**
 * One shopper as the renderer sees them: where they are, what they are doing, and the
 * running counters the gentle surface diffs to decide which tell fires this tick.
 *
 * Deliberately a flat structural type rather than a re-export of the sim's `Shopper`. The
 * view gets exactly the fields it needs and cannot reach the rest — no `remainingList`
 * contents, no `checkoutLaneId`, nothing it could accidentally start treating as state.
 */
export interface ShopperSnapshot {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly state: ShopperState;
  readonly segment: Segment;
  /** How many list items are still unfulfilled. Shrinks on a sale, a spoil, or a miss. */
  readonly listRemaining: number;
  readonly cartSize: number;
  readonly spoiledEncounters: number;
  readonly priceSurpriseSum: number;
  readonly impulseHits: number;
  readonly balked: boolean;
  readonly abandoned: boolean;
  readonly checkoutJoinedAtTick: number | null;
}

/**
 * The only thing in the codebase that turns build-mode UI actions into World commands.
 * `src/view` and `src/ui` see only this class — never `World` or `GridSystem` directly.
 */
export class BuildModeBridge {
  readonly #world: World;
  readonly #grid: GridSystem;
  readonly #pathing: PathingSystem;
  readonly #inventory: InventorySystem;
  readonly #checkout: CheckoutSystem;
  readonly #economy: EconomySystem;
  readonly #market: MarketSystem;
  readonly #shoppers: ShoppersSystem;
  readonly #loyalty: LoyaltySystem;
  readonly #reputation: ReputationSystem;

  constructor(dimensions: GridDimensions, seed = 1) {
    this.#world = new World({ seed });
    this.#grid = new GridSystem(dimensions);
    this.#world.register(this.#grid);
    this.#pathing = new PathingSystem(this.#grid.grid);
    this.#world.register(this.#pathing);
    this.#inventory = new InventorySystem();
    this.#world.register(this.#inventory);
    this.#checkout = new CheckoutSystem(this.#grid.grid, this.#pathing);
    this.#world.register(this.#checkout);
    this.#economy = new EconomySystem(this.#checkout, this.#inventory);
    this.#world.register(this.#economy);
    // `LoyaltySystem` needs a `MarketReader` before `MarketSystem` exists. Safe because
    // this closure is only invoked during `update`, long after both constructors have
    // run — it reads `this.#market` through the class field, not a captured value.
    this.#loyalty = new LoyaltySystem(this.#marketReader(), DEFAULT_RIVAL_STORES);
    this.#market = new MarketSystem({
      inventory: this.#inventory,
      checkout: this.#checkout,
      economy: this.#economy,
      loyalty: this.#loyalty,
    });
    this.#world.register(this.#market);
    this.#shoppers = new ShoppersSystem(
      this.#market,
      this.#grid.grid,
      this.#pathing,
      this.#inventory,
      this.#checkout,
      this.#economy,
    );
    this.#world.register(this.#shoppers);
    this.#world.register(this.#loyalty);
    this.#reputation = new ReputationSystem(this.#market, this.#loyalty);
    this.#world.register(this.#reputation);
  }

  #marketReader(): MarketReader {
    return {
      householdIds: () => this.#market.householdIds(),
      pendingOutcomes: () => this.#market.pendingOutcomes(),
    };
  }

  place(fixtureId: string, x: number, y: number, rotation: Rotation): void {
    this.#step({ type: 'placeFixture', fixtureId, x, y, rotation });
  }

  rotate(instanceId: number, rotation: Rotation): void {
    this.#step({ type: 'rotateFixture', instanceId, rotation });
  }

  remove(instanceId: number): void {
    this.#step({ type: 'removeFixture', instanceId });
  }

  undo(): boolean {
    const hadUndo = this.#grid.grid.hasUndo();
    this.#step({ type: 'undoBuild' });
    return hadUndo;
  }

  redo(): boolean {
    const hadRedo = this.#grid.grid.hasRedo();
    this.#step({ type: 'redoBuild' });
    return hadRedo;
  }

  hasUndo(): boolean {
    return this.#grid.grid.hasUndo();
  }

  hasRedo(): boolean {
    return this.#grid.grid.hasRedo();
  }

  registerDestination(id: string, cells: readonly { x: number; y: number }[]): void {
    this.#step({ type: 'registerPathingDestination', destinationId: id, cells });
  }

  unregisterDestination(id: string): void {
    this.#step({ type: 'unregisterPathingDestination', destinationId: id });
  }

  /** Every walkable cell's direction toward `destinationId`, for the debug overlay only. */
  flowFieldDebug(destinationId: string): readonly { x: number; y: number; dx: number; dy: number }[] {
    const { width, height } = this.#grid.grid.dimensions;
    const out: { x: number; y: number; dx: number; dy: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!this.#grid.grid.isWalkable(x, y)) continue;
        const dir = this.#pathing.directionAt(destinationId, x, y);
        out.push({ x, y, dx: dir.x, dy: dir.y });
      }
    }
    return out;
  }

  addHousehold(householdId: number, segment: Segment, position: Position): void {
    this.#step({ type: 'addHousehold', householdId, segment, position });
  }

  stockFixture(instanceId: number, goodId: string): void {
    this.#step({ type: 'stockFixture', instanceId, goodId });
  }

  spawnShopper(shopperId: number, householdId: number): void {
    this.#step({ type: 'spawnShopper', shopperId, householdId });
  }

  /**
   * Every active shopper's position, FSM state, household segment, and the counters the
   * gentle surface reads — for rendering only.
   *
   * `segment` is here so the renderer can palette-swap a shopper to their segment — the
   * cheapest way to make seven kinds of customer visually distinct (ADR 0006).
   *
   * The counters after it exist for `src/view/gentle-surface-draw-plan.ts`, which decides
   * which tell fires by diffing this snapshot against the previous tick's. They are a
   * read-only projection of state `ShoppersSystem` already owns and already hashes, so
   * they add nothing to the world hash and nothing to the sim — the one kind of append
   * ADR 0007 permits Track B to make.
   */
  shoppersSnapshot(): readonly ShopperSnapshot[] {
    return this.#shoppers.activeShopperIds().map((id) => {
      const shopper = this.#shoppers.shopper(id);
      return {
        id: shopper.id,
        x: shopper.position.x,
        y: shopper.position.y,
        state: shopper.state,
        segment: this.#market.household(shopper.householdId).segment,
        listRemaining: shopper.remainingList.length,
        cartSize: shopper.cart.length,
        spoiledEncounters: shopper.spoiledEncounters,
        priceSurpriseSum: shopper.priceSurpriseSum,
        impulseHits: shopper.impulseHits,
        balked: shopper.balked,
        abandoned: shopper.abandoned,
        checkoutJoinedAtTick: shopper.checkoutJoinedAtTick,
      };
    });
  }

  /**
   * Everything the simulation emitted since the last call, in emission order.
   *
   * Draining is destructive by design (`src/sim/core/events.ts`: events are never buffered
   * across ticks), so there is exactly one consumer — `BuildScene#redraw`. Anything else
   * that wants events must be fed by that consumer rather than draining behind its back.
   */
  drainEvents(): readonly SimEvent[] {
    return this.#world.events.drain();
  }

  /**
   * The most recently completed tick. The view needs it to age its own timers — how long
   * a bubble has been up, how long a shopper has been queueing — against sim time rather
   * than against wall-clock frames, which would drift the moment the tab is backgrounded.
   */
  currentTick(): number {
    return this.#world.tick;
  }

  /** Advances the world one tick with no command — build mode is otherwise action-driven,
   *  but shoppers/pantries need real time to pass even absent any UI interaction. */
  tick(): void {
    this.#world.step();
  }

  snapshot(): BuildModeSnapshot {
    return {
      dimensions: this.#grid.grid.dimensions,
      catalog: DEFAULT_CATALOG,
      placements: this.#grid.grid.placements(),
    };
  }

  #step(command: Command): void {
    this.#world.commands.push(command);
    this.#world.step();
  }
}
