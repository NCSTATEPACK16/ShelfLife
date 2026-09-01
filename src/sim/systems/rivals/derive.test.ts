import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import { deriveInitialTerms } from './derive.js';

const base = parseRivalStore(JSON5.parse(savALott));

describe('deriveInitialTerms', () => {
  it('pushes priceIndex down for an aggressive discounter but never below the floor', () => {
    const d = deriveInitialTerms(base, DEFAULT_RIVALS_CONFIG);
    expect(d.priceIndex).toBeLessThanOrEqual(base.priceIndex);
    expect(d.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
  });
  it('keeps every term inside its domain', () => {
    const d = deriveInitialTerms(base, DEFAULT_RIVALS_CONFIG);
    for (const t of [d.quality, d.service, d.ambiance, d.assortmentBreadth]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
  it('is a no-op for a rival without a personality', () => {
    const { personality, ...noPersona } = base;
    expect(deriveInitialTerms(noPersona as typeof base, DEFAULT_RIVALS_CONFIG)).toEqual(noPersona);
  });
  it('lowers effective loyaltyDecay as community love rises', () => {
    const low = deriveInitialTerms({ ...base, communityLove: 10 }, DEFAULT_RIVALS_CONFIG);
    const high = deriveInitialTerms({ ...base, communityLove: 90 }, DEFAULT_RIVALS_CONFIG);
    expect(high.loyaltyDecay!).toBeLessThan(low.loyaltyDecay!);
  });
});
