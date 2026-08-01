import { worldToScreen } from './iso.js';

export interface ShopperMarker {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly state: string;
}

/**
 * Placeholder-art shopper markers (a token-colored circle, matching the fixture-rectangle
 * convention `draw-plan.ts` already uses). Bubble tells (PLAN.md §12.1 — fillRateMiss,
 * discovery) are content-schema-complete (`content/design/gentle-surface.json5`) but not
 * yet wired to on-screen rendering here; that needs the view layer to consume
 * `world.events` per tick, which no view code does yet. Left for a follow-up pass rather
 * than faked with a snapshot-derived approximation.
 */
export function buildShopperDrawPlan(
  shoppers: readonly { id: number; x: number; y: number; state: string }[],
  origin: { x: number; y: number },
): readonly ShopperMarker[] {
  return shoppers.map((s) => {
    const screen = worldToScreen(s.x, s.y, origin);
    return { id: s.id, x: screen.x, y: screen.y, state: s.state };
  });
}
