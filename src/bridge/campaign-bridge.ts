import { canPlay } from '../platform/entitlements/index.js';
import { markLevelComplete } from '../platform/profile/index.js';
import {
  buildCampaignWorld,
  loadCampaignWorld,
  type CampaignState,
  type CampaignSystem,
  type SaveEnvelope,
  type World,
} from '../sim/index.js';

/**
 * The bridge integration point for real campaign play (spec §7) — same shape and role as
 * `BuildModeBridge` (`src/bridge/build-bridge.ts`), built on `buildCampaignWorld`/
 * `loadCampaignWorld` rather than registering its own systems. No UI consumes this yet; it
 * exists so the phase 2.1 gate can be proven end to end (Task 14) without inventing a
 * throwaway test-only path.
 */
export class CampaignBridge {
  readonly #world: World;
  #campaign: CampaignSystem;

  private constructor(world: World, campaign: CampaignSystem) {
    this.#world = world;
    this.#campaign = campaign;
  }

  static start(levelId: string, seed: number): CampaignBridge {
    if (!canPlay(levelId, 0)) {
      throw new Error(`Not entitled to play level "${levelId}"`);
    }
    const { world, campaign } = buildCampaignWorld(levelId, seed);
    return new CampaignBridge(world, campaign);
  }

  static resume(save: SaveEnvelope): CampaignBridge {
    const { world, campaign } = loadCampaignWorld(save);
    const state = campaign.state();
    if (!canPlay(state.levelId, state.chapterIndex)) {
      throw new Error(`Not entitled to resume level "${state.levelId}" at chapter ${state.chapterIndex}`);
    }
    return new CampaignBridge(world, campaign);
  }

  get state(): CampaignState {
    return this.#campaign.state();
  }

  async tick(): Promise<void> {
    this.#world.step();
    await this.#handleEvents();
  }

  /**
   * Pushes `advanceChapter`. Throws `ChapterNotAdvanceableError` (from `src/sim`) if the sim
   * itself rejects it — the objective genuinely isn't met yet. Returns `false` without
   * touching the world if entitlements deny the *next* chapter/level (today, `canPlay` always
   * grants — see `src/platform/entitlements`).
   */
  async advanceChapter(): Promise<boolean> {
    const before = this.state;
    const isLastChapter = before.chapterIndex === this.#campaign.level.chapters.length - 1;
    const targetChapterIndex = isLastChapter ? before.chapterIndex : before.chapterIndex + 1;
    if (!canPlay(before.levelId, targetChapterIndex)) return false;

    this.#world.commands.push({ type: 'advanceChapter' });
    this.#world.step();
    await this.#handleEvents();
    return true;
  }

  save(): SaveEnvelope {
    return {
      version: 1,
      levelId: this.state.levelId,
      seed: this.#world.seed,
      tick: this.#world.tick,
      commandLog: this.#world.commands.log,
    };
  }

  async #handleEvents(): Promise<void> {
    for (const event of this.#world.events.drain()) {
      if (event.type === 'levelWon') {
        await markLevelComplete(event.levelId);
      }
    }
  }
}
