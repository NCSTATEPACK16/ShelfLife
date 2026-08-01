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

/**
 * Phase 1.3 shipped the kernel-level commands. Phase 1.4 adds the first gameplay system's
 * commands (grid/build mode) — see docs/adr/0003 for how a system claims a command type
 * without `World#apply` needing to know its semantics.
 */
export type Command =
  | { readonly type: 'noop' }
  | { readonly type: 'setSpeed'; readonly multiplier: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | {
      readonly type: 'placeFixture';
      readonly fixtureId: string;
      readonly x: number;
      readonly y: number;
      readonly rotation: 0 | 90 | 180 | 270;
    }
  | { readonly type: 'rotateFixture'; readonly instanceId: number; readonly rotation: 0 | 90 | 180 | 270 }
  | { readonly type: 'removeFixture'; readonly instanceId: number }
  | { readonly type: 'undoBuild' }
  | { readonly type: 'redoBuild' }
  | {
      readonly type: 'registerPathingDestination';
      readonly destinationId: string;
      readonly cells: readonly { readonly x: number; readonly y: number }[];
    }
  | { readonly type: 'unregisterPathingDestination'; readonly destinationId: string }
  | { readonly type: 'addHousehold'; readonly householdId: number }
  | { readonly type: 'stockFixture'; readonly instanceId: number; readonly goodId: string }
  | { readonly type: 'spawnShopper'; readonly shopperId: number; readonly householdId: number };

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
    case 'placeFixture':
      hasher.str(command.fixtureId).u32(command.x).u32(command.y).u32(command.rotation);
      return;
    case 'rotateFixture':
      hasher.u32(command.instanceId).u32(command.rotation);
      return;
    case 'removeFixture':
      hasher.u32(command.instanceId);
      return;
    case 'registerPathingDestination':
      hasher.str(command.destinationId).u32(command.cells.length);
      for (const cell of command.cells) hasher.u32(cell.x).u32(cell.y);
      return;
    case 'unregisterPathingDestination':
      hasher.str(command.destinationId);
      return;
    case 'addHousehold':
      hasher.u32(command.householdId);
      return;
    case 'stockFixture':
      hasher.u32(command.instanceId).str(command.goodId);
      return;
    case 'spawnShopper':
      hasher.u32(command.shopperId).u32(command.householdId);
      return;
    case 'noop':
    case 'pause':
    case 'resume':
    case 'undoBuild':
    case 'redoBuild':
      return;
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhashed command type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
