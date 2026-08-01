#!/usr/bin/env node
/**
 * Bundle budget check (PLAN.md §10.1).
 *
 * Enforced in CI rather than by vibes, and enforced from the first commit rather than
 * from the phase where it starts hurting. A budget you adopt after you have blown it is
 * a negotiation, not a budget.
 */

import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUDGETS = [
  {
    name: 'game — initial load',
    dir: 'dist/game',
    limitBytes: 3.5 * 1024 * 1024,
    note: 'PLAN.md §10.1. On iOS these assets ship in the binary instead, where the 150 MB line applies.',
  },
  {
    name: 'landing page',
    dir: 'dist',
    // The landing page is the first thing anyone sees, and it competes with every other
    // tab. Keep it genuinely small; this excludes the game subdirectory.
    limitBytes: 150 * 1024,
    exclude: ['dist/game'],
    note: 'PLAN.md §15 — must stay small and indexable.',
  },
];

/** Sourcemaps ship for debugging but are never fetched during a normal load. */
const IGNORED = /\.map$/;

function walk(dir, exclude = []) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (exclude.some((e) => full === e || full.startsWith(`${e}/`))) continue;
    if (statSync(full).isDirectory()) out.push(...walk(full, exclude));
    else if (!IGNORED.test(full)) out.push(full);
  }
  return out;
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

let failed = false;

for (const budget of BUDGETS) {
  const files = walk(budget.dir, budget.exclude ?? []);
  let total = 0;
  const rows = [];

  for (const file of files) {
    const size = gzipSync(readFileSync(file)).length;
    total += size;
    rows.push([relative(budget.dir, file), size]);
  }

  const pct = ((total / budget.limitBytes) * 100).toFixed(1);
  const over = total > budget.limitBytes;
  failed ||= over;

  console.log(`\n${over ? 'FAIL' : 'ok  '}  ${budget.name}`);
  console.log(`      ${kb(total)} gzipped of ${kb(budget.limitBytes)} budget  (${pct}%)`);
  for (const [name, size] of rows.sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`        ${kb(size).padStart(10)}  ${name}`);
  }
  if (over) console.log(`      ${budget.note}`);
}

if (failed) {
  console.error('\nBundle budget exceeded. Reduce the payload or change the budget deliberately.');
  process.exit(1);
}

console.log('\nAll bundle budgets met.\n');
