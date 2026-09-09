import { TILE_SIZE } from './asset-manifest.js';

/**
 * Orthogonal 3/4 top-down projection (ADR 0004).
 *
 * This replaces the 2:1 dimetric transform. The store grid is axis-aligned, so world-to-
 * screen is a scale and a translate, and the inverse is a subtract and a divide. Tap
 * targets are rectangles rather than diamonds, which is what makes a 44 px hit target
 * mean what it says on a phone.
 *
 * `TILE_SIZE` comes from `content/asset-manifest.json` so the art pipeline and the
 * renderer cannot disagree about how big a tile is.
 */
export { TILE_SIZE };

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Tile coordinates to screen pixels. Fractional world coordinates are allowed. */
export function worldToScreen(x: number, y: number, origin: ScreenPoint): ScreenPoint {
  return { x: origin.x + x * TILE_SIZE, y: origin.y + y * TILE_SIZE };
}

/** Screen pixels to fractional tile coordinates; callers `Math.floor` for a tile index. */
export function screenToWorld(screenX: number, screenY: number, origin: ScreenPoint): ScreenPoint {
  return { x: (screenX - origin.x) / TILE_SIZE, y: (screenY - origin.y) / TILE_SIZE };
}

/**
 * Draw layers, in painter's order.
 *
 * Only `fixture` and `agent` take part in y-sorting — that interleaving is the entire
 * point of a 3/4 view, and it is why a shopper walking below a shelf draws in front of it
 * and one walking above draws behind. Floors are always beneath and overlays always above,
 * regardless of world position, so they use fixed depth bands instead.
 */
export const LAYER_RANK = { floor: 0, fixture: 1, agent: 2, overlay: 3 } as const;
export type DepthLayer = keyof typeof LAYER_RANK;

const FLOOR_BAND = -1_000_000;
const OVERLAY_BAND = 1_000_000;

/**
 * Depth for a sprite at world row `worldY` (ADR 0004).
 *
 * `subOrder` breaks ties within one tile — a fixture's shadow under its body, two shoppers
 * on the same row. Keep it small; it is deliberately not a general-purpose z.
 */
export function depthFor(layer: DepthLayer, worldY: number, subOrder = 0): number {
  if (layer === 'floor') return FLOOR_BAND + subOrder;
  if (layer === 'overlay') return OVERLAY_BAND + worldY * 10 + subOrder;
  return worldY * 1000 + LAYER_RANK[layer] * 10 + subOrder;
}

/**
 * Zoom is restricted to whole numbers so every source pixel maps to an exact block of
 * screen pixels. A fractional zoom is what makes pixel art shimmer when the camera moves,
 * and no amount of texture filtering hides it (ADR 0005).
 */
export const ZOOM_STEPS = [1, 2, 3, 4] as const;

/** The largest integer zoom that still fits `tilesAcross` tiles into `viewportWidth`. */
export function fitZoom(viewportWidth: number, tilesAcross: number): number {
  const ideal = viewportWidth / (tilesAcross * TILE_SIZE);
  let chosen: number = ZOOM_STEPS[0];
  for (const step of ZOOM_STEPS) {
    if (step <= ideal) chosen = step;
  }
  return chosen;
}
