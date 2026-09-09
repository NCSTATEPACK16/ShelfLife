import type { Command } from '../../core/commands.js';

/**
 * Per-level fixture-placement recipes (spec §4.1) — TypeScript, not JSON5, matching how every
 * other "starting store" recipe in this codebase (tools/sim-harness/world.ts, every golden
 * scenario) is authored. A documented first pass, identical across all three levels — real
 * level layout design is later work; this phase only needs something the sim can run.
 *
 * Instance ids are deterministic: BuildGrid's counter is 1-based and assigns in placement
 * order, so `shelf_basic` (x2) → 1, 2; `register` → 3; `self_checkout` → 4, matching the same
 * convention tools/sim-harness/world.ts documents for its own baseline store.
 */
const BASELINE_STORE: readonly Command[] = [
  { type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 10, rotation: 0 },
  { type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 13, rotation: 0 },
  { type: 'placeFixture', fixtureId: 'register', x: 15, y: 15, rotation: 0 },
  { type: 'placeFixture', fixtureId: 'self_checkout', x: 18, y: 18, rotation: 0 },
  { type: 'stockFixture', instanceId: 1, goodId: 'milk' },
  { type: 'stockFixture', instanceId: 2, goodId: 'bread' },
  { type: 'hireStaff', staffId: 1, skill: 0.6, morale: 0.6 },
  { type: 'assignStaffToRegister', staffId: 1, instanceId: 3 },
];

export const STARTING_STORES: ReadonlyMap<string, readonly Command[]> = new Map([
  ['l1', BASELINE_STORE],
  ['l2', BASELINE_STORE],
  ['l3', BASELINE_STORE],
]);
