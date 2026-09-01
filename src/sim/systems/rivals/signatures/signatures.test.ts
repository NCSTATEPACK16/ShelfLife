import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import bulkhaus from '../../../../../content/rivals/bulkhaus-club.json5?raw';
import savALott from '../../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from '../config.js';
import type { RivalState } from '../types.js';
import { signatureFor } from './index.js';

const stateOf = (raw: string): RivalState => {
  const base = parseRivalStore(JSON5.parse(raw));
  return { base, derived: { ...base }, signature: {} };
};

describe('signatures', () => {
  it('oneRegister degrades service under sustained high own-share', () => {
    const sig = signatureFor('oneRegister');
    const s = stateOf(savALott);
    const before = s.derived.service;
    sig.weeklyTick(s, { playerShare: 0.1, ownShare: 0.9 }, DEFAULT_RIVALS_CONFIG);
    expect(s.derived.service).toBeLessThan(before);
  });

  it('neverCloses bumps service for convenience but not foodie', () => {
    const sig = signatureFor('neverCloses');
    const s = stateOf(savALott);
    const conv = sig.shapeTerms(s.derived, 'convenience', s, DEFAULT_RIVALS_CONFIG);
    const food = sig.shapeTerms(s.derived, 'foodie', s, DEFAULT_RIVALS_CONFIG);
    expect(conv.service).toBeGreaterThan(food.service);
  });

  it('membershipLockIn lowers effective decay and bumps assortment for bulk', () => {
    const sig = signatureFor('membershipLockIn');
    const s = stateOf(bulkhaus);
    sig.weeklyTick(s, { playerShare: 0.5, ownShare: 0.5 }, DEFAULT_RIVALS_CONFIG);
    expect(s.derived.loyaltyDecay!).toBeLessThan(s.base.loyaltyDecay ?? 1);
    const bulk = sig.shapeTerms(s.derived, 'bulk', s, DEFAULT_RIVALS_CONFIG);
    expect(bulk.assortmentBreadth).toBeGreaterThan(s.derived.assortmentBreadth);
  });
});
