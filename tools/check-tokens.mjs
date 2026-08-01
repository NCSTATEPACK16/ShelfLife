#!/usr/bin/env node
/**
 * Design-token consistency check (PLAN.md §11.6).
 *
 * `content/design/tokens.json` is the single source of truth for colour, and both the
 * game UI and the landing page consume it. A hardcoded hex is how two surfaces of the
 * same product quietly drift apart — and how a dark-theme bug ships, because a literal
 * colour cannot respond to a theme.
 *
 * Two checks:
 *   1. No hex literals in src/ui or landing, outside the files that DEFINE the tokens.
 *   2. Every colour a token-defining file declares actually exists in tokens.json, so
 *      the CSS and the JSON cannot disagree.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The two files allowed to contain raw hex: they are the token definitions themselves. */
const TOKEN_SOURCES = ['src/ui/styles/base.css', 'landing/styles.css'];

const SCAN_DIRS = ['src/ui', 'src/view', 'landing'];
const SCAN_EXT = /\.(css|ts|tsx)$/;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // Directory does not exist yet; that is fine.
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (full.includes('__boundary_fixtures__')) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCAN_EXT.test(full)) out.push(full);
  }
  return out;
}

/**
 * `#fff` and `#FFFFFF` are the same colour, so compare on a canonical form —
 * otherwise the check fails on notation rather than on drift, which trains people
 * to ignore it.
 */
function normalizeHex(hex) {
  const body = hex.slice(1).toLowerCase();
  const expanded =
    body.length === 3 || body.length === 4
      ? [...body].map((c) => c + c).join('')
      : body;
  // Drop a fully-opaque alpha channel so #ffffffff matches #ffffff.
  return `#${expanded.length === 8 && expanded.endsWith('ff') ? expanded.slice(0, 6) : expanded}`;
}

/** Collect every hex value appearing anywhere in tokens.json. */
function tokenPalette() {
  const raw = readFileSync('content/design/tokens.json', 'utf8');
  return new Set((raw.match(HEX) ?? []).map(normalizeHex));
}

const palette = tokenPalette();
const problems = [];

/* ── Check 1: no stray hex outside the token-defining files ────────────────── */

for (const file of SCAN_DIRS.flatMap(walk)) {
  const normalized = file.split('\\').join('/');
  if (TOKEN_SOURCES.includes(normalized)) continue;

  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    for (const hex of line.match(HEX) ?? []) {
      problems.push(
        `${normalized}:${i + 1}  hardcoded colour ${hex}\n` +
          `    Use a token from content/design/tokens.json (a var(--…)), so it can respond to the theme.`,
      );
    }
  });
}

/* ── Check 2: token-defining CSS may not invent colours ────────────────────── */

for (const file of TOKEN_SOURCES) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    // Ignore rgb()/rgba() shadow definitions, which are opacity math rather than palette.
    if (/rgb\(/i.test(line)) return;
    for (const hex of line.match(HEX) ?? []) {
      if (!palette.has(normalizeHex(hex))) {
        problems.push(
          `${file}:${i + 1}  ${hex} is not in content/design/tokens.json\n` +
            `    Add it to the token file first — the JSON is the source of truth, the CSS mirrors it.`,
        );
      }
    }
  });
}

if (problems.length > 0) {
  console.error(`\nDesign token check failed — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}

console.log(`Design tokens consistent. ${palette.size} colours defined; no hardcoded values.`);
