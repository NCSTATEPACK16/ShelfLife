export { travelCost } from './catchment.js';
export { chooseStore, indexToFit, softmax, storeUtility } from './choice.js';
export type { StoreTerms } from './choice.js';
export {
  consumptionMultiplierFor,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_MARKET_CONFIG,
  DEFAULT_RIVAL_STORES,
  DEFAULT_SEGMENT_CONFIG,
  parseCatchmentConfig,
  parseMarketConfig,
  parseRivalStore,
  parseSegmentConfig,
} from './config.js';
export type { CatchmentConfig, MarketConfig, SegmentConfig } from './config.js';
export { advancePantryDay, deriveShoppingList } from './household.js';
export { MarketSystem } from './system.js';
export { SEGMENTS } from './types.js';
export type { Household, Position, RivalStore, Segment, SegmentDef, UtilityWeights } from './types.js';
