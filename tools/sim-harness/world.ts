import {
  CheckoutSystem,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_RIVAL_STORES,
  EconomySystem,
  GridSystem,
  InventorySystem,
  LoyaltySystem,
  MarketSystem,
  PathingSystem,
  ReputationSystem,
  RivalsSystem,
  ShoppersSystem,
  World,
} from '../../src/sim/index.js';
import type { RivalStore, Segment, Position, Stream } from '../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from './config.js';

export const HARNESS_GRID_DIMENSIONS = { width: 24, height: 24 };

/** Instance ids of the baseline setup, in placement order — every strategy relies on these
 *  being exactly this, since BuildGrid's instance-id counter is a deterministic 1-based
 *  counter that never reuses ids, even across removes. */
export const BASELINE_SHELF_INSTANCE_IDS: readonly [number, number] = [1, 2];
export const BASELINE_REGISTER_INSTANCE_ID = 3;
export const BASELINE_SELF_CHECKOUT_INSTANCE_ID = 4;
export const BASELINE_STAFF_ID = 1;
export const NEXT_INSTANCE_ID_AFTER_BASELINE = 5;
export const BASELINE_STOCKED_GOOD_IDS: readonly ['milk', 'bread'] = ['milk', 'bread'];

export const MAX_LEVEL = DEFAULT_RIVAL_STORES.length;

export interface GeneratedHousehold {
  readonly householdId: number;
  readonly segment: Segment;
  readonly position: Position;
}

/** Deterministic from `rng` alone — same stream state in, same households out. */
export function generateHouseholds(
  rng: Stream,
  config: HarnessConfig,
  rivalRoster: readonly RivalStore[],
): readonly GeneratedHousehold[] {
  const player = DEFAULT_CATCHMENT_CONFIG.playerStorePosition;
  const xs = [player.x, ...rivalRoster.map((r) => r.position.x)];
  const ys = [player.y, ...rivalRoster.map((r) => r.position.y)];
  const margin = config.world.catchmentMarginCells;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;

  const segmentWeights = Object.entries(config.world.segmentMix) as [Segment, number][];
  const totalWeight = segmentWeights.reduce((sum, [, weight]) => sum + weight, 0);

  const pickSegment = (): Segment => {
    let roll = rng.nextFloat() * totalWeight;
    for (const [segment, weight] of segmentWeights) {
      roll -= weight;
      if (roll <= 0) return segment;
    }
    return segmentWeights[segmentWeights.length - 1]![0];
  };

  const households: GeneratedHousehold[] = [];
  for (let i = 0; i < config.world.householdCount; i++) {
    households.push({
      householdId: i + 1,
      segment: pickSegment(),
      position: { x: rng.nextInt(minX, maxX), y: rng.nextInt(minY, maxY) },
    });
  }
  return households;
}

export interface HarnessWorld {
  readonly world: World;
  readonly economy: EconomySystem;
  readonly checkout: CheckoutSystem;
  readonly market: MarketSystem;
  /** storeIndex (per MarketSystem/RivalsSystem convention: 0 = player, n = the nth rival) of
   *  this level's featured/target rival — always equal to `level`. */
  readonly targetStoreIndex: number;
}

/**
 * Builds the harness's own canonical starting store: identical fixtures/goods/staff for every
 * strategy at a given level, so comparisons are fair. Not real level content (phase 2.1's job) —
 * see docs/superpowers/specs/2026-09-01-balance-harness-design.md §3.2.
 */
export function buildHarnessWorld(
  level: number,
  seed: number,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): HarnessWorld {
  if (level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be between 1 and ${MAX_LEVEL}, got ${level}`);
  }
  const rivalRoster = DEFAULT_RIVAL_STORES.slice(0, level);

  const world = new World({ seed });
  const grid = new GridSystem(HARNESS_GRID_DIMENSIONS);
  world.register(grid);
  const pathing = new PathingSystem(grid.grid);
  world.register(pathing);
  const inventory = new InventorySystem();
  world.register(inventory);
  const checkout = new CheckoutSystem(grid.grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory);
  world.register(economy);

  const marketBox: { current?: MarketSystem } = {};
  const rivals = new RivalsSystem(
    {
      outcomes: () => marketBox.current!.pendingOutcomes(),
      playerPriceLevel: () => economy.priceLevel(world.tick),
    },
    rivalRoster,
  );
  world.register(rivals);
  const loyalty = new LoyaltySystem(
    {
      householdIds: () => marketBox.current!.householdIds(),
      pendingOutcomes: () => marketBox.current!.pendingOutcomes(),
    },
    rivals,
  );
  const market = new MarketSystem({ inventory, checkout, economy, loyalty }, undefined, undefined, rivals);
  marketBox.current = market;
  world.register(market);
  const shoppers = new ShoppersSystem(market, grid.grid, pathing, inventory, checkout, economy);
  world.register(shoppers);
  world.register(loyalty);
  world.register(new ReputationSystem(market, loyalty));

  world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 10, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 13, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 15, y: 15, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'self_checkout', x: 18, y: 18, rotation: 0 });
  world.commands.push({ type: 'stockFixture', instanceId: BASELINE_SHELF_INSTANCE_IDS[0], goodId: 'milk' });
  world.commands.push({ type: 'stockFixture', instanceId: BASELINE_SHELF_INSTANCE_IDS[1], goodId: 'bread' });
  world.commands.push({ type: 'hireStaff', staffId: BASELINE_STAFF_ID, skill: 0.7, morale: 0.7 });
  world.commands.push({
    type: 'assignStaffToRegister',
    staffId: BASELINE_STAFF_ID,
    instanceId: BASELINE_REGISTER_INSTANCE_ID,
  });

  const households = generateHouseholds(world.rng.get('harness'), config, rivalRoster);
  for (const h of households) {
    world.commands.push({ type: 'addHousehold', householdId: h.householdId, segment: h.segment, position: h.position });
  }

  return { world, economy, checkout, market, targetStoreIndex: level };
}
