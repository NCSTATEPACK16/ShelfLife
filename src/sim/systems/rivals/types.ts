import type { RivalStore, Segment } from '../market/types.js';
import type { RivalsConfig } from './config.js';

/** Per-store trip tallies over the current weekly window. */
export interface RivalShare {
  readonly playerShare: number; // player's fraction of window trips
  readonly ownShare: number;    // this rival's fraction of window trips
}

/** A rival's evolving state: authored baseline + current derived terms + signature scratch. */
export interface RivalState {
  readonly base: RivalStore;    // authored, immutable
  derived: RivalStore;          // current effective terms (segment-independent parts)
  signature: Record<string, number>; // per-signature scalar scratch (e.g. congestion)
}

export interface RivalsView {
  effectiveStore(rivalIndex: number, segment: Segment): RivalStore;
  effectiveDecay(rivalIndex: number): number;
  stores(): readonly RivalStore[];
  count(): number;
}

export interface RivalDeps {
  outcomes(): readonly { readonly storeIndex: number }[]; // market.pendingOutcomes()
  playerPriceLevel(): number;                             // economy.priceLevel()
}

export interface RivalSignature {
  readonly id: string;
  weeklyTick(state: RivalState, share: RivalShare, config: RivalsConfig): void;
  shapeTerms(base: RivalStore, segment: Segment, state: RivalState, config: RivalsConfig): RivalStore;
}
