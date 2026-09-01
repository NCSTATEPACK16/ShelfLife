import type { RivalStore } from '../market/types.js';
import type { RivalsConfig } from './config.js';
import type { RivalShare } from './types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Pure, RNG-free weekly reaction (PLAN.md §5.8, "checked weekly, not daily"). Only reacts
 * while the rival is losing share to the player — a rival holding or gaining share has no
 * pressure to move. Reaction magnitude scales with `personality.reactivity` and how much
 * share is being lost; `qualityInvestment` splits the price-vs-quality response, and
 * `marketingSpend` drives the ambiance response. `service` is untouched here — that's a
 * signature's domain (e.g. `oneRegister`), not the general reactive tick.
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
  const priceTarget = Math.min(current.priceIndex, playerPriceLevel);
  const priceIndex = Math.max(
    config.minPriceIndex,
    current.priceIndex + (priceTarget - current.priceIndex) * magnitude * (1 - p.qualityInvestment),
  );
  const quality = clamp01(current.quality + p.qualityInvestment * magnitude);
  const ambiance = clamp01(current.ambiance + p.marketingSpend * magnitude);

  return { ...current, priceIndex, quality, ambiance };
}
