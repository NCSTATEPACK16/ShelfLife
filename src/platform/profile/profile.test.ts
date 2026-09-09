import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../storage/index.js';
import { getProfile, isLevelUnlocked, markLevelComplete } from './index.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

describe('getProfile', () => {
  it('defaults to only l1 unlocked, nothing completed', async () => {
    expect(await getProfile()).toEqual({ unlockedLevelIds: ['l1'], completedLevelIds: [] });
  });
});

describe('isLevelUnlocked', () => {
  it('l1 is unlocked by default, l2 is not', async () => {
    expect(await isLevelUnlocked('l1')).toBe(true);
    expect(await isLevelUnlocked('l2')).toBe(false);
  });
});

describe('markLevelComplete', () => {
  it('adds the level to completedLevelIds and unlocks its successor', async () => {
    const profile = await markLevelComplete('l1');
    expect(profile.completedLevelIds).toEqual(['l1']);
    expect(profile.unlockedLevelIds).toEqual(['l1', 'l2']);
    expect(await isLevelUnlocked('l2')).toBe(true);
  });

  it('is idempotent: completing the same level twice does not duplicate it', async () => {
    await markLevelComplete('l1');
    const profile = await markLevelComplete('l1');
    expect(profile.completedLevelIds).toEqual(['l1']);
    expect(profile.unlockedLevelIds).toEqual(['l1', 'l2']);
  });

  it('persists across calls via the shared store', async () => {
    await markLevelComplete('l1');
    const profile = await getProfile();
    expect(profile.completedLevelIds).toEqual(['l1']);
  });

  it('a level with no successor in the unlock table unlocks nothing new', async () => {
    // l3 is the last authored level (Task 6) — no l4 exists yet.
    const profile = await markLevelComplete('l3');
    expect(profile.completedLevelIds).toEqual(['l3']);
    expect(profile.unlockedLevelIds).toEqual(['l1']);
  });
});
