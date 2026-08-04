import type { GoodDef } from '../goods/types.js';
import { indexToFit, type StoreTerms } from './choice.js';
import type { MarketConfig } from './config.js';
import type { RivalStore } from './types.js';

/**
 * Turning live sim state into §5.1's utility terms.
 *
 * Kept pure and dependency-injected rather than reaching into systems directly, so the
 * mapping can be tested against stub numbers instead of a whole constructed world.
 */

export interface PlayerTermDeps {
  readonly list: readonly string[];
  readonly catalog: readonly GoodDef[];
  readonly tick: number;
  readonly priceOf: (goodId: string, tick: number) => number;
  readonly referencePriceOf: (goodId: string) => number;
  readonly stockOf: (goodId: string) => number;
  readonly freshnessOf: (goodId: string, tick: number) => number;
  readonly serviceScore: () => number;
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
  readonly config: MarketConfig;
}

export interface RivalTermDeps {
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
  readonly config: MarketConfig;
}

export const PLAYER_STORE_ID = 'player';

export function playerStoreTerms(deps: PlayerTermDeps): StoreTerms {
  // priceFit: this household's actual list, costed at live prices against catalog
  // reference. A household whose list is empty has nothing to compare, so it sees the
  // neutral index rather than a divide-by-zero.
  let actual = 0;
  let reference = 0;
  for (const goodId of deps.list) {
    actual += deps.priceOf(goodId, deps.tick);
    reference += deps.referencePriceOf(goodId);
  }
  const priceIndex = reference > 0 ? actual / reference : 1;

  // assortmentFit: fraction of the list that is stocked AND actually has units.
  const available = deps.list.filter((goodId) => deps.stockOf(goodId) > 0).length;
  const assortmentFit = deps.list.length === 0 ? 1 : available / deps.list.length;

  // quality: mean freshness across everything currently in stock. Store-level, not
  // list-level — a shopper judges the shelves they walk past, not only their own list.
  let freshnessTotal = 0;
  let stockedCount = 0;
  for (const good of deps.catalog) {
    if (deps.stockOf(good.id) <= 0) continue;
    freshnessTotal += deps.freshnessOf(good.id, deps.tick);
    stockedCount++;
  }
  const quality = stockedCount === 0 ? 0 : freshnessTotal / stockedCount;

  return {
    storeId: PLAYER_STORE_ID,
    priceFit: indexToFit(priceIndex, deps.config.priceFitNeutral),
    assortmentFit,
    quality,
    service: deps.serviceScore(),
    // STUB: no cleanliness system exists (PLAN.md §4). A real term, a fake input.
    ambiance: deps.config.playerAmbiance,
    loyalty: deps.loyalty,
    brandAffinity: deps.brandAffinity,
    travelCost: deps.travelCost,
  };
}

export function rivalStoreTerms(rival: RivalStore, deps: RivalTermDeps): StoreTerms {
  return {
    storeId: rival.id,
    priceFit: indexToFit(rival.priceIndex, deps.config.priceFitNeutral),
    assortmentFit: rival.assortmentBreadth,
    quality: rival.quality,
    service: rival.service,
    ambiance: rival.ambiance,
    loyalty: deps.loyalty,
    brandAffinity: deps.brandAffinity,
    travelCost: deps.travelCost,
  };
}
