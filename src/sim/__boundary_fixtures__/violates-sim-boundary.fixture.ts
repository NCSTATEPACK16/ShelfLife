/**
 * FIXTURE — this file exists to be linted by tests/boundaries/boundaries.test.ts.
 *
 * Every line below is a deliberate violation of the sim boundary (docs/adr/0002).
 * It is excluded from `npm run lint` via the global ignores in eslint.config.js,
 * and the test re-lints it with `ignore: false` to assert each rule fires.
 *
 * If this file ever stops producing errors, a boundary rule has silently broken.
 */

// Restricted import: persistence inside the sim.
import { get } from 'idb-keyval';

// Restricted import: the UI layer.
import { signal } from '@preact/signals';

export function violatesEverything(): number {
  // Restricted globals.
  const w = typeof window;
  const d = typeof document;

  // Determinism killers.
  const r = Math.random();
  const t = Date.now();
  const d2 = new Date();
  const p = performance.now();

  void get;
  void signal;
  void w;
  void d;
  void d2;

  return r + t + p;
}
