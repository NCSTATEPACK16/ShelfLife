import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENTLE_SURFACE_CONTENT,
  parseGentleSurfaceContent,
  TELL_TERMS,
  thresholdFor,
} from './gentle-surface.js';

describe('parseGentleSurfaceContent', () => {
  it('loads all 15 declared terms from content/design/gentle-surface.json5', () => {
    expect(DEFAULT_GENTLE_SURFACE_CONTENT.size).toBe(15);
    for (const term of TELL_TERMS) {
      expect(DEFAULT_GENTLE_SURFACE_CONTENT.has(term)).toBe(true);
    }
  });

  it('exposes threshold lookup', () => {
    expect(thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'spoiledEncounters')).toBe(0);
    expect(thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'queuePenaltyBalk')).toBe(0.7);
  });

  it('throws if a required term is missing', () => {
    expect(() =>
      parseGentleSurfaceContent({
        satisfaction: [],
        impulse: [],
      }),
    ).toThrow(/Missing gentle-surface tell/);
  });

  it('throws on an unknown term id', () => {
    expect(() =>
      parseGentleSurfaceContent({
        satisfaction: [
          { term: 'bogus', bubble: 'x', animation: null, particle: null, worldMark: false, threshold: 0 },
        ],
        impulse: [],
      }),
    ).toThrow(/Unknown gentle-surface term/);
  });
});
