import type { FixtureDef, Footprint, GridDimensions, Placement, Rotation } from './types.js';

export class PlacementError extends Error {}

export class BuildGrid {
  readonly #dimensions: GridDimensions;
  readonly #catalog: ReadonlyMap<string, FixtureDef>;
  readonly #occupancy = new Map<string, number>();
  readonly #placements = new Map<number, Placement>();
  #nextInstanceId = 1;

  constructor(dimensions: GridDimensions, catalog: readonly FixtureDef[]) {
    this.#dimensions = dimensions;
    this.#catalog = new Map(catalog.map((def) => [def.id, def]));
  }

  get dimensions(): GridDimensions {
    return this.#dimensions;
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
    this.#occupy(cells, instanceId);
    this.#placements.set(instanceId, placement);
    return placement;
  }

  remove(instanceId: number): Placement {
    const placement = this.#placements.get(instanceId);
    if (!placement) throw new PlacementError(`No placement with instanceId ${instanceId}`);
    const cells = this.footprintCells(placement.fixtureId, placement.x, placement.y, placement.rotation);
    for (const { x, y } of cells) this.#occupancy.delete(cellKey(x, y));
    this.#placements.delete(instanceId);
    return placement;
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

  #occupy(cells: readonly { x: number; y: number }[], instanceId: number): void {
    for (const { x, y } of cells) this.#occupancy.set(cellKey(x, y), instanceId);
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
