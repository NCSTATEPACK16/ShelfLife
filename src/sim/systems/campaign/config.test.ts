import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL_CONTENT, parseLevelContent } from './config.js';

const validRaw = {
  id: 'test-level',
  rivalId: 'sav-a-lott',
  name: 'Test Level',
  chapters: [
    {
      id: 'ch1',
      title: 'Chapter One',
      introCopy: { advisor: 'diane', line: 'Go.' },
      outroCopy: { advisor: 'diane', line: 'Done.' },
      objective: { type: 'shareThreshold', trailingWindowDays: 7, threshold: 0.2 },
    },
  ],
  loseCondition: { type: 'ebitdaStreak', maxNegativeDays: 14 },
  households: { householdCount: 10, segmentMix: { family: 1 }, catchmentMarginCells: 2 },
};

describe('parseLevelContent', () => {
  it('accepts well-formed content', () => {
    expect(parseLevelContent(validRaw).id).toBe('test-level');
  });

  it('rejects a level with zero chapters', () => {
    expect(() => parseLevelContent({ ...validRaw, chapters: [] })).toThrow();
  });

  it('rejects an unknown objective type', () => {
    const bad = {
      ...validRaw,
      chapters: [{ ...validRaw.chapters[0], objective: { type: 'unknownType', threshold: 0.2 } }],
    };
    expect(() => parseLevelContent(bad)).toThrow();
  });

  it('rejects an unknown lose-condition type', () => {
    expect(() => parseLevelContent({ ...validRaw, loseCondition: { type: 'bankruptcy' } })).toThrow();
  });

  it('rejects a chapter missing required copy', () => {
    const bad = {
      ...validRaw,
      chapters: [{ id: 'ch1', title: 'Chapter One', objective: validRaw.chapters[0]!.objective }],
    };
    expect(() => parseLevelContent(bad)).toThrow();
  });
});

describe('DEFAULT_LEVEL_CONTENT', () => {
  it('loads l1, l2, and l3 with at least one chapter each', () => {
    for (const id of ['l1', 'l2', 'l3']) {
      const content = DEFAULT_LEVEL_CONTENT.get(id);
      expect(content, `missing content for ${id}`).toBeDefined();
      expect(content!.chapters.length).toBeGreaterThan(0);
    }
  });

  it('keys the map by each level\'s own id', () => {
    expect(DEFAULT_LEVEL_CONTENT.get('l2')!.id).toBe('l2');
  });
});
