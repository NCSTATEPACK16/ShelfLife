import { World } from '../../src/sim/index.js';
import type { Hasher, System } from '../../src/sim/index.js';

/**
 * Golden scenarios (PLAN.md §11.2).
 *
 * Each scenario is a named, fully deterministic recipe. The golden test records the
 * world-hash sequence for each and fails CI if it ever changes. A diff is either a bug
 * or a deliberate behaviour change that must be re-baselined in its own commit saying
 * why (CLAUDE.md).
 *
 * Scenarios live here rather than in the test file so the balance harness and the
 * leaderboard verifier can run the identical recipes.
 */

/** Exercises RNG consumption and per-tick state so the hash has something to catch. */
function counterSystem(name: string, stream: 'spawn' | 'impulse' | 'spoilage'): System {
  let count = 0;
  let accumulator = 0;
  return {
    name,
    update(world: World): void {
      count++;
      accumulator += world.rng.get(stream).nextFloat();
    },
    hash(_world: World, hasher: Hasher): void {
      hasher.u32(count).f64(accumulator);
    },
  };
}

export interface Scenario {
  readonly name: string;
  readonly seed: number;
  readonly ticks: number;
  /** How often to record a hash. Recording all 10,000 would make an unreviewable file. */
  readonly sampleEvery: number;
  build(): World;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'empty-world',
    seed: 20260731,
    ticks: 10_000,
    sampleEvery: 500,
    build() {
      // The literal phase 1.3 gate: 10,000 ticks of an empty world.
      return new World({ seed: this.seed });
    },
  },
  {
    name: 'single-system',
    seed: 1234567,
    ticks: 10_000,
    sampleEvery: 500,
    build() {
      const world = new World({ seed: this.seed });
      world.register(counterSystem('counter', 'spawn'));
      return world;
    },
  },
  {
    name: 'three-systems',
    seed: 8675309,
    ticks: 5_000,
    sampleEvery: 250,
    build() {
      const world = new World({ seed: this.seed });
      // Registration order is part of the contract; changing it changes the hash.
      world.register(counterSystem('alpha', 'spawn'));
      world.register(counterSystem('beta', 'impulse'));
      world.register(counterSystem('gamma', 'spoilage'));
      return world;
    },
  },
  {
    name: 'speed-and-pause',
    seed: 42,
    ticks: 3_000,
    sampleEvery: 150,
    build() {
      const world = new World({ seed: this.seed });
      world.register(counterSystem('counter', 'spawn'));
      // Commands are queued up front and drain on their tick boundaries, so this stays
      // a pure recipe rather than depending on when the test happens to push them.
      world.commands.push({ type: 'setSpeed', multiplier: 4 });
      return world;
    },
  },
];

/** Runs a scenario and returns its sampled hash sequence. */
export function runScenario(scenario: Scenario): number[] {
  const world = scenario.build();
  const samples: number[] = [world.hash];

  for (let tick = 1; tick <= scenario.ticks; tick++) {
    // Mid-run commands, applied at fixed ticks so the recipe stays reproducible.
    if (scenario.name === 'speed-and-pause') {
      if (tick === 1000) world.commands.push({ type: 'pause' });
      if (tick === 2000) world.commands.push({ type: 'resume' });
    }
    world.step();
    if (tick % scenario.sampleEvery === 0) samples.push(world.hash);
  }

  return samples;
}
