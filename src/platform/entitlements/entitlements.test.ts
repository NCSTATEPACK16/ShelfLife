import { describe, expect, it } from 'vitest';
import { canPlay, checkEntitlement } from './index.js';

describe('entitlements', () => {
  it('grants everything in v1', () => {
    expect(canPlay('l01-sav-a-lott', 0)).toBe(true);
    expect(canPlay('l10-trailblazer-jims', 4)).toBe(true);
  });

  it('reports a reason, so a future paywall has somewhere to put its message', () => {
    expect(checkEntitlement({ levelId: 'l01-sav-a-lott', chapterIndex: 0 })).toEqual({
      allowed: true,
      reason: 'granted',
    });
  });
});
