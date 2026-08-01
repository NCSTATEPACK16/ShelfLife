import { describe, expect, it } from 'vitest';
import { BuildGrid } from './grid.js';
import type { FixtureDef } from './types.js';

const CATALOG: readonly FixtureDef[] = [
  { id: 'shelf', name: 'Shelf', footprint: { width: 1, height: 2 }, walkable: false },
  { id: 'corral', name: 'Corral', footprint: { width: 1, height: 1 }, walkable: true },
];

describe('BuildGrid', () => {
  it('reports in-bounds cells correctly', () => {
    const grid = new BuildGrid({ width: 10, height: 8 }, CATALOG);
    expect(grid.isInBounds(0, 0)).toBe(true);
    expect(grid.isInBounds(9, 7)).toBe(true);
    expect(grid.isInBounds(10, 0)).toBe(false);
    expect(grid.isInBounds(-1, 0)).toBe(false);
  });

  it('every cell is walkable before anything is placed', () => {
    const grid = new BuildGrid({ width: 4, height: 4 }, CATALOG);
    expect(grid.isWalkable(2, 2)).toBe(true);
  });

  it('computes footprint cells at rotation 0', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const cells = grid.footprintCells('shelf', 3, 4, 0);
    expect(cells).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ]);
  });

  it('swaps width/height for a 90-degree rotation', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const cells = grid.footprintCells('shelf', 3, 4, 90);
    expect(cells).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
  });

  it('throws for an unknown fixture id', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(() => grid.footprintCells('nonexistent', 0, 0, 0)).toThrow(/unknown fixture/i);
  });
});
