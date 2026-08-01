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

describe('BuildGrid rotation', () => {
  it('rotates a placement in place when the new footprint fits', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0); // occupies (2,2),(2,3)
    const rotated = grid.rotate(placed.instanceId, 90); // now occupies (2,2),(3,2)
    expect(rotated.rotation).toBe(90);
    expect(grid.isWalkable(2, 3)).toBe(true);
    expect(grid.isWalkable(3, 2)).toBe(false);
  });

  it('rejects a rotation that would collide with another fixture', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0); // (2,2),(2,3)
    grid.place('corral', 3, 2, 0); // blocks the rotated footprint's second cell
    expect(() => grid.rotate(placed.instanceId, 90)).toThrow(PlacementError);
  });

  it('rejects a rotation that would go out of bounds, leaving the placement untouched', () => {
    const grid = new BuildGrid({ width: 4, height: 4 }, CATALOG);
    const placed = grid.place('shelf', 3, 0, 0); // (3,0),(3,1) — fits at rotation 0
    expect(() => grid.rotate(placed.instanceId, 90)).toThrow(PlacementError); // would need x=3,4: out of bounds
    expect(grid.placements()).toEqual([placed]);
  });

  it('throws rotating an instanceId that does not exist', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(() => grid.rotate(999, 90)).toThrow(PlacementError);
  });
});

describe('BuildGrid undo/redo', () => {
  it('undo of a place removes the fixture', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(grid.undo()).toBe(true);
    expect(grid.placements()).toEqual([]);
  });

  it('redo of an undone place restores it with the same instanceId', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    grid.undo();
    expect(grid.redo()).toBe(true);
    expect(grid.placements()).toEqual([placed]);
  });

  it('undo of a remove restores the fixture', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    grid.remove(placed.instanceId);
    expect(grid.undo()).toBe(true);
    expect(grid.placements()).toEqual([placed]);
  });

  it('undo of a rotate restores the previous rotation', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    grid.rotate(placed.instanceId, 90);
    expect(grid.undo()).toBe(true);
    expect(grid.placements()).toEqual([placed]);
  });

  it('a new action after an undo clears the redo stack', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    grid.undo();
    grid.place('corral', 5, 5, 0);
    expect(grid.redo()).toBe(false);
  });

  it('undo on empty history is a no-op returning false', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(grid.undo()).toBe(false);
  });

  it('redo with nothing to redo is a no-op returning false', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(grid.redo()).toBe(false);
  });

  it('placing 50 fixtures then undoing all 50 returns to an empty grid', () => {
    const grid = new BuildGrid({ width: 50, height: 50 }, CATALOG);
    for (let i = 0; i < 50; i++) {
      grid.place('corral', i, 0, 0);
    }
    for (let i = 0; i < 50; i++) {
      expect(grid.undo()).toBe(true);
    }
    expect(grid.placements()).toEqual([]);
    expect(grid.undo()).toBe(false);
  });

  it('hasUndo/hasRedo report stack state', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(grid.hasUndo()).toBe(false);
    expect(grid.hasRedo()).toBe(false);
    grid.place('shelf', 0, 0, 0);
    expect(grid.hasUndo()).toBe(true);
    grid.undo();
    expect(grid.hasRedo()).toBe(true);
  });
});
