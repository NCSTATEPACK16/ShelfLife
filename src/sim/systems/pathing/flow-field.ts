import type { GridDimensions } from '../grid/types.js';
import type { Cell, FlowField, Vec2, Walkable } from './types.js';

const UNREACHABLE = -1;
const ZERO: Vec2 = { x: 0, y: 0 };

/** 4-connected: BFS traverses only orthogonal neighbors, so distance is true Manhattan-optimal. */
const ORTHOGONAL: readonly Vec2[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** 8-connected: used only for the direction pass, to let arrows point diagonally. */
const ALL_NEIGHBORS: readonly Vec2[] = [
  ...ORTHOGONAL,
  { x: 1, y: 1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

/**
 * Multi-source BFS flow field (PLAN.md §6.5). Uniform per-cell cost makes BFS equivalent
 * to Dijkstra, at a fraction of the constant factor (no priority queue needed).
 *
 * Two passes:
 *   1. BFS from every destination cell simultaneously, 4-connected, giving each walkable
 *      cell its true distance to the nearest destination.
 *   2. For each cell, look at all 8 neighbors and point toward whichever has the lowest
 *      distance — diagonal neighbors only count if both flanking orthogonal cells are
 *      walkable, so a direction never points through a wall corner.
 */
export function computeFlowField(
  dimensions: GridDimensions,
  isWalkable: Walkable,
  destinationCells: readonly Cell[],
): FlowField {
  const { width, height } = dimensions;
  const distances = new Int32Array(width * height).fill(UNREACHABLE);
  const index = (x: number, y: number): number => y * width + x;
  const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;

  const queue: number[] = [];
  let head = 0;
  for (const cell of destinationCells) {
    if (!inBounds(cell.x, cell.y)) continue;
    const i = index(cell.x, cell.y);
    if (distances[i] === UNREACHABLE) {
      distances[i] = 0;
      queue.push(i);
    }
  }

  while (head < queue.length) {
    const current = queue[head++]!;
    const cx = current % width;
    const cy = Math.floor(current / width);
    const currentDist = distances[current]!;

    for (const { x: dx, y: dy } of ORTHOGONAL) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny) || !isWalkable(nx, ny)) continue;
      const ni = index(nx, ny);
      if (distances[ni] !== UNREACHABLE) continue;
      distances[ni] = currentDist + 1;
      queue.push(ni);
    }
  }

  const directionOf = (x: number, y: number): Vec2 => {
    const here = distances[index(x, y)]!;
    if (here <= 0) return ZERO; // at a destination
    let best = here;
    let bestDx = 0;
    let bestDy = 0;
    for (const { x: dx, y: dy } of ALL_NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      // A destination is frequently non-walkable (a shelf, a register) — its cell is
      // seeded to distance 0 so the field still points toward it from a distance, but a
      // neighbor step must always land somewhere walkable. Skipping non-walkable
      // neighbors here means a cell already adjacent to a non-walkable destination has
      // no walkable neighbor closer than itself, so its direction is correctly ZERO
      // ("you're as close as you can get") instead of pointing into the fixture.
      if (!isWalkable(nx, ny)) continue;
      // Corner guard: a diagonal step must have both flanking orthogonal cells walkable.
      if (dx !== 0 && dy !== 0 && (!isWalkable(x + dx, y) || !isWalkable(x, y + dy))) continue;
      const nDist = distances[index(nx, ny)]!;
      if (nDist === UNREACHABLE) continue;
      if (nDist < best) {
        best = nDist;
        bestDx = dx;
        bestDy = dy;
      }
    }
    return { x: bestDx, y: bestDy };
  };

  return {
    dimensions,
    distanceAt(x: number, y: number): number {
      if (!inBounds(x, y)) return UNREACHABLE;
      return distances[index(x, y)]!;
    },
    directionAt(x: number, y: number): Vec2 {
      if (!inBounds(x, y)) return ZERO;
      const dist = distances[index(x, y)]!;
      if (dist === UNREACHABLE) return ZERO;
      return directionOf(x, y);
    },
  };
}
