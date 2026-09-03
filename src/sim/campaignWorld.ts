import { z } from 'zod';
import { replay, World } from './core/world.js';
import type { LoggedCommand } from './core/commands.js';
import type { Stream } from './core/rng.js';
import { CheckoutSystem } from './systems/checkout/system.js';
import { EconomySystem } from './systems/economy/system.js';
import { GridSystem } from './systems/grid/system.js';
import { InventorySystem } from './systems/inventory/system.js';
import { LoyaltySystem } from './systems/loyalty/system.js';
import { DEFAULT_CATCHMENT_CONFIG, DEFAULT_RIVAL_STORES } from './systems/market/config.js';
import { MarketSystem } from './systems/market/system.js';
import type { Position, RivalStore, Segment } from './systems/market/types.js';
import { PathingSystem } from './systems/pathing/system.js';
import { ReputationSystem } from './systems/reputation/system.js';
import { RivalsSystem } from './systems/rivals/system.js';
import { buildLevelDef } from './systems/campaign/level.js';
import { CampaignSystem } from './systems/campaign/system.js';
import type { HouseholdGenerationConfig } from './systems/campaign/types.js';
import { ShoppersSystem } from './systems/shoppers/system.js';

/**
 * Real campaign gameplay's world construction (spec §5.1). Grid size is a placeholder — real
 * store dimensions are level-design/UI territory, not this phase's.
 */
const CAMPAIGN_GRID_DIMENSIONS = { width: 30, height: 30 };

export interface CampaignWorldHandle {
  readonly world: World;
  readonly campaign: CampaignSystem;
}

interface GeneratedHousehold {
  readonly householdId: number;
  readonly segment: Segment;
  readonly position: Position;
}

/**
 * The same recipe `tools/sim-harness/world.ts#generateHouseholds` uses, adapted to draw from
 * the `'campaign'` stream (not `'harness'` — spec §5.1) since this drives real, replay-stable
 * gameplay rather than tooling sweeps.
 */
function generateHouseholds(
  rng: Stream,
  config: HouseholdGenerationConfig,
  rivalRoster: readonly RivalStore[],
): readonly GeneratedHousehold[] {
  const player = DEFAULT_CATCHMENT_CONFIG.playerStorePosition;
  const xs = [player.x, ...rivalRoster.map((r) => r.position.x)];
  const ys = [player.y, ...rivalRoster.map((r) => r.position.y)];
  const margin = config.catchmentMarginCells;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;

  const segmentWeights = Object.entries(config.segmentMix) as [Segment, number][];
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
  for (let i = 0; i < config.householdCount; i++) {
    households.push({
      householdId: i + 1,
      segment: pickSegment(),
      position: { x: rng.nextInt(minX, maxX), y: rng.nextInt(minY, maxY) },
    });
  }
  return households;
}

interface RegisteredCampaign {
  readonly campaign: CampaignSystem;
  readonly households: readonly GeneratedHousehold[];
}

/**
 * Registration only — no commands pushed. Shared by a fresh build and a replayed load, so the
 * two can never drift apart (spec §5.1).
 *
 * Household generation draws from `world.rng.get('campaign')` here — not in
 * `buildCampaignWorld` alone — because `World.hash` folds in the RNG's cumulative draw count
 * (`totalDraws()`) as a tamper check. A fresh build consumes this draw before any `step()`;
 * `loadCampaignWorld`'s replay never re-issues the `addHousehold` commands' generating draw
 * (households come from the replayed log instead), so unless the same draw happens here on
 * both paths, the two worlds' draw counts — and therefore every hash from tick 0 onward —
 * permanently diverge even though gameplay behaves identically. `buildCampaignWorld` uses the
 * returned households to push commands; `loadCampaignWorld` discards them, needing only the
 * matching draw.
 */
function registerCampaignSystems(world: World, levelId: string): RegisteredCampaign {
  const level = buildLevelDef(levelId);
  const grid = new GridSystem(CAMPAIGN_GRID_DIMENSIONS);
  world.register(grid);
  const pathing = new PathingSystem(grid.grid);
  world.register(pathing);
  const inventory = new InventorySystem();
  world.register(inventory);
  const checkout = new CheckoutSystem(grid.grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory);
  world.register(economy);

  const rivalRoster = DEFAULT_RIVAL_STORES.filter((r) => r.id === level.rivalId);
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

  const campaign = new CampaignSystem(market, economy, level);
  world.register(campaign);

  const households = generateHouseholds(world.rng.get('campaign'), level.households, rivalRoster);
  return { campaign, households };
}

/** A fresh level start: registers systems, then pushes the level's starting-store fixtures and
 *  its generated households, drawn from `world.rng.get('campaign')`. */
export function buildCampaignWorld(levelId: string, seed: number): CampaignWorldHandle {
  const world = new World({ seed });
  const { campaign, households } = registerCampaignSystems(world, levelId);
  const level = campaign.level;

  for (const command of level.startingStore) world.commands.push(command);

  for (const h of households) {
    world.commands.push({ type: 'addHousehold', householdId: h.householdId, segment: h.segment, position: h.position });
  }

  return { world, campaign };
}

export interface SaveEnvelope {
  readonly version: 1;
  readonly levelId: string;
  readonly seed: number;
  readonly tick: number;
  readonly commandLog: readonly LoggedCommand[];
}

/**
 * Rebuilds a saved run. Registration-only — never re-pushes `startingStore`/households, since a
 * save's `commandLog` already contains those as tick-0 entries from the original build (spec
 * §5.2). Re-pushing them here would double every fixture and household.
 */
export function loadCampaignWorld(save: SaveEnvelope): CampaignWorldHandle {
  let campaign!: CampaignSystem;
  const world = replay(save.seed, save.commandLog, save.tick, (w) => {
    ({ campaign } = registerCampaignSystems(w, save.levelId));
  });
  return { world, campaign };
}

const SaveEnvelopeSchema = z.object({
  version: z.literal(1),
  levelId: z.string().min(1),
  seed: z.number().int(),
  tick: z.number().int().nonnegative(),
  // Command payloads aren't re-validated per-variant here — a save is trusted local data in
  // this phase; adversarial replay verification (PLAN.md §8.3) is a later phase over saves
  // that cross the network, not this local-only seam.
  commandLog: z.array(z.object({ tick: z.number().int().nonnegative(), command: z.unknown() })),
});

/**
 * The migration seam (spec §5.2). Exactly one version exists today — this is a documented
 * no-op pass-through, not a speculative migration chain built ahead of any real second version.
 */
export function migrateSaveEnvelope(raw: unknown): SaveEnvelope {
  return SaveEnvelopeSchema.parse(raw) as SaveEnvelope;
}
