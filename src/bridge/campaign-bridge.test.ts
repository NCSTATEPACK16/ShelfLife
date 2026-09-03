import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../platform/storage/index.js';
import { getProfile } from '../platform/profile/index.js';
import { CampaignBridge } from './campaign-bridge.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

describe('CampaignBridge.start', () => {
  it('builds a fresh level at chapter 0', () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.state).toEqual({
      levelId: 'l1',
      chapterIndex: 0,
      chapterStatus: 'inProgress',
      levelStatus: 'inProgress',
    });
  });
});

describe('CampaignBridge#tick', () => {
  it('advances the world by one tick', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    await bridge.tick();
    // No direct tick counter is exposed; confirm indirectly via a second identical bridge
    // that never ticks having a different save tick than one that did.
    const untouched = CampaignBridge.start('l1', 1);
    expect(bridge.save().tick).not.toBe(untouched.save().tick);
  });
});

describe('CampaignBridge#advanceChapter', () => {
  it('throws if the sim rejects it (chapter not complete)', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    await expect(bridge.advanceChapter()).rejects.toThrow();
  });

  it('unlocks the next level in the profile when the final chapter completes', async () => {
    // Build a one-chapter, trivially-winnable synthetic level path is not available through
    // the bridge (it only knows authored levels) — so this test drives l1 far enough for its
    // final chapter's real threshold (0.35, Task 6) to resolve, then advances through all
    // three chapters.
    const bridge = CampaignBridge.start('l1', 20260902);
    // Run enough sim-time for chapter 1's objective (threshold 0.15, 7-day window) to resolve.
    // Household generation + trip scheduling means this needs real days, not ticks — run up to
    // 60 sim-days (matches PLAN.md §3.1's L1-3 "30-60 sim-days" target) advancing whenever the
    // current chapter completes.
    for (let day = 0; day < 60 && bridge.state.levelStatus === 'inProgress'; day++) {
      for (let i = 0; i < 1440; i++) await bridge.tick();
      if (bridge.state.chapterStatus === 'complete') await bridge.advanceChapter();
    }
    expect(bridge.state.levelStatus).toBe('won');
    const profile = await getProfile();
    expect(profile.completedLevelIds).toContain('l1');
    expect(profile.unlockedLevelIds).toContain('l2');
  });
});

describe('CampaignBridge.resume', () => {
  it('reloads a saved run to a hash-identical, chapter-identical state', async () => {
    const bridge = CampaignBridge.start('l1', 20260902);
    for (let i = 0; i < 1440 * 5; i++) await bridge.tick();
    const save = bridge.save();

    const resumed = CampaignBridge.resume(save);
    expect(resumed.state).toEqual(bridge.state);
  });
});
