import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import type { DailyStatement } from '../economy/types.js';
import type { TripOutcome } from '../loyalty/types.js';
import { CampaignSystem, ChapterNotAdvanceableError } from './system.js';
import type { CampaignEconomyReader, CampaignMarketReader, LevelDef } from './types.js';

const TWO_CHAPTER_LEVEL: LevelDef = {
  id: 'test-level',
  rivalId: 'sav-a-lott',
  name: 'Test Level',
  chapters: [
    {
      id: 'ch1',
      title: 'Chapter One',
      introCopy: { advisor: 'diane', line: 'Go.' },
      outroCopy: { advisor: 'diane', line: 'Done.' },
      objective: { type: 'shareThreshold', trailingWindowDays: 1, threshold: 0.5 },
    },
    {
      id: 'ch2',
      title: 'Chapter Two',
      introCopy: { advisor: 'diane', line: 'Go again.' },
      outroCopy: { advisor: 'diane', line: 'Won.' },
      objective: { type: 'shareThreshold', trailingWindowDays: 1, threshold: 0.8 },
    },
  ],
  loseCondition: { type: 'ebitdaStreak', maxNegativeDays: 2 },
  households: { householdCount: 0, segmentMix: {}, catchmentMarginCells: 0 },
  startingStore: [],
};

/** A single outcome is visible for exactly one `pendingOutcomes()` read, mirroring how the
 *  real `MarketSystem#pendingOutcomes()` only holds the current tick's outcomes. */
class FakeMarketReader implements CampaignMarketReader {
  #outcomes: readonly TripOutcome[] = [];

  queueOutcome(outcome: TripOutcome): void {
    this.#outcomes = [outcome];
  }

  pendingOutcomes(): readonly TripOutcome[] {
    const outcomes = this.#outcomes;
    this.#outcomes = [];
    return outcomes;
  }
}

class FakeEconomyReader implements CampaignEconomyReader {
  #statements: DailyStatement[] = [];

  pushDay(ebitda: number): void {
    this.#statements.push({
      day: this.#statements.length,
      revenue: 0,
      cogs: 0,
      labor: 0,
      rent: 0,
      utilities: 0,
      marketing: 0,
      shrink: 0,
      spoilage: 0,
      ebitda,
    });
  }

  statements(): readonly DailyStatement[] {
    return this.#statements;
  }
}

function testWorld(level: LevelDef, seed = 1) {
  const world = new World({ seed });
  const market = new FakeMarketReader();
  const economy = new FakeEconomyReader();
  const campaign = new CampaignSystem(market, economy, level);
  world.register(campaign);
  return { world, market, economy, campaign };
}

