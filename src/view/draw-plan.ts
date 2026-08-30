import type { BuildModeSnapshot } from '../bridge/build-bridge.js';
import { assetById, frameKey, TILE_SIZE } from './asset-manifest.js';
import { selectionColor } from './fixture-colors.js';
import { depthFor, worldToScreen, type ScreenPoint } from './projection.js';

/**
 * One sprite to draw. Pure data — no Phaser type appears in this file, which is what keeps
 * the whole layout of a frame unit-testable without a renderer (ADR 0005).
 */
export interface SpritePlan {
  /** Atlas frame key, from `frameKey()`. */
  readonly key: string;
  readonly atlas: string;
  /** Screen position of the sprite's anchor point. */
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  /** Normalised anchor, straight from the manifest. */
  readonly originX: number;
  readonly originY: number;
  readonly flipX: boolean;
  /** Tint as 0xRRGGBB, or null for no tint. Selection and spoilage use this. */
  readonly tint: number | null;
}

export interface DrawPlan {
  readonly floor: readonly SpritePlan[];
  readonly fixtures: readonly SpritePlan[];
  readonly cursor: readonly SpritePlan[];
}

/**
 * A fixture's rotation, as a frame index.
 *
 * The sim stores rotation in degrees (0/90/180/270) because that is what placement means.
 * Art declares however many distinct renders it has — typically 2, since a shelf seen from
 * the left is the same shelf seen from the right, mirrored (ADR 0004). Rotations beyond
 * the available renders wrap, and the mirrored half is drawn flipped.
 */
export function rotationFrame(
  rotationDegrees: number,
  available: number,
): { index: number; flipX: boolean } {
  const quarter = ((Math.round(rotationDegrees / 90) % 4) + 4) % 4;
  if (available >= 4) return { index: quarter, flipX: false };
  if (available === 2) return { index: quarter % 2, flipX: quarter >= 2 };
  return { index: 0, flipX: quarter >= 2 };
}

/**
 * Deterministic floor variation.
 *
 * Purely cosmetic, so it must not touch the sim's RNG streams — those are reserved for
 * simulation state and adding a draw to them would move every world hash. A hash of the
 * tile coordinate gives stable variety that survives a reload and costs nothing.
 */
export function floorVariant(x: number, y: number, variants: number): number {
  if (variants <= 1) return 0;
  const h = Math.imul(x * 73_856_093 ^ y * 19_349_663, 2_654_435_761);
  return ((h >>> 16) ^ (h >>> 4)) % variants;
}

export function buildDrawPlan(
  snapshot: BuildModeSnapshot,
  origin: ScreenPoint,
  selectedInstanceId: number | null,
  options: { readonly cursor?: { x: number; y: number; valid: boolean } | null } = {},
): DrawPlan {
  const { width, height } = snapshot.dimensions;

  const floorAsset = assetById('floor_tile');
  const floorVariants = floorAsset.variants ?? 1;
  const floor: SpritePlan[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const screen = worldToScreen(x, y, origin);
      floor.push({
        key: frameKey('floor_tile', { variant: floorVariant(x, y, floorVariants) }),
        atlas: floorAsset.atlas,
        x: screen.x,
        y: screen.y,
        depth: depthFor('floor', y),
        originX: floorAsset.anchor[0],
        originY: floorAsset.anchor[1],
        flipX: false,
        tint: null,
      });
    }
  }

  const catalogById = new Map(snapshot.catalog.map((def) => [def.id, def]));
  const fixtures: SpritePlan[] = [];
  for (const placement of snapshot.placements) {
    const asset = assetById(placement.fixtureId);
    const def = catalogById.get(placement.fixtureId);
    const footprintHeight = def?.footprint.height ?? 1;
    const footprintWidth = def?.footprint.width ?? 1;

    const { index, flipX } = rotationFrame(placement.rotation, asset.rotations ?? 1);

    // Anchor at the bottom-centre of the footprint, which is what y-sort depth measures
    // from (ADR 0004). For a 2x1 register that is half a tile right of its origin tile;
    // for a 1x2 shelf it is one full tile down.
    const anchor = worldToScreen(
      placement.x + footprintWidth / 2,
      placement.y + footprintHeight,
      origin,
    );

    fixtures.push({
      key: frameKey(placement.fixtureId, { rotation: index }),
      atlas: asset.atlas,
      x: anchor.x,
      y: anchor.y,
      depth: depthFor('fixture', placement.y + footprintHeight),
      originX: asset.anchor[0],
      originY: asset.anchor[1],
      flipX,
      tint: placement.instanceId === selectedInstanceId ? selectionColor() : null,
    });
  }

  const cursor: SpritePlan[] = [];
  const requested = options.cursor;
  if (requested) {
    const asset = assetById('cursor_tile');
    const screen = worldToScreen(requested.x, requested.y, origin);
    cursor.push({
      key: frameKey('cursor_tile', { state: requested.valid ? 'valid' : 'invalid' }),
      atlas: asset.atlas,
      x: screen.x,
      y: screen.y,
      depth: depthFor('overlay', requested.y),
      originX: asset.anchor[0],
      originY: asset.anchor[1],
      flipX: false,
      tint: null,
    });
  }

  return { floor, fixtures, cursor };
}

export { TILE_SIZE };
