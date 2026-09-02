import { describe, expect, it } from 'vitest';
import { STRATEGY_NAMES } from './types.js';
import { strategyFor } from './index.js';

describe('strategyFor', () => {
  it('returns a strategy whose name matches for every declared name', () => {
    for (const name of STRATEGY_NAMES) {
      expect(strategyFor(name).name).toBe(name);
    }
  });
});
