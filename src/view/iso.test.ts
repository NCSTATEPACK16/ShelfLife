import { describe, expect, it } from 'vitest';
import { screenToWorld, worldToScreen, TILE_HEIGHT, TILE_WIDTH } from './iso.js';

const ORIGIN = { x: 400, y: 300 };

describe('iso projection', () => {
  it('places tile (0,0) at the origin', () => {
    expect(worldToScreen(0, 0, ORIGIN)).toEqual(ORIGIN);
  });

  it('moves right and down for +x', () => {
    const p = worldToScreen(1, 0, ORIGIN);
    expect(p.x).toBeGreaterThan(ORIGIN.x);
    expect(p.y).toBeGreaterThan(ORIGIN.y);
  });

  it('moves left and down for +y', () => {
    const p = worldToScreen(0, 1, ORIGIN);
    expect(p.x).toBeLessThan(ORIGIN.x);
    expect(p.y).toBeGreaterThan(ORIGIN.y);
  });

  it('round-trips worldToScreen -> screenToWorld for a grid of sample points', () => {
    for (let x = -5; x <= 5; x++) {
      for (let y = -5; y <= 5; y++) {
        const screen = worldToScreen(x, y, ORIGIN);
        const back = screenToWorld(screen.x, screen.y, ORIGIN);
        expect(Math.round(back.x)).toBe(x);
        expect(Math.round(back.y)).toBe(y);
      }
    }
  });

  it('exports the locked tile footprint', () => {
    expect(TILE_WIDTH).toBe(128);
    expect(TILE_HEIGHT).toBe(64);
  });
});
