import { doNothingStrategy } from './do-nothing.js';
import { layoutOptimizerStrategy } from './layout-optimizer.js';
import { premiumStrategy } from './premium.js';
import { priceWarStrategy } from './price-war.js';
import { randomStrategy } from './random.js';
import { serviceStrategy } from './service.js';
import type { Strategy, StrategyName } from './types.js';

export * from './types.js';

const STRATEGIES: Readonly<Record<StrategyName, Strategy>> = {
  'do-nothing': doNothingStrategy,
  random: randomStrategy,
  'price-war': priceWarStrategy,
  premium: premiumStrategy,
  service: serviceStrategy,
  'layout-optimizer': layoutOptimizerStrategy,
};

export function strategyFor(name: StrategyName): Strategy {
  return STRATEGIES[name];
}
