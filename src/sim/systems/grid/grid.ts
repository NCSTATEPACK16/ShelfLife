import type { FixtureDef, Footprint, GridDimensions, Rotation } from './types.js';

export class BuildGrid {
  readonly #dimensions: GridDimensions;
  readonly #catalog: ReadonlyMap<string, FixtureDef>;

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
    return this.isInBounds(x, y);
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
