export { DEFAULT_LEVEL_CONTENT, parseLevelContent } from './config.js';
export { buildLevelDef, DEFAULT_LEVEL_IDS } from './level.js';
export {
  computeShareTrajectory,
  computeWinResult,
  ebitdaStreakBreached,
  TripCounter,
} from './objectives.js';
export { STARTING_STORES } from './starting-stores.js';
export { CampaignSystem, ChapterNotAdvanceableError } from './system.js';
export type {
  AdvisorLine,
  CampaignEconomyReader,
  CampaignMarketReader,
  CampaignState,
  ChapterDef,
  ChapterStatus,
  EbitdaStreakLoseCondition,
  HouseholdGenerationConfig,
  LevelContent,
  LevelDef,
  LevelStatus,
  LoseCondition,
  Objective,
  ShareThresholdObjective,
} from './types.js';
export type { DailyTripCounts } from './objectives.js';
