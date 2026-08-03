import {
  CheckoutSystem,
  EconomySystem,
  GridSystem,
  InventorySystem,
  PathingSystem,
  ShoppersSystem,
  World,
} from '../../src/sim/index.js';
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
  {
    name: 'grid-build',
    seed: 555111,
    ticks: 2_000,
    sampleEvery: 100,
    build() {
      const world = new World({ seed: this.seed });
      world.register(new GridSystem({ width: 30, height: 30 }));
      for (let i = 0; i < 20; i++) {
        world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: i, y: 0, rotation: 0 });
      }
      for (let i = 0; i < 5; i++) {
        world.commands.push({ type: 'undoBuild' });
      }
      return world;
    },
  },
  {
    name: 'grid-and-pathing',
    seed: 20260801,
    ticks: 400,
    sampleEvery: 20,
    build() {
      const world = new World({ seed: this.seed });
      const grid = new GridSystem({ width: 30, height: 30 });
      world.register(grid);
      const pathing = new PathingSystem(grid.grid);
      world.register(pathing);

      for (let i = 0; i < 15; i++) {
        world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: i, y: 5, rotation: 0 });
      }
      world.commands.push({
        type: 'registerPathingDestination',
        destinationId: 'north-exit',
        cells: [{ x: 0, y: 0 }],
      });
      world.commands.push({
        type: 'registerPathingDestination',
        destinationId: 'south-exit',
        cells: [{ x: 29, y: 29 }],
      });
      return world;
    },
  },
  {
    name: 'shopper-trip',
    seed: 20260806,
    ticks: 4 * 1440 + 3000,
    sampleEvery: 200,
    build() {
      const world = new World({ seed: this.seed });
      const grid = new GridSystem({ width: 20, height: 20 });
      world.register(grid);
      const pathing = new PathingSystem(grid.grid);
      world.register(pathing);
      const inventory = new InventorySystem();
      world.register(inventory);
      const checkout = new CheckoutSystem(grid.grid, pathing);
      world.register(checkout);
      const economy = new EconomySystem(checkout, inventory);
      world.register(economy);
      const shoppers = new ShoppersSystem(grid.grid, pathing, inventory, checkout, economy);
      world.register(shoppers);

      world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 10, rotation: 0 });
      world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 17, y: 17, rotation: 0 });
      // Fresh grid, first-ever placement: BuildGrid's instance-id counter starts at 1 and
      // this is the only fixture placed before it, so instanceId 1 is deterministic here
      // without needing to read it back after the command applies. The register is
      // instance 2 (placed second) — staffing it is what keeps this scenario's lane open
      // so the trip actually completes rather than balking immediately (phase 1.8).
      world.commands.push({ type: 'stockFixture', instanceId: 1, goodId: 'bread' });
      world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family' });
      world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
      world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: 2 });
      return world;
    },
  },
  {
    name: 'pricing-and-promotions',
    seed: 20260807,
    ticks: 2000,
    sampleEvery: 100,
    build() {
      const world = new World({ seed: this.seed });
      const grid = new GridSystem({ width: 10, height: 10 });
      world.register(grid);
      const pathing = new PathingSystem(grid.grid);
      world.register(pathing);
      const inventory = new InventorySystem();
      world.register(inventory);
      const checkout = new CheckoutSystem(grid.grid, pathing);
      world.register(checkout);
      const economy = new EconomySystem(checkout, inventory);
      world.register(economy);

      world.commands.push({ type: 'setPrice', goodId: 'milk', price: 2.99 });
      world.commands.push({ type: 'startPromotion', goodId: 'bread', discountFraction: 0.25, durationTicks: 500 });
      world.commands.push({ type: 'setMarketingSpend', dailyAmount: 15 });
      return world;
    },
  },
];

/**
 * `shopper-trip` spawns its shopper once the household's day-4 depletion has put
 * something on its list (only `bread` crosses its reorder threshold by day 4 — see the
 * phase 1.6 plan). `runScenario` below pushes this at a fixed tick, keeping the whole
 * recipe reproducible.
 */
const SHOPPER_TRIP_SPAWN_TICK = 4 * 1440;

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
    if (scenario.name === 'shopper-trip' && tick === SHOPPER_TRIP_SPAWN_TICK) {
      world.commands.push({ type: 'spawnShopper', shopperId: 100, householdId: 1 });
    }
    world.step();
    if (tick % scenario.sampleEvery === 0) samples.push(world.hash);
  }

  return samples;
}
