import { describe, expect, it } from 'vitest';
import { buildLevelDef, DEFAULT_LEVEL_IDS } from './level.js';

describe('buildLevelDef', () => {
  it('joins content and starting store for a known level', () => {
    const level = buildLevelDef('l1');
    expect(level.id).toBe('l1');
    expect(level.rivalId).toBe('sav-a-lott');
    expect(level.startingStore.length).toBeGreaterThan(0);
    expect(level.chapters.length).toBeGreaterThan(0);
  });

  it('throws for an unknown level id', () => {
    expect(() => buildLevelDef('l99')).toThrow(/Unknown level id/);
  });
});

describe('DEFAULT_LEVEL_IDS', () => {
  it('lists l1, l2, and l3', () => {
    expect([...DEFAULT_LEVEL_IDS].sort()).toEqual(['l1', 'l2', 'l3']);
  });
});
