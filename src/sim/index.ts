/**
 * The simulation's public API.
 *
 * Everything outside `src/sim` sees only this file. The renderer, the UI, the bridge,
 * the balance harness, and the leaderboard verifier all consume the same surface —
 * which is what keeps the boundary in docs/adr/0002 honest rather than aspirational.
 */

export { Clock, TICK_MS, TICKS_PER_SECOND, TICKS_PER_SIM_DAY, TICKS_PER_SIM_HOUR, timeFromTick } from './core/clock.js';
export type { SimTime } from './core/clock.js';

export { CommandQueue, hashCommand } from './core/commands.js';
export type { Command, CommandType, LoggedCommand } from './core/commands.js';

export { EventBus } from './core/events.js';
export type { SimEvent, SimEventType } from './core/events.js';

export { formatHash, Hasher } from './core/hash.js';

export { deriveSeed, fnv1a, Stream, StreamSet, STREAM_NAMES } from './core/rng.js';
export type { StreamName } from './core/rng.js';

export { freezeSnapshot } from './core/snapshot.js';
export type { WorldSnapshot } from './core/snapshot.js';

export { hashCommands, replay, World } from './core/world.js';
export type { System, WorldOptions } from './core/world.js';

export { BuildGrid, DEFAULT_CATALOG, GridSystem, parseCatalog, PlacementError } from './systems/grid/index.js';
export type { FixtureDef, Footprint, GridDimensions, Placement, Rotation } from './systems/grid/index.js';

export {
  computeFlowField,
  computeSteering,
  DEFAULT_PATHING_CONFIG,
  parsePathingConfig,
  PathingSystem,
} from './systems/pathing/index.js';
export type {
  Cell,
  FlowField,
  PathingConfig,
  SteeringAgent,
  Vec2,
  Walkable,
} from './systems/pathing/index.js';

export { DEFAULT_GOODS_CATALOG, parseGoodsCatalog } from './systems/goods/index.js';
export type { GoodDef } from './systems/goods/index.js';

export {
  advancePantryDay,
  chooseStore,
  consumptionMultiplierFor,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_MARKET_CONFIG,
  DEFAULT_RIVAL_STORES,
  DEFAULT_SEGMENT_CONFIG,
  deriveShoppingList,
  indexToFit,
  MarketSystem,
  parseCatchmentConfig,
  parseMarketConfig,
  parseRivalStore,
  parseSegmentConfig,
  PLAYER_STORE_ID,
  playerStoreTerms,
  rivalStoreTerms,
  SEGMENTS,
  softmax,
  storeUtility,
  travelCost,
} from './systems/market/index.js';
export type {
  CatchmentConfig,
  Household,
  MarketConfig,
  PlayerTermDeps,
  Position,
  RivalTermDeps,
  StoreTerms,
  RivalStore,
  Segment,
  SegmentConfig,
  SegmentDef,
  UtilityWeights,
} from './systems/market/index.js';

export { DEFAULT_SHOPPERS_CONFIG, parseShoppersConfig, ShoppersSystem } from './systems/shoppers/index.js';
export type { Shopper, ShopperState, ShoppersConfig } from './systems/shoppers/index.js';

export { LoyaltySystem } from './systems/loyalty/index.js';
export type { MarketReader, TripOutcome } from './systems/loyalty/index.js';

export { ReputationSystem } from './systems/reputation/index.js';
export type { NeighborReader } from './systems/reputation/index.js';

export {
  DEFAULT_INVENTORY_CONFIG,
  DEFAULT_SUPPLY_POLICIES,
  freshnessAt,
  InventorySystem,
  parseInventoryConfig,
  parseSupplyPolicies,
} from './systems/inventory/index.js';
export type {
  Batch,
  ConsumeResult,
  InventoryConfig,
  PendingOrder,
  StockedGood,
  SupplyPolicy,
} from './systems/inventory/index.js';

export { CheckoutSystem, DEFAULT_STAFFING_CONFIG, parseStaffingConfig } from './systems/checkout/index.js';
export type {
  CheckoutOutcome,
  Lane,
  QueuedShopper,
  Serving,
  StaffingConfig,
  StaffMember,
} from './systems/checkout/index.js';

export { DEFAULT_ECONOMY_CONFIG, EconomySystem, parseEconomyConfig } from './systems/economy/index.js';
export type { DailyStatement, EconomyConfig, LedgerCategory, LedgerEntry, Promotion } from './systems/economy/index.js';
