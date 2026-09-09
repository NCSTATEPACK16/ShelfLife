import { z } from 'zod';
import manifestJson from '../../content/asset-manifest.json';

/**
 * The asset manifest, validated (ADR 0006).
 *
 * `content/asset-manifest.json` declares every visual before it exists. The art pipeline
 * generates frames from it; this module is how the renderer reads the same contract —
 * sizes for layout, anchors for depth sorting, footprints for placement.
 *
 * The frame-key format is shared with `tools/art/manifest.py`. Python enumerates every
 * key when it builds; this side formats one key at a time when it draws. `enumerateFrameKeys`
 * exists so a test can prove the two agree — see `asset-manifest.test.ts`.
 */

const LayerSchema = z.enum(['floor', 'fixture', 'agent', 'overlay', 'ui']);
const RouteSchema = z.enum(['procedural', 'text', 'blender', 'generated']);

const AssetSchema = z.object({
  id: z.string().min(1),
  route: RouteSchema,
  atlas: z.string().min(1),
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  anchor: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  layer: LayerSchema,
  footprint: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
  states: z.array(z.string().min(1)).optional(),
  rotations: z.number().int().positive().optional(),
  frames: z.number().int().positive().optional(),
  palettes: z.array(z.string().min(1)).optional(),
  variants: z.number().int().positive().optional(),
});

const ManifestSchema = z.object({
  $meta: z.object({ tileSize: z.number().int().positive() }),
  palettes: z.record(z.string(), z.unknown()),
  assets: z.array(AssetSchema).min(1),
});

export type AssetLayer = z.infer<typeof LayerSchema>;
export type AssetDef = z.infer<typeof AssetSchema>;

/**
 * Which frame of an asset to draw. Omitted dimensions fall back to the first.
 *
 * Every field explicitly admits `undefined` because the project runs with
 * `exactOptionalPropertyTypes`, and call sites legitimately hold optional values — a
 * fixture's state is undefined until it holds stock. Forcing every caller to strip
 * undefined keys before calling would move that noise into the renderer.
 */
export interface FrameSelector {
  readonly state?: string | undefined;
  readonly rotation?: number | undefined;
  readonly frame?: number | undefined;
  readonly palette?: string | undefined;
  readonly variant?: number | undefined;
}

export function parseManifest(raw: unknown): {
  readonly tileSize: number;
  readonly assets: readonly AssetDef[];
} {
  const parsed = ManifestSchema.parse(raw);

  const seen = new Set<string>();
  const paletteNames = new Set(Object.keys(parsed.palettes).filter((k) => !k.startsWith('$')));

  for (const asset of parsed.assets) {
    if (seen.has(asset.id)) throw new Error(`Duplicate asset id in manifest: ${asset.id}`);
    seen.add(asset.id);

    // ADR 0004 — y-sort depth measures from the footprint's bottom edge. A fixture
    // anchored anywhere else sorts wrong the instant a shopper walks past it.
    if (asset.layer === 'fixture' && asset.anchor[1] !== 1) {
      throw new Error(`Fixture ${asset.id} must be bottom-anchored (anchor Y = 1), got ${asset.anchor[1]}`);
    }
    for (const name of asset.palettes ?? []) {
      if (!paletteNames.has(name)) {
        throw new Error(`Asset ${asset.id} references undeclared palette: ${name}`);
      }
    }
  }

  return { tileSize: parsed.$meta.tileSize, assets: parsed.assets };
}

const MANIFEST = parseManifest(manifestJson);

export const TILE_SIZE = MANIFEST.tileSize;
export const ASSETS: readonly AssetDef[] = MANIFEST.assets;

const BY_ID = new Map(ASSETS.map((asset) => [asset.id, asset]));

export function assetById(id: string): AssetDef {
  const asset = BY_ID.get(id);
  if (asset === undefined) throw new Error(`Unknown asset id: ${id}`);
  return asset;
}

/**
 * Build the atlas frame key for one variant of an asset.
 *
 * Suffix order is fixed — state, rotation, frame, palette, variant — and a suffix is
 * omitted entirely when the asset has only one of that dimension. Selectors for
 * dimensions the asset does not have are ignored rather than throwing, so a caller can
 * pass a rotation to every sprite without knowing which ones rotate.
 */
export function frameKey(id: string, selector: FrameSelector = {}): string {
  const asset = assetById(id);
  let key = asset.id;

  const states = asset.states ?? [];
  if (states.length > 0) {
    const state = selector.state ?? states[0]!;
    if (!states.includes(state)) {
      throw new Error(`Asset ${id} has no state "${state}" (has: ${states.join(', ')})`);
    }
    key += `__${state}`;
  }

  const rotations = asset.rotations ?? 1;
  if (rotations > 1) {
    key += `__r${wrap(selector.rotation ?? 0, rotations)}`;
  }

  const frames = asset.frames ?? 1;
  if (frames > 1) {
    key += `__f${wrap(selector.frame ?? 0, frames)}`;
  }

  const palettes = asset.palettes ?? [];
  if (palettes.length > 0) {
    const palette = selector.palette ?? palettes[0]!;
    if (!palettes.includes(palette)) {
      throw new Error(`Asset ${id} has no palette "${palette}" (has: ${palettes.join(', ')})`);
    }
    key += `__p${palette}`;
  }

  const variants = asset.variants ?? 1;
  if (variants > 1) {
    key += `__v${wrap(selector.variant ?? 0, variants)}`;
  }

  return key;
}

/** Every frame key an asset expands to, in the same order `tools/art/manifest.py` uses. */
export function enumerateFrameKeys(asset: AssetDef): readonly string[] {
  let keys = [asset.id];
  const dimensions: string[][] = [
    (asset.states ?? []).map((state) => `__${state}`),
    (asset.rotations ?? 1) > 1 ? range(asset.rotations!).map((i) => `__r${i}`) : [],
    (asset.frames ?? 1) > 1 ? range(asset.frames!).map((i) => `__f${i}`) : [],
    (asset.palettes ?? []).map((name) => `__p${name}`),
    (asset.variants ?? 1) > 1 ? range(asset.variants!).map((i) => `__v${i}`) : [],
  ];
  for (const suffixes of dimensions) {
    if (suffixes.length === 0) continue;
    keys = keys.flatMap((key) => suffixes.map((suffix) => key + suffix));
  }
  return keys;
}

/** Animation frames and rotations cycle rather than throwing on an out-of-range index. */
function wrap(value: number, count: number): number {
  return ((Math.trunc(value) % count) + count) % count;
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
