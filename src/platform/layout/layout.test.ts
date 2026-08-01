import { describe, expect, it } from 'vitest';
import { breakpointFor, MIN_HIT_TARGET_PX, REGULAR_MIN_WIDTH } from './index.js';

describe('breakpoints', () => {
  it('treats an iPhone as compact', () => {
    expect(breakpointFor(390)).toBe('compact'); // iPhone 14/15
    expect(breakpointFor(430)).toBe('compact'); // iPhone Pro Max
  });

  it('treats a tablet and desktop as regular', () => {
    expect(breakpointFor(768)).toBe('regular'); // iPad portrait
    expect(breakpointFor(1440)).toBe('regular');
  });

  it('puts the boundary exactly at REGULAR_MIN_WIDTH', () => {
    expect(breakpointFor(REGULAR_MIN_WIDTH - 1)).toBe('compact');
    expect(breakpointFor(REGULAR_MIN_WIDTH)).toBe('regular');
  });

  it('has only two breakpoints, per PLAN.md §7.2', () => {
    const widths = [320, 390, 430, 600, 768, 1024, 1440, 2560];
    const seen = new Set(widths.map(breakpointFor));
    expect([...seen].sort()).toEqual(['compact', 'regular']);
  });

  it('keeps the iOS HIG minimum hit target', () => {
    expect(MIN_HIT_TARGET_PX).toBeGreaterThanOrEqual(44);
  });
});
