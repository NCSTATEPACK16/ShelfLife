import type { Command } from '../../core/commands.js';
import type { DailyStatement } from '../economy/types.js';
import type { TripOutcome } from '../loyalty/types.js';

/**
 * Campaign & chapters (PLAN.md §12.3, §16 phase 2.1). See
 * docs/superpowers/specs/2026-09-02-campaign-chapters-design.md for the full design.
 */

export type ChapterStatus = 'inProgress' | 'complete';
export type LevelStatus = 'inProgress' | 'won' | 'lost';

export interface ShareThresholdObjective {
  readonly type: 'shareThreshold';
  readonly trailingWindowDays: number;
  readonly threshold: number;
}

/** A small closed union today — new types are added only when a later boss actually needs one. */
export type Objective = ShareThresholdObjective;

export interface EbitdaStreakLoseCondition {
  readonly type: 'ebitdaStreak';
  readonly maxNegativeDays: number;
}

export type LoseCondition = EbitdaStreakLoseCondition;

/** Text only — no UI consumes this yet (spec §1). */
export interface AdvisorLine {
  readonly advisor: string;
  readonly line: string;
}

export interface ChapterDef {
  readonly id: string;
  readonly title: string;
  /** Absent for a chapter that grants no new mechanic. */
  readonly mechanicUnlock?: string | undefined;
  readonly introCopy: AdvisorLine;
  readonly outroCopy: AdvisorLine;
  readonly objective: Objective;
}

/** Same shape as content/balance/harness.json5's `world` block (spec §5.1). */
export interface HouseholdGenerationConfig {
  readonly householdCount: number;
  readonly segmentMix: Readonly<Record<string, number>>;
  readonly catchmentMarginCells: number;
}

/** The Zod-validated, JSON5-authored part of a level (spec §4.1). */
export interface LevelContent {
  readonly id: string;
  readonly rivalId: string;
  readonly name: string;
  readonly chapters: readonly ChapterDef[];
  readonly loseCondition: LoseCondition;
  readonly households: HouseholdGenerationConfig;
}

/** `LevelContent` plus its hand-authored TypeScript fixture recipe (spec §4.1). */
export interface LevelDef extends LevelContent {
  readonly startingStore: readonly Command[];
}

export interface CampaignState {
  readonly levelId: string;
  /** 0-based, into `LevelDef.chapters`. */
  readonly chapterIndex: number;
  readonly chapterStatus: ChapterStatus;
  readonly levelStatus: LevelStatus;
}

/**
 * The slice of `MarketSystem`/`EconomySystem` `CampaignSystem` reads — declared here rather
 * than importing the concrete classes, the same narrow-reader pattern `loyalty/types.ts`'s
 * `MarketReader` and `rivals/types.ts`'s `RivalDeps` already establish. `MarketSystem`/
 * `EconomySystem` satisfy these structurally with no adapter needed (`campaignWorld.ts`, a
 * later task, passes them directly); a unit test can pass a small fake instead of wiring the
 * full system stack.
 */
export interface CampaignMarketReader {
  pendingOutcomes(): readonly TripOutcome[];
}

export interface CampaignEconomyReader {
  statements(): readonly DailyStatement[];
}