describe('CampaignSystem', () => {
  it('starts in progress at chapter 0', () => {
    const { campaign } = testWorld(TWO_CHAPTER_LEVEL);
    expect(campaign.state()).toEqual({
      levelId: 'test-level',
      chapterIndex: 0,
      chapterStatus: 'inProgress',
      levelStatus: 'inProgress',
    });
  });

  it('completes the current chapter once its objective is met, and fires an event', () => {
    const { world, market, campaign } = testWorld(TWO_CHAPTER_LEVEL);
    market.queueOutcome({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    for (let i = 0; i < 1440; i++) world.step();
    expect(campaign.state().chapterStatus).toBe('complete');
    const chapterCompleteEvents = world.events.drain().filter((e) => e.type === 'chapterComplete');
    expect(chapterCompleteEvents).toHaveLength(1);
  });

  it('advanceChapter throws before the objective is met', () => {
    const { world } = testWorld(TWO_CHAPTER_LEVEL);
    world.commands.push({ type: 'advanceChapter' });
    expect(() => world.step()).toThrow(ChapterNotAdvanceableError);
  });

  it('advanceChapter moves to the next chapter once complete, resetting chapterStatus', () => {
    const { world, market, campaign } = testWorld(TWO_CHAPTER_LEVEL);
    market.queueOutcome({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    for (let i = 0; i < 1440; i++) world.step();
    expect(campaign.state().chapterStatus).toBe('complete');

    world.commands.push({ type: 'advanceChapter' });
    world.step();
    expect(campaign.state()).toMatchObject({ chapterIndex: 1, chapterStatus: 'inProgress', levelStatus: 'inProgress' });
  });

  it('advanceChapter on the last chapter sets levelStatus to won', () => {
    const oneChapterLevel: LevelDef = { ...TWO_CHAPTER_LEVEL, chapters: [TWO_CHAPTER_LEVEL.chapters[0]!] };
    const { world, market, campaign } = testWorld(oneChapterLevel);
    market.queueOutcome({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    for (let i = 0; i < 1440; i++) world.step();
    expect(campaign.state().chapterStatus).toBe('complete');

    world.commands.push({ type: 'advanceChapter' });
    world.step();
    expect(campaign.state().levelStatus).toBe('won');
  });

  it('sustained negative EBITDA sets levelStatus to lost regardless of chapter progress', () => {
    const { world, economy, campaign } = testWorld(TWO_CHAPTER_LEVEL);
    economy.pushDay(-500);
    for (let i = 0; i < 1440; i++) world.step();
    expect(campaign.state().levelStatus).toBe('inProgress');

    economy.pushDay(-500);
    for (let i = 0; i < 1440; i++) world.step();
    expect(campaign.state().levelStatus).toBe('lost');
  });

  it('applyCommand ignores commands it does not own', () => {
    const { world, campaign } = testWorld(TWO_CHAPTER_LEVEL);
    expect(campaign.applyCommand(world, { type: 'pause' })).toBe(false);
  });

  it('exposes the level it was built with', () => {
    const { campaign } = testWorld(TWO_CHAPTER_LEVEL);
    expect(campaign.level.id).toBe('test-level');
  });

  it('objectiveProgress reports 0 before any trips and the real trailing share after some', () => {
    const { world, market, campaign } = testWorld(TWO_CHAPTER_LEVEL);
    expect(campaign.objectiveProgress()).toEqual({ current: 0, target: 0.5 });

    // A target-store-only trip (never crosses the 0.5 threshold, so the chapter stays
    // inProgress) still moves dailyCounts off empty — proves the trajectory read is real,
    // not just the empty-array early-return case above.
    market.queueOutcome({ householdId: 1, storeIndex: 1, satisfaction: 1 });
    for (let i = 0; i < 1440; i++) world.step();
    expect(campaign.state().chapterStatus).toBe('inProgress');
    expect(campaign.objectiveProgress()).toEqual({ current: 0, target: 0.5 });
  });

  it('objectiveProgress reports 1/1 once the level is no longer in progress', () => {
    const oneChapterLevel: LevelDef = { ...TWO_CHAPTER_LEVEL, chapters: [TWO_CHAPTER_LEVEL.chapters[0]!] };
    const { world, market, campaign } = testWorld(oneChapterLevel);
    market.queueOutcome({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    for (let i = 0; i < 1440; i++) world.step();
    world.commands.push({ type: 'advanceChapter' });
    world.step();
    expect(campaign.state().levelStatus).toBe('won');
    expect(campaign.objectiveProgress()).toEqual({ current: 1, target: 1 });
  });

  it('hash changes when chapterStatus changes, stable otherwise', () => {
    const a = testWorld(TWO_CHAPTER_LEVEL);
    const b = testWorld(TWO_CHAPTER_LEVEL);
    expect(a.world.hash).toBe(b.world.hash);

    a.market.queueOutcome({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    for (let i = 0; i < 1440; i++) a.world.step();
    for (let i = 0; i < 1440; i++) b.world.step(); // no trip outcome ever queued

    expect(a.campaign.state().chapterStatus).toBe('complete');
    expect(b.campaign.state().chapterStatus).toBe('inProgress');
    expect(a.world.hash).not.toBe(b.world.hash);
  });
});
