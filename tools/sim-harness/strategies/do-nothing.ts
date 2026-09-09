import type { Strategy } from './types.js';

export const doNothingStrategy: Strategy = {
  name: 'do-nothing',
  decide: () => [],
};
