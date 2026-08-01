/**
 * The simulation clock (PLAN.md §6.3).
 *
 * A fixed 100 ms step at 10 Hz. Nothing in the simulation ever reads wall-clock time —
 * the tick count IS the time, which is what lets 10,000 ticks reproduce exactly on a
 * laptop, in CI, on a phone, and inside a Deno edge function verifying a leaderboard run.
 *
 * Render smoothness is a separate concern: the renderer interpolates between the last
 * two snapshots and must never drive the simulation forward.
 */

/** Milliseconds per simulation step. */
export const TICK_MS = 100;
export const TICKS_PER_SECOND = 1000 / TICK_MS;

/** Store hours are simulated; a sim-day is compressed into this many ticks. */
export const TICKS_PER_SIM_HOUR = 60;
export const TICKS_PER_SIM_DAY = TICKS_PER_SIM_HOUR * 24;

export interface SimTime {
  /** Ticks elapsed since the world began. The canonical clock. */
  readonly tick: number;
  readonly day: number;
  /** 0–23. */
  readonly hour: number;
  /** 0–59, derived from the tick position within the hour. */
  readonly minute: number;
}

export function timeFromTick(tick: number): SimTime {
  const day = Math.floor(tick / TICKS_PER_SIM_DAY);
  const tickOfDay = tick % TICKS_PER_SIM_DAY;
  const hour = Math.floor(tickOfDay / TICKS_PER_SIM_HOUR);
  const tickOfHour = tickOfDay % TICKS_PER_SIM_HOUR;
  return { tick, day, hour, minute: Math.floor((tickOfHour / TICKS_PER_SIM_HOUR) * 60) };
}

export class Clock {
  #tick = 0;
  /** Real milliseconds not yet converted into whole ticks. */
  #accumulator = 0;

  get tick(): number {
    return this.#tick;
  }

  get time(): SimTime {
    return timeFromTick(this.#tick);
  }

  /** Advances exactly one step. The only way the clock moves. */
  step(): number {
    return ++this.#tick;
  }

  /**
   * Converts elapsed real time into a whole number of steps to run.
   *
   * `maxSteps` bounds the result so a backgrounded tab — or a phone that was asleep for
   * an hour — cannot return and demand 36,000 ticks in one frame. Exceeding the cap
   * drops the excess rather than trying to catch up, because a spiral of death is worse
   * than a small discontinuity.
   *
   * Returns steps to run; the caller invokes `step()` that many times.
   */
  pump(elapsedMs: number, speedMultiplier = 1, maxSteps = 10): number {
    if (elapsedMs <= 0) return 0;
    this.#accumulator += elapsedMs * speedMultiplier;

    const steps = Math.floor(this.#accumulator / TICK_MS);
    if (steps <= 0) return 0;

    if (steps > maxSteps) {
      this.#accumulator = 0;
      return maxSteps;
    }

    this.#accumulator -= steps * TICK_MS;
    return steps;
  }

  /** Restores a saved clock. Used by save/load and by replay verification. */
  restore(tick: number): void {
    if (!Number.isInteger(tick) || tick < 0) {
      throw new RangeError(`Clock.restore: tick must be a non-negative integer, got ${tick}`);
    }
    this.#tick = tick;
    this.#accumulator = 0;
  }
}
