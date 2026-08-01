import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_CATALOG } from './catalog.js';
import { BuildGrid } from './grid.js';
import type { GridDimensions } from './types.js';

/** Grid/build-mode system (PLAN.md §16 phase 1.4). Command-driven; nothing to do per tick. */
export class GridSystem implements System {
  readonly name = 'grid';
  readonly grid: BuildGrid;

  constructor(dimensions: GridDimensions) {
    this.grid = new BuildGrid(dimensions, DEFAULT_CATALOG);
  }

  update(_world: World): void {
    // Placement is command-driven, not per-tick; nothing to advance yet.
  }

  hash(_world: World, hasher: Hasher): void {
    const placements = this.grid.placements();
    hasher.u32(placements.length);
    for (const p of placements) {
      hasher.u32(p.instanceId).str(p.fixtureId).u32(p.x).u32(p.y).u32(p.rotation);
    }
  }

  applyCommand(_world: World, command: Command): boolean {
    switch (command.type) {
      case 'placeFixture':
        this.grid.place(command.fixtureId, command.x, command.y, command.rotation);
        return true;
      case 'rotateFixture':
        this.grid.rotate(command.instanceId, command.rotation);
        return true;
      case 'removeFixture':
        this.grid.remove(command.instanceId);
        return true;
      case 'undoBuild':
        this.grid.undo();
        return true;
      case 'redoBuild':
        this.grid.redo();
        return true;
      default:
        return false;
    }
  }
}
