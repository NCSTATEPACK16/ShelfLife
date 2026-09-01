import {
  CheckoutSystem,
  DEFAULT_CATALOG,
  EconomySystem,
  GridSystem,
  InventorySystem,
  LoyaltySystem,
  MarketSystem,
  PathingSystem,
  ReputationSystem,
  RivalsSystem,
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
} from '../sim/index.js';

export interface BuildModeSnapshot {
  readonly dimensions: GridDimensions;
  readonly catalog: readonly FixtureDef[];
  readonly placements: readonly Placement[];
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
  readonly #rivals: RivalsSystem;
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
    // Same late-binding as `#loyalty` below: `this.#market` isn't assigned yet, but
    // these closures only run during `update`, long after every constructor here has
    // finished.
    this.#rivals = new RivalsSystem({
      outcomes: () => this.#market.pendingOutcomes(),
      playerPriceLevel: () => this.#economy.priceLevel(this.#world.tick),
    });
    this.#world.register(this.#rivals);
    // `LoyaltySystem` needs a `MarketReader` before `MarketSystem` exists. Safe because
    // this closure is only invoked during `update`, long after both constructors have
    // run — it reads `this.#market` through the class field, not a captured value.
    this.#loyalty = new LoyaltySystem(this.#marketReader(), this.#rivals);
    this.#market = new MarketSystem(
      {
        inventory: this.#inventory,
        checkout: this.#checkout,
        economy: this.#economy,
        loyalty: this.#loyalty,
      },
      undefined,
      undefined,
      this.#rivals,
    );
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

  /** Every active shopper's position and FSM state, for rendering only. */
  shoppersSnapshot(): readonly { id: number; x: number; y: number; state: ShopperState }[] {
    return this.#shoppers.activeShopperIds().map((id) => {
      const shopper = this.#shoppers.shopper(id);
      return { id: shopper.id, x: shopper.position.x, y: shopper.position.y, state: shopper.state };
    });
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
