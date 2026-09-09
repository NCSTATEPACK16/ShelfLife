#!/usr/bin/env node
/**
 * Pack generated frames into Phaser atlases (ADR 0006).
 *
 * free-tex-packer-core is MIT, pure Node, and needs no display backend — which is the
 * whole reason it is here rather than Aseprite. Nothing in this pipeline requires a
 * licence or a GPU, so it runs anywhere, including CI if we ever want it to.
 *
 * Reads `assets/src/index.json` (written by tools/art/build.py) rather than re-deriving
 * frame names. Enumeration lives in exactly one place.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import packer from 'free-tex-packer-core';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC_DIR = join(REPO_ROOT, 'assets', 'src');
const OUT_DIR = join(REPO_ROOT, 'assets', 'atlases');

/**
 * `detectIdentical` collapses duplicate images to one rect with several frame names —
 * which is exactly what a placeholder-heavy build produces, and what palette-swapped
 * sprites produce whenever two palettes agree on a pixel. Leave it on.
 *
 * `allowRotation` stays off: rotated frames complicate anchors for no gain at this size.
 */
const PACK_OPTIONS = {
  width: 1024,
  height: 1024,
  padding: 2,
  extrude: 0,
  allowRotation: false,
  allowTrim: false,
  detectIdentical: true,
  powerOfTwo: true,
  removeFileExtension: true,
  prependFolderName: false,
  exporter: 'Phaser3',
};

const index = JSON.parse(readFileSync(join(SRC_DIR, 'index.json'), 'utf8'));

const byAtlas = new Map();
for (const frame of index.frames) {
  if (!byAtlas.has(frame.atlas)) byAtlas.set(frame.atlas, []);
  byAtlas.get(frame.atlas).push(frame);
}

mkdirSync(OUT_DIR, { recursive: true });
// A stale atlas that no longer matches the manifest is worse than a missing one.
for (const stale of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, stale));

let totalBytes = 0;

for (const [atlas, frames] of [...byAtlas].sort(([a], [b]) => a.localeCompare(b))) {
  const files = frames
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((frame) => ({
      path: `${frame.key}.png`,
      contents: readFileSync(join(SRC_DIR, `${frame.key}.png`)),
    }));

  const results = await packer.packAsync(files, {
    ...PACK_OPTIONS,
    textureName: atlas,
  });

  for (const result of results) {
    writeFileSync(join(OUT_DIR, result.name), result.buffer);
    totalBytes += result.buffer.length;
  }

  const sheets = results.filter((r) => r.name.endsWith('.png'));
  if (sheets.length > 1) {
    // Multi-page atlases are supported by Phaser but complicate the loader and the
    // budget. If this fires, split the atlas deliberately rather than letting the packer
    // decide.
    throw new Error(
      `Atlas "${atlas}" overflowed to ${sheets.length} pages at ${PACK_OPTIONS.width}px. ` +
        `Split it in content/asset-manifest.json.`,
    );
  }
  console.log(`  ${atlas.padEnd(10)} ${String(frames.length).padStart(4)} frames -> ${results.map((r) => r.name).join(', ')}`);
}

console.log(`packed ${index.frames.length} frames into ${byAtlas.size} atlases (${(totalBytes / 1024).toFixed(1)} KB)`);
