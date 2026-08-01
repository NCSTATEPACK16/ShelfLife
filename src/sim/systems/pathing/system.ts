import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { BuildGrid } from '../grid/grid.js';
import { computeFlowField } from './flow-field.js';
import type { Cell, FlowField, Vec2 } from './types.js';

interface Destination {
  readonly id: string;
  readonly cells: readonly Cell[];
  field: FlowField | null;
}

/**
 * Flow-field pathing system (PLAN.md §16 phase 1.5). Owns named destinations and their
 * flow fields. Recomputes at most one dirty destination per tick — a build-mode edit
 * that dirties every destination at once still costs a single flow-field pass per tick,
 * not an all-at-once spike (see the phase plan's "Design notes" for the full rationale).
 */
export class PathingSystem implements System {
  readonly name = 'pathing';
  readonly #grid: BuildGrid;
  readonly #destinations = new Map<string, Destination>();
  readonly #dirtyQueue: string[] = [];
  readonly #dirtySet = new Set<string>();
  #lastSeenGridVersion = -1;

  constructor(grid: BuildGrid) {
    this.#grid = grid;
  }

  update(_world: World): void {
    if (this.#grid.version !== this.#lastSeenGridVersion) {
      this.#lastSeenGridVersion = this.#grid.version;
      for (const id of this.#destinations.keys()) this.#markDirty(id);
    }
    const nextId = this.#dirtyQueue.shift();
    if (nextId === undefined) return;
    this.#dirtySet.delete(nextId);
    const destination = this.#destinations.get(nextId);
    if (!destination) return; // unregistered while queued
    destination.field = computeFlowField(
      this.#grid.dimensions,
      (x, y) => this.#grid.isWalkable(x, y),
      destination.cells,
    );
  }

  hash(_world: World, hasher: Hasher): void {
    const ids = [...this.#destinations.keys()].sort();
    hasher.u32(ids.length);
    for (const id of ids) {
      const destination = this.#destinations.get(id)!;
      hasher.str(id).u32(destination.cells.length);
      for (const cell of destination.cells) hasher.u32(cell.x).u32(cell.y);
    }
    hasher.u32(this.#dirtyQueue.length);
    for (const id of this.#dirtyQueue) hasher.str(id);
  }

  applyCommand(_world: World, command: Command): boolean {
    switch (command.type) {
      case 'registerPathingDestination':
        this.#destinations.set(command.destinationId, {
          id: command.destinationId,
          cells: command.cells,
          field: null,
        });
        this.#markDirty(command.destinationId);
        return true;
      case 'unregisterPathingDestination':
        this.#destinations.delete(command.destinationId);
        this.#dirtySet.delete(command.destinationId);
        return true;
      default:
        return false;
    }
  }

  destinationIds(): readonly string[] {
    return [...this.#destinations.keys()].sort();
  }

  isDirty(destinationId: string): boolean {
    return this.#dirtySet.has(destinationId);
  }

  directionAt(destinationId: string, x: number, y: number): Vec2 {
    return this.#fieldFor(destinationId).directionAt(x, y);
  }

  distanceAt(destinationId: string, x: number, y: number): number {
    return this.#fieldFor(destinationId).distanceAt(x, y);
  }

  #fieldFor(destinationId: string): FlowField {
    const destination = this.#destinations.get(destinationId);
    if (!destination) throw new Error(`Unknown pathing destination: ${destinationId}`);
    if (!destination.field) {
      // Not yet computed even once (registered this same tick, before update() ran) —
      // compute synchronously so callers never see a null field for a known destination.
      destination.field = computeFlowField(
        this.#grid.dimensions,
        (x, y) => this.#grid.isWalkable(x, y),
        destination.cells,
      );
    }
    return destination.field;
  }

  #markDirty(id: string): void {
    if (this.#dirtySet.has(id)) return;
    this.#dirtySet.add(id);
    this.#dirtyQueue.push(id);
  }
}
