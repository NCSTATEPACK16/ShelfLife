import { getStore } from '../storage/index.js';

/**
 * The cross-run unlock tree (PLAN.md §16 phase 2.1, spec §6). Separate from any single level's
 * save — a level save is `{ version, levelId, seed, tick, commandLog }` (`src/sim/campaignWorld.ts`);
 * this outlives any individual save and is never duplicated into one.
 */

export interface ProfileState {
  readonly unlockedLevelIds: readonly string[];
  readonly completedLevelIds: readonly string[];
}

const PROFILE_KEY = 'profile:v1';

/** Level id -> the level it unlocks on completion. Extended as bosses 4-10 land (phase 5.1). */
const UNLOCK_TABLE: ReadonlyMap<string, string> = new Map([
  ['l1', 'l2'],
  ['l2', 'l3'],
]);

const DEFAULT_PROFILE: ProfileState = { unlockedLevelIds: ['l1'], completedLevelIds: [] };

export async function getProfile(): Promise<ProfileState> {
  const stored = await getStore().read<ProfileState>(PROFILE_KEY);
  return stored ?? DEFAULT_PROFILE;
}

export async function markLevelComplete(levelId: string): Promise<ProfileState> {
  const profile = await getProfile();
  const completedLevelIds = profile.completedLevelIds.includes(levelId)
    ? profile.completedLevelIds
    : [...profile.completedLevelIds, levelId];

  const next = UNLOCK_TABLE.get(levelId);
  const unlockedLevelIds =
    next && !profile.unlockedLevelIds.includes(next)
      ? [...profile.unlockedLevelIds, next]
      : profile.unlockedLevelIds;

  const updated: ProfileState = { unlockedLevelIds, completedLevelIds };
  await getStore().write(PROFILE_KEY, updated);
  return updated;
}

export async function isLevelUnlocked(levelId: string): Promise<boolean> {
  const profile = await getProfile();
  return profile.unlockedLevelIds.includes(levelId);
}
