/**
 * Commands (PLAN.md §6.3).
 *
 * Every mutation of the world enters through a command. Nothing outside `src/sim`
 * mutates state directly — the renderer and UI push commands across the bridge and read
 * snapshots back.
 *
 * The payoff: **save = seed + command log.** That gives free replay, free bug repro,
 * cheap cloud saves (§8.2), and server-verifiable leaderboard runs (§8.3) — the server
 * replays the log and recomputes the score rather than trusting the client.
 *
 * Consequence to respect: a command must be a complete, self-contained description of an
 * intent. A command that says "place a shelf where the cursor is" is unreplayable. One
 * that says "place shelf_dairy at (12, 7) facing north" is replayable forever.
 */

import type { Hasher } from './hash.js';

/** Phase 1.3 ships the kernel-level commands; gameplay commands arrive with their systems. */
export type Command =
  | { readonly type: 'noop' }
  | { readonly type: 'setSpeed'; readonly multiplier: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' };

export type CommandType = Command['type'];

/** A command plus the tick it was accepted on. The log is a list of these. */
export interface LoggedCommand {
  readonly tick: number;
  readonly command: Command;
}

/**
 * Commands are queued and drained at a tick boundary, never applied mid-tick.
 *
 * This is what keeps the simulation deterministic under real input: two players tapping
 * at slightly different moments inside the same 100 ms window produce the same world,
 * and a replay does not need sub-tick timing to reproduce the run.
 */
export class CommandQueue {
  #pending: Command[] = [];
  readonly #log: LoggedCommand[] = [];

  /** Queues a command for the next tick boundary. */
  push(command: Command): void {
    this.#pending.push(command);
  }

  get pendingCount(): number {
    return this.#pending.length;
  }

  /** The full ordered log. This, plus the seed, is the save file. */
  get log(): readonly LoggedCommand[] {
    return this.#log;
  }

  /**
   * Takes everything queued and records it against `tick`.
   * Returns the commands to apply, in the order they were pushed.
   */
  drain(tick: number): readonly Command[] {
    if (this.#pending.length === 0) return EMPTY;

    const batch = this.#pending;
    this.#pending = [];
    for (const command of batch) this.#log.push({ tick, command });
    return batch;
  }

  /** Replays a saved log into the queue, for load and for server-side verification. */
  static fromLog(log: readonly LoggedCommand[]): Map<number, Command[]> {
    const byTick = new Map<number, Command[]>();
    for (const entry of log) {
      const existing = byTick.get(entry.tick);
      if (existing) existing.push(entry.command);
      else byTick.set(entry.tick, [entry.command]);
    }
    return byTick;
  }
}

const EMPTY: readonly Command[] = Object.freeze([]);

/**
 * Folds a command into the world hash.
 *
 * Exhaustive by design: `never` in the default branch means adding a command type
 * without deciding how it hashes is a compile error, not a silent gap in the golden
 * tests.
 */
export function hashCommand(hasher: Hasher, command: Command): void {
  hasher.str(command.type);
  switch (command.type) {
    case 'setSpeed':
      hasher.f64(command.multiplier);
      return;
    case 'noop':
    case 'pause':
    case 'resume':
      return;
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhashed command type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
