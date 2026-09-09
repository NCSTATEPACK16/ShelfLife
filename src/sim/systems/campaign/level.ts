import { DEFAULT_RIVAL_STORES } from '../market/config.js';
import { DEFAULT_LEVEL_CONTENT } from './config.js';
import { STARTING_STORES } from './starting-stores.js';
import type { LevelDef } from './types.js';

/**
 * Joins a level's Zod-validated JSON5 content with its hand-authored starting-store recipe
 * into the full `LevelDef` the rest of the campaign system consumes (spec §4.1).
 */
export function buildLevelDef(levelId: string): LevelDef {
  const content = DEFAULT_LEVEL_CONTENT.get(levelId);
  if (!content) throw new Error(`Unknown level id: ${levelId}`);
  if (!DEFAULT_RIVAL_STORES.some((r) => r.id === content.rivalId)) {
    throw new Error(`Level "${levelId}" references unknown rival id: ${content.rivalId}`);
  }
  const startingStore = STARTING_STORES.get(levelId);
  if (!startingStore) throw new Error(`No starting-store recipe for level id: ${levelId}`);
  return { ...content, startingStore };
}

export const DEFAULT_LEVEL_IDS: readonly string[] = [...DEFAULT_LEVEL_CONTENT.keys()];
