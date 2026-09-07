import { describe, expect, it } from 'vitest';
import { depthFor, fitZoom, screenToWorld, TILE_SIZE, worldToScreen, ZOOM_STEPS } from './projection.js';

const ORIGIN = { x: 40, y: 24 };

describe('worldToScreen / screenToWorld', () => {
  it('scales tile coordinates by the tile size and offsets by the origin', () => {
    expect(worldToScreen(0, 0, ORIGIN)).toEqual({ x: 40, y: 24 });
    expect(worldToScreen(3, 2, ORIGIN)).toEqual({ x: 40 + 3 * TILE_SIZE, y: 24 + 2 * TILE_SIZE });
  });

  it('round-trips', () => {
    for (const [x, y] of [[0, 0], [7, 3], [19, 19], [2.5, 6.25]] as const) {
      const back = screenToWorld(worldToScreen(x, y, ORIGIN).x, worldToScreen(x, y, ORIGIN).y, ORIGIN);
      expect(back.x).toBeCloseTo(x, 10);
      expect(back.y).toBeCloseTo(y, 10);
    }
  });

  it('maps a whole tile to a whole tile, so taps land where they look', () => {
    // The point of ADR 0004: every pixel inside a tile's square floors to that tile.
    const corners = [
      [0, 0],
      [TILE_SIZE - 1, 0],
      [0, TILE_SIZE - 1],
      [TILE_SIZE - 1, TILE_SIZE - 1],
    ] as const;
    for (const [dx, dy] of corners) {
      const world = screenToWorld(ORIGIN.x + 5 * TILE_SIZE + dx, ORIGIN.y + 5 * TILE_SIZE + dy, ORIGIN);
      expect(Math.floor(world.x)).toBe(5);
      expect(Math.floor(world.y)).toBe(5);
    }
  });
});

describe('depthFor', () => {
  it('sorts by world row so agents interleave with fixtures', () => {
    expect(depthFor('agent', 5)).toBeGreaterThan(depthFor('fixture', 4));
    expect(depthFor('agent', 5)).toBeLessThan(depthFor('fixture', 6));
  });

  it('puts an agent in front of a fixture on the same row', () => {
    expect(depthFor('agent', 5)).toBeGreaterThan(depthFor('fixture', 5));
  });

  it('keeps floors under, and overlays over, every world row', () => {
    // Fixed bands rather than y-sorted: a floor tile at the bottom of a large store must
    // still draw beneath a fixture at the top of it.
    for (const row of [0, 20, 200]) {
      expect(depthFor('floor', row)).toBeLessThan(depthFor('fixture', 0));
      expect(depthFor('overlay', row)).toBeGreaterThan(depthFor('agent', 200));
    }
  });

  it('breaks ties within a tile with subOrder', () => {
    expect(depthFor('fixture', 3, 1)).toBeGreaterThan(depthFor('fixture', 3, 0));
    // ...without spilling into the next row.
    expect(depthFor('fixture', 3, 9)).toBeLessThan(depthFor('fixture', 4));
  });
});

describe('fitZoom', () => {
  it('only ever returns an integer step', () => {
    for (let width = 200; width <= 3000; width += 37) {
      expect(ZOOM_STEPS).toContain(fitZoom(width, 20) as (typeof ZOOM_STEPS)[number]);
    }
  });

  it('picks 1x on a phone and more on a desktop', () => {
    // A 20-tile store is 640px wide at 1x, so a 390px phone cannot fit it and must pan.
    expect(fitZoom(390, 20)).toBe(1);
    expect(fitZoom(1440, 20)).toBe(2);
  });

  it('never returns zero, however narrow the viewport', () => {
    // A zoom of 0 would divide by zero in the pointer transform and blank the screen.
    expect(fitZoom(10, 20)).toBe(1);
  });
});
