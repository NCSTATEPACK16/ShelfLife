import { describe, expect, it } from 'vitest';
import { BuildGrid, PlacementError } from './grid.js';
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

describe('BuildGrid placement', () => {
  it('places a fixture and returns it with an assigned instanceId', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    expect(placed.instanceId).toBe(1);
    expect(placed.fixtureId).toBe('shelf');
    expect(grid.placements()).toEqual([placed]);
  });

  it('marks non-walkable fixture cells as unwalkable', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(grid.isWalkable(2, 2)).toBe(false);
    expect(grid.isWalkable(2, 3)).toBe(false);
    expect(grid.isWalkable(3, 2)).toBe(true);
  });

  it('leaves walkable-fixture cells walkable', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('corral', 5, 5, 0);
    expect(grid.isWalkable(5, 5)).toBe(true);
  });

  it('rejects an out-of-bounds placement', () => {
    const grid = new BuildGrid({ width: 4, height: 4 }, CATALOG);
    expect(() => grid.place('shelf', 3, 3, 0)).toThrow(PlacementError);
  });

  it('rejects an overlapping placement', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(() => grid.place('corral', 2, 2, 0)).toThrow(PlacementError);
  });

  it('allows adjacent, non-overlapping placements', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(() => grid.place('corral', 3, 2, 0)).not.toThrow();
  });

  it('assigns strictly increasing instanceIds across placements', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const a = grid.place('corral', 0, 0, 0);
    const b = grid.place('corral', 1, 0, 0);
    expect(b.instanceId).toBeGreaterThan(a.instanceId);
  });

  it('removes a placement and frees its cells', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    const removed = grid.remove(placed.instanceId);
    expect(removed).toEqual(placed);
    expect(grid.placements()).toEqual([]);
    expect(grid.isWalkable(2, 2)).toBe(true);
  });

  it('throws removing an instanceId that does not exist', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(() => grid.remove(999)).toThrow(PlacementError);
  });
});
