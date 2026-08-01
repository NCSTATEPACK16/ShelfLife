import { describe, expect, it } from 'vitest';
import { computeFlowField } from './flow-field.js';

const OPEN_5X5 = { width: 5, height: 5 };
const alwaysWalkable = () => true;

describe('computeFlowField', () => {
  it('gives the destination cell zero distance and a zero direction', () => {
    const field = computeFlowField(OPEN_5X5, alwaysWalkable, [{ x: 2, y: 2 }]);
    expect(field.distanceAt(2, 2)).toBe(0);
    expect(field.directionAt(2, 2)).toEqual({ x: 0, y: 0 });
  });

  it('points every open cell toward the single destination, decreasing distance', () => {
    const field = computeFlowField(OPEN_5X5, alwaysWalkable, [{ x: 2, y: 2 }]);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if (x === 2 && y === 2) continue;
        const dir = field.directionAt(x, y);
        const dist = field.distanceAt(x, y);
        expect(dist).toBeGreaterThan(0);
        const stepX = x + Math.sign(dir.x);
        const stepY = y + Math.sign(dir.y);
        expect(field.distanceAt(stepX, stepY)).toBeLessThan(dist);
      }
    }
  });

  it('marks cells cut off by walls as unreachable (-1 distance, zero direction)', () => {
    // A 5x5 grid with a solid wall across row 2 except no gap: cells below the wall
    // can never reach the destination above it.
    const isWalkable = (_x: number, y: number) => y !== 2;
    const field = computeFlowField(OPEN_5X5, isWalkable, [{ x: 2, y: 0 }]);
    expect(field.distanceAt(2, 4)).toBe(-1);
    expect(field.directionAt(2, 4)).toEqual({ x: 0, y: 0 });
  });

  it('routes around a wall with a single gap rather than a straight line through it', () => {
    // Row 2 is a wall except for a gap at x=4. The destination is at (0,0), an agent
    // starts effectively at (0,4) — the only path is right along row 4, up through the
    // gap at x=4, then left along row 0.
    const isWalkable = (x: number, y: number) => y !== 2 || x === 4;
    const field = computeFlowField(OPEN_5X5, isWalkable, [{ x: 0, y: 0 }]);
    const dist = field.distanceAt(0, 4);
    expect(dist).toBeGreaterThan(0);
    const dir = field.directionAt(0, 4);
    // From (0,4), the shortest path goes right (toward the gap), not up (into the wall).
    expect(dir.x).toBeGreaterThan(0);
  });

  it('never returns a diagonal direction that cuts through a blocked corner', () => {
    // Destination at (1,1); (0,0) is walkable, but the cells orthogonally between them,
    // (1,0) and (0,1), are both blocked. A diagonal step from (0,0) to (1,1) would clip
    // both walls, so the direction must not be exactly diagonal toward (1,1).
    const isWalkable = (x: number, y: number) => !((x === 1 && y === 0) || (x === 0 && y === 1));
    const field = computeFlowField(OPEN_5X5, isWalkable, [{ x: 1, y: 1 }]);
    expect(field.distanceAt(0, 0)).toBe(-1); // fully cut off: only diagonal-through-corner route exists
  });
});
