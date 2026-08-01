/** Locked 2:1 dimetric tile footprint (PLAN.md §9.1). */
export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;

const HALF_W = TILE_WIDTH / 2;
const HALF_H = TILE_HEIGHT / 2;

export function worldToScreen(x: number, y: number, origin: { x: number; y: number }): { x: number; y: number } {
  return {
    x: origin.x + (x - y) * HALF_W,
    y: origin.y + (x + y) * HALF_H,
  };
}

/** Returns fractional tile coordinates; callers `Math.floor` for a tile index. */
export function screenToWorld(
  screenX: number,
  screenY: number,
  origin: { x: number; y: number },
): { x: number; y: number } {
  const dx = screenX - origin.x;
  const dy = screenY - origin.y;
  return {
    x: (dx / HALF_W + dy / HALF_H) / 2,
    y: (dy / HALF_H - dx / HALF_W) / 2,
  };
}
