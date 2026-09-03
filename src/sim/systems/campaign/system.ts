import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { computeShareTrajectory, computeWinResult, ebitdaStreakBreached, TripCounter } from './objectives.js';
import type {
  CampaignEconomyReader,
  CampaignMarketReader,
  CampaignState,
  ChapterStatus,
  LevelDef,
  LevelStatus,
} from './types.js';

/** A campaign world's rival roster is always exactly the level's one boss (spec §5.1). */
const TARGET_STORE_INDEX = 1;

export class ChapterNotAdvanceableError extends Error {}

/**
 * Campaign & chapters (PLAN.md §12.3, §16 phase 2.1). Registered last in the world's system
 * chain — it only reads other systems' state, never drives them (spec §3). Takes narrow
 * reader interfaces rather than the concrete `MarketSystem`/`EconomySystem` classes — see
 * this task's "Why not the concrete classes directly" note.
 */
export class CampaignSystem implements System {
  readonly name = 'campaign';
  readonly #market: CampaignMarketReader;
  readonly #economy: CampaignEconomyReader;
  readonly #level: LevelDef;
  readonly #tripCounter = new TripCounter();
  #chapterIndex = 0;
  #chapterStatus: ChapterStatus = 'inProgress';
  #levelStatus: LevelStatus = 'inProgress';

  constructor(market: CampaignMarketReader, economy: CampaignEconomyReader, level: LevelDef) {
    this.#market = market;
    this.#economy = economy;
    this.#level = level;
  }

  get level(): LevelDef {
    return this.#level;
  }

  update(world: World): void {
    this.#tripCounter.recordTick(this.#market.pendingOutcomes(), TARGET_STORE_INDEX);
    if (world.tick % TICKS_PER_SIM_DAY !== 0) return;
    this.#tripCounter.closeDay();

    if (this.#levelStatus !== 'inProgress') return;

    if (this.#chapterStatus === 'inProgress') {
      const chapter = this.#level.chapters[this.#chapterIndex]!;
      const trajectory = computeShareTrajectory(this.#tripCounter.dailyCounts(), chapter.objective.trailingWindowDays);
      const { won } = computeWinResult(trajectory, chapter.objective.threshold);
      if (won) {
        this.#chapterStatus = 'complete';
        world.events.emit({ type: 'chapterComplete', levelId: this.#level.id, chapterIndex: this.#chapterIndex });
      }
    }

    if (ebitdaStreakBreached(this.#economy.statements(), this.#level.loseCondition.maxNegativeDays)) {
      this.#levelStatus = 'lost';
      world.events.emit({ type: 'levelLost', levelId: this.#level.id });
    }
  }

  hash(_world: World, hasher: Hasher): void {
    hasher.str(this.#level.id).u32(this.#chapterIndex).str(this.#chapterStatus).str(this.#levelStatus);
    const daily = this.#tripCounter.dailyCounts();
    hasher.u32(daily.length);
    for (const d of daily) hasher.u32(d.player).u32(d.target);
  }

  applyCommand(world: World, command: Command): boolean {
    if (command.type !== 'advanceChapter') return false;
    if (this.#chapterStatus !== 'complete' || this.#levelStatus !== 'inProgress') {
      throw new ChapterNotAdvanceableError(
        `Cannot advance chapter ${this.#chapterIndex} of level "${this.#level.id}": objective not yet met`,
      );
    }
    const isLastChapter = this.#chapterIndex === this.#level.chapters.length - 1;
    if (isLastChapter) {
      this.#levelStatus = 'won';
      world.events.emit({ type: 'levelWon', levelId: this.#level.id });
    } else {
      this.#chapterIndex += 1;
      this.#chapterStatus = 'inProgress';
      world.events.emit({ type: 'chapterStarted', levelId: this.#level.id, chapterIndex: this.#chapterIndex });
    }
    return true;
  }

  objectiveProgress(): { readonly current: number; readonly target: number } {
    if (this.#levelStatus !== 'inProgress' || this.#chapterStatus !== 'inProgress') {
      return { current: 1, target: 1 };
    }
    const chapter = this.#level.chapters[this.#chapterIndex]!;
    const trajectory = computeShareTrajectory(this.#tripCounter.dailyCounts(), chapter.objective.trailingWindowDays);
    const last = trajectory[trajectory.length - 1];
    return { current: Number.isNaN(last) ? 0 : (last ?? 0), target: chapter.objective.threshold };
  }

  state(): CampaignState {
    return {
      levelId: this.#level.id,
      chapterIndex: this.#chapterIndex,
      chapterStatus: this.#chapterStatus,
      levelStatus: this.#levelStatus,
    };
  }
}
