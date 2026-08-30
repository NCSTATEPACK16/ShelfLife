#!/usr/bin/env node
/**
 * Asset pipeline validation (ADR 0006).
 *
 * The pipeline generates binaries from text, which means a bug here produces art that is
 * silently wrong rather than art that is obviously missing. These five checks are what
 * make generated art trustworthy:
 *
 *   1. Dimensions   every packed frame is exactly the size the manifest declares
 *   2. Anchors      every asset declares a usable anchor; depth sorting depends on it
 *   3. Case         every referenced path matches the real case-sensitive filesystem
 *   4. Schema       every atlas JSON has the shape Phaser expects
 *   5. Orphans      nothing referenced is missing; nothing present is unreferenced
 *
 * Check 3 is the expensive one to skip. Development is on case-insensitive macOS and
 * Netlify serves from case-sensitive Linux, so `Shelf.png` referencing `shelf.png` passes
 * locally and 404s in production. This is the classic "works on my Mac" failure and the
 * only place it can be caught cheaply is here.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = join(REPO_ROOT, 'content', 'asset-manifest.json');
const SRC_DIR = join(REPO_ROOT, 'assets', 'src');
const ATLAS_DIR = join(REPO_ROOT, 'assets', 'atlases');

const problems = [];
const fail = (message) => problems.push(message);

if (!existsSync(SRC_DIR) || !existsSync(join(SRC_DIR, 'index.json'))) {
  console.error('\nNo generated art found. Run `npm run art:gen` first.\n');
  process.exit(1);
}
if (!existsSync(ATLAS_DIR)) {
  console.error('\nNo atlases found. Run `npm run art:pack` first.\n');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const index = JSON.parse(readFileSync(join(SRC_DIR, 'index.json'), 'utf8'));

// ---------------------------------------------------------------- 2. anchors + manifest
const declaredPalettes = new Set(Object.keys(manifest.palettes ?? {}).filter((k) => !k.startsWith('$')));
const seenIds = new Set();

for (const asset of manifest.assets) {
  if (seenIds.has(asset.id)) fail(`manifest: duplicate asset id "${asset.id}"`);
  seenIds.add(asset.id);

  const [ax, ay] = asset.anchor ?? [];
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || ax < 0 || ax > 1 || ay < 0 || ay > 1) {
    fail(`manifest: "${asset.id}" anchor must be two numbers in 0..1, got ${JSON.stringify(asset.anchor)}`);
  }
  // ADR 0004: depth sorting is y-sort against the footprint's bottom edge. A fixture
  // anchored anywhere but its bottom edge sorts wrong the moment a shopper walks past it.
  if (asset.layer === 'fixture' && ay !== 1) {
    fail(`manifest: "${asset.id}" is a fixture, so its anchor Y must be 1 (bottom-centre), got ${ay}`);
  }
  for (const name of asset.palettes ?? []) {
    if (!declaredPalettes.has(name)) fail(`manifest: "${asset.id}" references undeclared palette "${name}"`);
  }
}

// ------------------------------------------------------------------------ 1+5. frames
const indexByKey = new Map(index.frames.map((frame) => [frame.key, frame]));
const onDisk = new Set(
  readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.png'))
    .map((name) => name.slice(0, -4)),
);

for (const key of indexByKey.keys()) {
  if (!onDisk.has(key)) fail(`frames: "${key}" is in the index but no PNG was generated`);
}
for (const key of onDisk) {
  if (!indexByKey.has(key)) fail(`frames: assets/src/${key}.png is not referenced by the manifest (orphan)`);
}

// --------------------------------------------------------- 3. filename case, explicitly
// readdirSync returns the real on-disk spelling. Comparing generated keys against that set
// catches any case drift between the manifest, the generator, and the filesystem.
const lowerToReal = new Map();
for (const real of onDisk) {
  const lower = real.toLowerCase();
  if (lowerToReal.has(lower)) {
    fail(`case: "${real}" and "${lowerToReal.get(lower)}" differ only by case — they collide on case-insensitive filesystems`);
  }
  lowerToReal.set(lower, real);
}
for (const key of indexByKey.keys()) {
  const real = lowerToReal.get(key.toLowerCase());
  if (real !== undefined && real !== key) {
    fail(`case: manifest says "${key}" but the file on disk is "${real}" — this 404s on Linux`);
  }
}

// -------------------------------------------------------------- 4. atlas schema + sizes
const atlasFiles = readdirSync(ATLAS_DIR).filter((name) => name.endsWith('.json'));
const packedKeys = new Set();

for (const file of atlasFiles) {
  const atlas = JSON.parse(readFileSync(join(ATLAS_DIR, file), 'utf8'));

  if (!Array.isArray(atlas.textures) || atlas.textures.length === 0) {
    fail(`atlas ${file}: expected a non-empty "textures" array (Phaser3 multiatlas shape)`);
    continue;
  }
  if (atlas.textures.length > 1) {
    fail(`atlas ${file}: ${atlas.textures.length} pages — split the atlas in the manifest instead`);
  }

  for (const texture of atlas.textures) {
    if (typeof texture.image !== 'string' || !existsSync(join(ATLAS_DIR, texture.image))) {
      fail(`atlas ${file}: references image "${texture.image}" which does not exist`);
    }
    if (!Array.isArray(texture.frames)) {
      fail(`atlas ${file}: texture has no "frames" array`);
      continue;
    }

    for (const frame of texture.frames) {
      const key = frame.filename;
      packedKeys.add(key);

      const declared = indexByKey.get(key);
      if (!declared) {
        fail(`atlas ${file}: packed frame "${key}" is not in the manifest index`);
        continue;
      }

      // 1. Dimensions. sourceSize is the untrimmed size and must match the manifest
      //    exactly — this is the check that catches a generator drifting from its spec.
      const [w, h] = declared.size;
      if (frame.sourceSize?.w !== w || frame.sourceSize?.h !== h) {
        fail(
          `dimensions: "${key}" is ${frame.sourceSize?.w}x${frame.sourceSize?.h} in the atlas, ` +
            `manifest declares ${w}x${h}`,
        );
      }
    }
  }
}

for (const key of indexByKey.keys()) {
  if (!packedKeys.has(key)) fail(`atlas: "${key}" was generated but never packed`);
}

// ------------------------------------------------------------------------------ report
if (problems.length > 0) {
  console.error(`\nAsset validation failed — ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('');
  process.exit(1);
}

const real = index.frames.filter((frame) => frame.real).length;
console.log(
  `Assets valid. ${index.frames.length} frames from ${manifest.assets.length} assets ` +
    `across ${atlasFiles.length} atlases (${real} real, ${index.frames.length - real} placeholder).`,
);
