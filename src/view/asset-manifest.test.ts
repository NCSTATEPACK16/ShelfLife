import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ASSETS, TILE_SIZE, assetById, enumerateFrameKeys, frameKey, parseManifest } from './asset-manifest.js';

describe('asset manifest', () => {
  it('loads and validates the real manifest', () => {
    expect(TILE_SIZE).toBe(32);
    expect(ASSETS.length).toBeGreaterThan(0);
  });

  it('rejects a fixture that is not bottom-anchored', () => {
    // ADR 0004: y-sort depth measures from the footprint's bottom edge, so this is a
    // silent depth bug rather than a cosmetic one. Fail at load.
    expect(() =>
      parseManifest({
        $meta: { tileSize: 32 },
        palettes: {},
        assets: [
          { id: 'x', route: 'procedural', atlas: 'world', size: [32, 48], anchor: [0.5, 0.5], layer: 'fixture' },
        ],
      }),
    ).toThrow(/bottom-anchored/);
  });

  it('rejects a duplicate asset id', () => {
    const asset = { id: 'x', route: 'procedural', atlas: 'world', size: [32, 32], anchor: [0, 0], layer: 'floor' };
    expect(() => parseManifest({ $meta: { tileSize: 32 }, palettes: {}, assets: [asset, asset] })).toThrow(
      /Duplicate asset id/,
    );
  });

  it('rejects a reference to an undeclared palette', () => {
    expect(() =>
      parseManifest({
        $meta: { tileSize: 32 },
        palettes: { known: {} },
        assets: [
          {
            id: 'x',
            route: 'text',
            atlas: 'agents',
            size: [16, 24],
            anchor: [0.5, 1],
            layer: 'agent',
            palettes: ['unknown'],
          },
        ],
      }),
    ).toThrow(/undeclared palette/);
  });
});

describe('frameKey', () => {
  it('omits every suffix for a single-frame asset', () => {
    expect(frameKey('bubble_heart')).toBe('bubble_heart');
  });

  it('appends suffixes in the fixed order: state, rotation, frame, palette', () => {
    expect(frameKey('shopper', { state: 'walk', rotation: 2, frame: 1, palette: 'foodie' })).toBe(
      'shopper__walk__r2__f1__pfoodie',
    );
  });

  it('defaults to the first state and palette', () => {
    const key = frameKey('shopper');
    const asset = assetById('shopper');
    expect(key).toBe(`shopper__${asset.states![0]}__r0__f0__p${asset.palettes![0]}`);
  });

  it('cycles rotations and animation frames rather than throwing', () => {
    // Callers advance an animation counter monotonically; making them modulo it first
    // would just move this line into every call site.
    expect(frameKey('shopper', { rotation: 4, frame: 2 })).toBe(frameKey('shopper', { rotation: 0, frame: 0 }));
    expect(frameKey('shopper', { rotation: -1 })).toBe(frameKey('shopper', { rotation: 3 }));
  });

  it('throws on a state or palette the asset does not declare', () => {
    expect(() => frameKey('shopper', { state: 'sprinting' })).toThrow(/no state/);
    expect(() => frameKey('shopper', { palette: 'nobody' })).toThrow(/no palette/);
  });

  it('ignores selectors for dimensions the asset does not have', () => {
    // So a caller can pass a rotation to every sprite without knowing which ones rotate.
    expect(frameKey('bubble_heart', { rotation: 3, frame: 7, palette: 'foodie' })).toBe('bubble_heart');
  });
});

describe('frame-key parity with the Python pipeline', () => {
  // tools/art/manifest.py enumerates every key when it builds; this module formats one at
  // a time when it draws. If they ever disagree, the renderer asks the atlas for frames
  // that were never packed — and the failure is a silently invisible sprite. Compare the
  // two enumerations directly against the index the build actually wrote.
  it('produces exactly the frame set the build generated', () => {
    const index = JSON.parse(readFileSync(new URL('../../assets/src/index.json', import.meta.url), 'utf8')) as {
      tileSize: number;
      frames: { key: string }[];
    };

    const fromPython = index.frames.map((frame) => frame.key).sort();
    const fromTypeScript = ASSETS.flatMap((asset) => enumerateFrameKeys(asset)).sort();

    expect(fromTypeScript).toEqual(fromPython);
    expect(index.tileSize).toBe(TILE_SIZE);
  });

  it('every enumerated key round-trips through frameKey', () => {
    for (const asset of ASSETS) {
      const enumerated = new Set(enumerateFrameKeys(asset));
      const states = asset.states ?? [undefined];
      const palettes = asset.palettes ?? [undefined];
      for (const state of states) {
        for (const palette of palettes) {
          for (let r = 0; r < (asset.rotations ?? 1); r++) {
            for (let f = 0; f < (asset.frames ?? 1); f++) {
              for (let v = 0; v < (asset.variants ?? 1); v++) {
                const key = frameKey(asset.id, { state, palette, rotation: r, frame: f, variant: v });
                expect(enumerated.has(key), `${key} not in enumeration of ${asset.id}`).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});
