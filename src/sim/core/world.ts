import { Clock, TICKS_PER_SIM_DAY } from './clock.js';
import { CommandQueue, hashCommand, type Command, type LoggedCommand } from './commands.js';
import { EventBus } from './events.js';
import { Hasher } from './hash.js';
import { StreamSet } from './rng.js';
import { freezeSnapshot, type WorldSnapshot } from './snapshot.js';

/**
 * The world (PLAN.md §6.1, §6.3).
 *
 * A pure, deterministic, headless simulation. It imports nothing from Phaser, the DOM,
 * Capacitor, or Supabase — enforced by ESLint, and load-bearing for three things at
 * once: the iOS port stays a shell, the balance harness can run 500 sims, and a
 * leaderboard score can be verified by replaying its command log on a server.
 *
 * Phase 1.3 scope is the kernel: clock, RNG streams, command queue, event bus, snapshot,
 * and the world hash. Gameplay systems register into `#systems` from phase 1.4 onward.
 */

export interface WorldOptions {
  readonly seed: number;
}

/** A gameplay system. Registered in a fixed order; that order is part of determinism. */
export interface System {
  readonly name: string;
  /** Runs once per tick. Must be a pure function of world state and its own RNG stream. */
  update(world: World): void;
  /** Folds the system's state into the world hash. Order within must be stable. */
  hash(world: World, hasher: Hasher): void;
  /**
   * Claims a non-kernel command (docs/adr/0003). Returns true if this system handled it —
   * the first system to claim a command wins, in registration order.
   */
  applyCommand?(world: World, command: Command): boolean;
}

export class World {
  readonly clock = new Clock();
  readonly rng: StreamSet;
  readonly commands = new CommandQueue();
  readonly events = new EventBus();

  readonly #systems: System[] = [];
  #speed = 1;
  #paused = false;
  #hash = 0;

  constructor(options: WorldOptions) {
    if (!Number.isInteger(options.seed)) {
      throw new TypeError(`World seed must be an integer, got ${options.seed}`);
    }
    this.rng = new StreamSet(options.seed);
    this.#hash = this.computeHash();
  }

  get seed(): number {
    return this.rng.seed;
  }

  get tick(): number {
    return this.clock.tick;
  }

  get speed(): number {
    return this.#speed;
  }

  get paused(): boolean {
    return this.#paused;
  }

  /** The hash as of the most recently completed tick. */
  get hash(): number {
    return this.#hash;
  }

  /**
   * Registers a system. Order is significant and fixed at construction time — two
   * worlds with the same seed but different registration order are different worlds.
   */
  register(system: System): void {
    if (this.tick > 0) {
      throw new Error(`Cannot register system "${system.name}" after the world has started`);
    }
    if (this.#systems.some((s) => s.name === system.name)) {
      throw new Error(`Duplicate system name: ${system.name}`);
    }
    this.#systems.push(system);
    this.#hash = this.computeHash();
  }

  get systemNames(): readonly string[] {
    return this.#systems.map((s) => s.name);
  }

  /**
   * Advances exactly one tick.
   *
   * The order here is the determinism contract and must not be rearranged casually:
   *   1. drain commands  — input applies at a tick boundary, never mid-tick
   *   2. advance clock
   *   3. update systems  — in registration order
   *   4. recompute hash
   */
  step(): void {
    const commandTick = this.clock.tick;
    const batch = this.commands.drain(commandTick);
    for (const command of batch) this.apply(command);

    const tick = this.clock.step();

    if (!this.#paused) {
      for (const system of this.#systems) system.update(this);
    }

    if (tick % TICKS_PER_SIM_DAY === 0) {
      this.events.emit({ type: 'dayStarted', day: this.clock.time.day });
    }
    this.events.emit({ type: 'tick', tick });

    this.#hash = this.computeHash();
  }

  /** Runs `count` ticks. The harness and golden tests drive the world this way. */
  run(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`run: count must be a non-negative integer, got ${count}`);
    }
    for (let i = 0; i < count; i++) this.step();
  }

  #applySpeed(multiplier: number): void {
    // Clamped rather than rejected: a malformed command from a replay should not abort
    // verification of an otherwise valid run.
    this.#speed = Math.min(Math.max(multiplier, 0), 8);
    this.events.emit({ type: 'speedChanged', multiplier: this.#speed });
  }

  private apply(command: Command): void {
    switch (command.type) {
      case 'noop':
        return;
      case 'setSpeed':
        this.#applySpeed(command.multiplier);
        return;
      case 'pause':
        this.#paused = true;
        this.events.emit({ type: 'paused' });
        return;
      case 'resume':
        this.#paused = false;
        this.events.emit({ type: 'resumed' });
        return;
      default:
        // Not a kernel command (docs/adr/0003) — offer it to each system in registration
        // order until one claims it.
        for (const system of this.#systems) {
          if (system.applyCommand?.(this, command)) return;
        }
        throw new Error(`Unhandled command: ${JSON.stringify(command)}`);
    }
  }

  /**
   * Folds the entire world into a u32.
   *
   * Kernel state first, then each system in registration order. Every value that can
   * affect future behaviour must be included — a value left out is a behaviour change
   * the golden tests will not catch.
   */
  computeHash(): number {
    const hasher = new Hasher();
    hasher.u32(this.seed);
    hasher.u32(this.clock.tick);
    hasher.f64(this.#speed);
    hasher.bool(this.#paused);
    hasher.u32(this.rng.totalDraws());
    hasher.u32(this.#systems.length);

    for (const system of this.#systems) {
      hasher.str(system.name);
      system.hash(this, hasher);
    }

    return hasher.value;
  }

  snapshot(): Readonly<WorldSnapshot> {
    return freezeSnapshot({
      tick: this.clock.tick,
      time: this.clock.time,
      hash: this.#hash,
      seed: this.seed,
      speed: this.#speed,
      paused: this.#paused,
      rngDraws: this.rng.totalDraws(),
    });
  }
}

/**
 * Rebuilds a world from a save (PLAN.md §6.3: save = seed + command log).
 *
 * Also the leaderboard verifier (§8.3): the server runs this on a submitted log and
 * compares the resulting hash against the claim. Because it replays the real simulation,
 * a forged score requires a genuinely good strategy.
 */
export function replay(
  seed: number,
  log: readonly LoggedCommand[],
  throughTick: number,
  registerSystems?: (world: World) => void,
): World {
  const world = new World({ seed });
  registerSystems?.(world);

  const byTick = CommandQueue.fromLog(log);

  for (let tick = 0; tick < throughTick; tick++) {
    for (const command of byTick.get(tick) ?? []) world.commands.push(command);
    world.step();
  }

  return world;
}

/** Exported so tests and the harness can hash a command batch without a world. */
export function hashCommands(commands: readonly Command[]): number {
  const hasher = new Hasher();
  hasher.u32(commands.length);
  for (const command of commands) hashCommand(hasher, command);
  return hasher.value;
}
