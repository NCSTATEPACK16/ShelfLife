import type { SimTime } from './clock.js';

/**
 * Snapshots (PLAN.md §6.2).
 *
 * The only thing the renderer and UI ever see. A snapshot is a plain, immutable,
 * structured-cloneable value — which is what lets the simulation move into a Web Worker
 * later (§5.5 of the roadmap) without changing a single consumer.
 *
 * Deliberately NOT a live view into world state: handing out a reference would let the
 * renderer mutate the simulation by accident, and would make the worker move a rewrite
 * instead of a config change.
 */

export interface WorldSnapshot {
  readonly tick: number;
  readonly time: SimTime;
  readonly hash: number;
  readonly seed: number;
  readonly speed: number;
  readonly paused: boolean;
  /** Total RNG draws so far — surfaced for the debug overlay and harness diagnostics. */
  readonly rngDraws: number;
}

/**
 * Snapshots are produced every tick but consumed at frame rate, so most are discarded.
 * Reusing one mutable object would be faster — and would break the renderer's ability
 * to interpolate between the last two, which needs both to still exist.
 */
export function freezeSnapshot(snapshot: WorldSnapshot): Readonly<WorldSnapshot> {
  return Object.freeze(snapshot);
}
