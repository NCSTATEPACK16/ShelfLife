import type { MarketConfig } from '../market/config.js';
import { DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { RivalStore } from '../market/types.js';
import type { RivalsConfig } from './config.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function deriveInitialTerms(
  base: RivalStore,
  config: RivalsConfig,
  market: MarketConfig = DEFAULT_MARKET_CONFIG,
): RivalStore {
  const p = base.personality;
  if (!p) return base;
  const d = config.derive;
  const priceIndex = Math.max(
    config.minPriceIndex,
    base.priceIndex - p.priceAggression * d.priceFromAggression,
  );
  const authoredDecay = base.loyaltyDecay ?? market.loyaltyDecayDefault;
  const loyaltyDecay = authoredDecay * (1 - (base.communityLove / 100) * d.decayFloorFromLove);
  return {
    ...base,
    quality: clamp01(base.quality + p.qualityInvestment * d.qualityFromInvestment),
    ambiance: clamp01(base.ambiance + p.marketingSpend * d.ambianceFromMarketing),
    priceIndex,
    loyaltyDecay,
  };
}
