import { DEFAULT_CATALOG, GridSystem, World } from '../sim/index.js';
import type { Command, FixtureDef, GridDimensions, Placement, Rotation } from '../sim/index.js';

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

  constructor(dimensions: GridDimensions, seed = 1) {
    this.#world = new World({ seed });
    this.#grid = new GridSystem(dimensions);
    this.#world.register(this.#grid);
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
