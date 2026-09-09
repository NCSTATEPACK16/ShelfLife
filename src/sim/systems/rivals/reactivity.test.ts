import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import { reactWeekly } from './reactivity.js';

const base = parseRivalStore(JSON5.parse(savALott));

describe('reactWeekly', () => {
  it('strictly cuts price when losing share, even when already cheaper than the player', () => {
    const losing = { playerShare: 0.8, ownShare: 0.2 };
    const next = reactWeekly(base, losing, 1.0, DEFAULT_RIVALS_CONFIG);
    expect(next.priceIndex).toBeLessThan(base.priceIndex);
    expect(next.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
  });
  it('lifts ambiance when the player is taking share', () => {
    const losing = { playerShare: 0.9, ownShare: 0.1 };
    expect(reactWeekly(base, losing, 1.0, DEFAULT_RIVALS_CONFIG).ambiance).toBeGreaterThanOrEqual(
      base.ambiance,
    );
  });
  it('keeps all terms in domain across extreme inputs', () => {
    for (const s of [
      { playerShare: 1, ownShare: 0 },
      { playerShare: 0, ownShare: 1 },
    ]) {
      const n = reactWeekly(base, s, 2, DEFAULT_RIVALS_CONFIG);
      for (const t of [n.quality, n.service, n.ambiance]) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
      expect(n.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
    }
  });
});
