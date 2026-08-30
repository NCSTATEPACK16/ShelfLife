import { assetById, frameKey } from './asset-manifest.js';
import type { SpritePlan } from './draw-plan.js';
import { depthFor, worldToScreen, type ScreenPoint } from './projection.js';

export interface ShopperView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly state: string;
  /** Household segment, used to pick a palette swap. */
  readonly segment?: string | undefined;
}

/** The four rendered facings, in the order the atlas packs them. */
export const FACINGS = ['down', 'left', 'right', 'up'] as const;
export type Facing = (typeof FACINGS)[number];

/**
 * Which way a shopper is facing, from how they moved since the last frame.
 *
 * Derived in the view rather than stored in the sim on purpose: facing is a rendering
 * concern with no effect on any outcome, and adding it to `Shopper` would put a
 * presentation field into the world hash for nothing (ADR 0007).
 */
export function facingFor(dx: number, dy: number, previous: Facing = 'down'): Facing {
  const EPSILON = 1e-4;
  if (Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON) return previous;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy > 0 ? 'down' : 'up';
}

/** Tracks per-shopper facing and animation phase across frames. */
export class ShopperAnimator {
  readonly #last = new Map<number, { x: number; y: number; facing: Facing; phase: number }>();

  /** Drops shoppers that have left, so the map does not grow across a long session. */
  prune(active: ReadonlySet<number>): void {
    for (const id of this.#last.keys()) {
      if (!active.has(id)) this.#last.delete(id);
    }
  }

  advance(shopper: ShopperView): { facing: Facing; frame: number; moving: boolean } {
    const previous = this.#last.get(shopper.id);
    const dx = previous ? shopper.x - previous.x : 0;
    const dy = previous ? shopper.y - previous.y : 0;
    const moving = Math.abs(dx) > 1e-4 || Math.abs(dy) > 1e-4;
    const facing = facingFor(dx, dy, previous?.facing ?? 'down');

    // Advance the walk cycle by distance travelled, not by wall-clock frames, so the
    // animation stays in step with the sprite's actual speed at any tick rate.
    const travelled = Math.hypot(dx, dy);
    const phase = ((previous?.phase ?? 0) + travelled * STEPS_PER_TILE) % 1;

    this.#last.set(shopper.id, { x: shopper.x, y: shopper.y, facing, phase });
    return { facing, frame: moving ? Math.floor(phase * WALK_FRAMES) : 0, moving };
  }
}

const STEPS_PER_TILE = 2;
const WALK_FRAMES = 2;

export function buildShopperDrawPlan(
  shoppers: readonly ShopperView[],
  origin: ScreenPoint,
  animator: ShopperAnimator,
): readonly SpritePlan[] {
  const asset = assetById('shopper');
  const palettes = asset.palettes ?? [];

  animator.prune(new Set(shoppers.map((shopper) => shopper.id)));

  return shoppers.map((shopper) => {
    const { facing, frame, moving } = animator.advance(shopper);
    const screen = worldToScreen(shopper.x, shopper.y, origin);

    // An unknown or absent segment falls back to the first declared palette rather than
    // throwing — a shopper with no art is still a shopper, and a crash here would take
    // the whole frame down.
    const palette =
      shopper.segment !== undefined && palettes.includes(shopper.segment) ? shopper.segment : palettes[0];

    return {
      key: frameKey('shopper', {
        state: moving ? 'walk' : 'idle',
        rotation: FACINGS.indexOf(facing),
        frame,
        palette,
      }),
      atlas: asset.atlas,
      x: screen.x,
      y: screen.y,
      depth: depthFor('agent', shopper.y),
      originX: asset.anchor[0],
      originY: asset.anchor[1],
      flipX: false,
      tint: null,
    };
  });
}
