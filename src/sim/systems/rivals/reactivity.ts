import type { RivalStore } from '../market/types.js';
import type { RivalsConfig } from './config.js';
import type { RivalShare } from './types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Pure, RNG-free weekly reaction (PLAN.md §5.8, "checked weekly, not daily"). Only reacts
 * while the rival is losing share to the player — a rival holding or gaining share has no
 * pressure to move. `priceAggression × reactivity` pulls `priceIndex` toward undercutting
 * `playerPriceLevel` — never toward the rival's own current price, which was the bug: a rival
 * already cheaper than the player had nothing to move toward and stayed frozen regardless of
 * `priceAggression`. `qualityInvestment` splits the price reaction between price and quality;
 * `marketingSpend` drives the ambiance response, on the base (non-price-scaled) magnitude, same
 * as before this fix. `service` is untouched here — that's a signature's domain (e.g.
 * `oneRegister`), not the general reactive tick.
 */
export function reactWeekly(
  current: RivalStore,
  share: RivalShare,
  playerPriceLevel: number,
  config: RivalsConfig,
): RivalStore {
  const p = current.personality;
  if (!p) return current;

  const shareDeficit = clamp01(share.playerShare - share.ownShare);
  if (shareDeficit === 0) return current;

  const magnitude = p.reactivity * config.reactionRate * shareDeficit;
  const priceMagnitude = p.priceAggression * magnitude;
  const priceTarget = playerPriceLevel * (1 - config.undercutFraction * p.priceAggression);
  const priceIndex = Math.max(
    config.minPriceIndex,
    current.priceIndex + (priceTarget - current.priceIndex) * priceMagnitude * (1 - p.qualityInvestment),
  );
  const quality = clamp01(current.quality + p.qualityInvestment * magnitude);
  const ambiance = clamp01(current.ambiance + p.marketingSpend * magnitude);

  return { ...current, priceIndex, quality, ambiance };
}
