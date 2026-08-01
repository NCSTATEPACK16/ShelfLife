import type { FixtureDef, Footprint, GridDimensions, Placement, Rotation } from './types.js';

export class PlacementError extends Error {}

type HistoryEntry =
  | { readonly kind: 'place'; readonly placement: Placement }
  | { readonly kind: 'remove'; readonly placement: Placement }
  | {
      readonly kind: 'rotate';
      readonly instanceId: number;
      readonly from: Rotation;
      readonly to: Rotation;
    };

export class BuildGrid {
  readonly #dimensions: GridDimensions;
  readonly #catalog: ReadonlyMap<string, FixtureDef>;
  readonly #occupancy = new Map<string, number>();
  readonly #placements = new Map<number, Placement>();
  readonly #undoStack: HistoryEntry[] = [];
  readonly #redoStack: HistoryEntry[] = [];
  #nextInstanceId = 1;
  #version = 0;

  constructor(dimensions: GridDimensions, catalog: readonly FixtureDef[]) {
    this.#dimensions = dimensions;
    this.#catalog = new Map(catalog.map((def) => [def.id, def]));
  }

  get dimensions(): GridDimensions {
    return this.#dimensions;
  }

  /** Bumped on every place/remove/rotate/undo/redo — pathing's dirty-tracking signal. */
  get version(): number {
    return this.#version;
  }

  fixtureDef(fixtureId: string): FixtureDef {
    const def = this.#catalog.get(fixtureId);
    if (!def) throw new Error(`Unknown fixture id: ${fixtureId}`);
    return def;
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.#dimensions.width && y < this.#dimensions.height;
  }

  isWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    const instanceId = this.#occupancy.get(cellKey(x, y));
    if (instanceId === undefined) return true;
    const placement = this.#placements.get(instanceId);
    return placement ? this.fixtureDef(placement.fixtureId).walkable : true;
  }

  placements(): readonly Placement[] {
    return [...this.#placements.values()].sort((a, b) => a.instanceId - b.instanceId);
  }

  place(fixtureId: string, x: number, y: number, rotation: Rotation): Placement {
    const cells = this.footprintCells(fixtureId, x, y, rotation);
    this.#assertPlaceable(cells);

    const instanceId = this.#nextInstanceId++;
    const placement: Placement = { instanceId, fixtureId, x, y, rotation };
    this.#reoccupy(placement);
    this.#pushHistory({ kind: 'place', placement });
    return placement;
  }

  remove(instanceId: number): Placement {
    const placement = this.#placements.get(instanceId);
    if (!placement) throw new PlacementError(`No placement with instanceId ${instanceId}`);
    this.#unoccupy(placement);
    this.#pushHistory({ kind: 'remove', placement });
    return placement;
  }

  rotate(instanceId: number, rotation: Rotation): Placement {
    const existing = this.#placements.get(instanceId);
    if (!existing) throw new PlacementError(`No placement with instanceId ${instanceId}`);
    if (existing.rotation === rotation) return existing;

    this.#assertRotatable(existing, rotation);
    const rotated = this.#applyRotation(existing, rotation);
    this.#pushHistory({ kind: 'rotate', instanceId, from: existing.rotation, to: rotation });
    return rotated;
  }

  hasUndo(): boolean {
    return this.#undoStack.length > 0;
  }

  hasRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  /** Undoes the most recent place/remove/rotate. Returns false if there is nothing to undo. */
  undo(): boolean {
    const entry = this.#undoStack.pop();
    if (!entry) return false;
    switch (entry.kind) {
      case 'place':
        this.#unoccupy(entry.placement);
        break;
      case 'remove':
        this.#reoccupy(entry.placement);
        break;
      case 'rotate': {
        const current = this.#placements.get(entry.instanceId);
        if (current) this.#applyRotation(current, entry.from);
        break;
      }
    }
    this.#redoStack.push(entry);
    this.#version++;
    return true;
  }

  /** Re-applies the most recently undone action. Returns false if there is nothing to redo. */
  redo(): boolean {
    const entry = this.#redoStack.pop();
    if (!entry) return false;
    switch (entry.kind) {
      case 'place':
        this.#reoccupy(entry.placement);
        break;
      case 'remove':
        this.#unoccupy(entry.placement);
        break;
      case 'rotate': {
        const current = this.#placements.get(entry.instanceId);
        if (current) this.#applyRotation(current, entry.to);
        break;
      }
    }
    this.#undoStack.push(entry);
    this.#version++;
    return true;
  }

  #pushHistory(entry: HistoryEntry): void {
    this.#undoStack.push(entry);
    this.#redoStack.length = 0;
    this.#version++;
  }

  #assertPlaceable(cells: readonly { x: number; y: number }[]): void {
    for (const { x, y } of cells) {
      if (!this.isInBounds(x, y)) {
        throw new PlacementError(`Placement cell (${x}, ${y}) is out of bounds`);
      }
      if (this.#occupancy.has(cellKey(x, y))) {
        throw new PlacementError(`Placement cell (${x}, ${y}) is already occupied`);
      }
    }
  }

  #assertRotatable(placement: Placement, rotation: Rotation): void {
    const newCells = this.footprintCells(placement.fixtureId, placement.x, placement.y, rotation);
    for (const { x, y } of newCells) {
      if (!this.isInBounds(x, y)) {
        throw new PlacementError(`Rotated placement cell (${x}, ${y}) is out of bounds`);
      }
      const occupant = this.#occupancy.get(cellKey(x, y));
      if (occupant !== undefined && occupant !== placement.instanceId) {
        throw new PlacementError(`Rotated placement cell (${x}, ${y}) is already occupied`);
      }
    }
  }

  /** Frees `placement`'s cells and removes it from the placement map. */
  #unoccupy(placement: Placement): void {
    const cells = this.footprintCells(placement.fixtureId, placement.x, placement.y, placement.rotation);
    for (const { x, y } of cells) this.#occupancy.delete(cellKey(x, y));
    this.#placements.delete(placement.instanceId);
  }

  /** Occupies `placement`'s cells and records it in the placement map. */
  #reoccupy(placement: Placement): void {
    const cells = this.footprintCells(placement.fixtureId, placement.x, placement.y, placement.rotation);
    for (const { x, y } of cells) this.#occupancy.set(cellKey(x, y), placement.instanceId);
    this.#placements.set(placement.instanceId, placement);
  }

  /** Moves an already-placed fixture to `rotation` without touching history. */
  #applyRotation(placement: Placement, rotation: Rotation): Placement {
    this.#unoccupy(placement);
    const rotated: Placement = { ...placement, rotation };
    this.#reoccupy(rotated);
    return rotated;
  }

  rotatedFootprint(footprint: Footprint, rotation: Rotation): Footprint {
    return rotation === 90 || rotation === 270
      ? { width: footprint.height, height: footprint.width }
      : { width: footprint.width, height: footprint.height };
  }

  footprintCells(
    fixtureId: string,
    x: number,
    y: number,
    rotation: Rotation,
  ): readonly { x: number; y: number }[] {
    const def = this.fixtureDef(fixtureId);
    const { width, height } = this.rotatedFootprint(def.footprint, rotation);
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        cells.push({ x: x + dx, y: y + dy });
      }
    }
    return cells;
  }
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
