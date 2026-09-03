import type { GentleSurfaceContent, TellTerm } from '../sim/content/gentle-surface.js';
import { worldToScreen } from './iso.js';

export interface TellOccurrence {
  readonly shopperId: number;
  readonly term: TellTerm;
  readonly magnitude: number;
}

export interface TellMarker {
  readonly x: number;
  readonly y: number;
  readonly bubbleId: string;
  readonly shopperId: number;
}

/**
 * §3's "silence is a feature" rules, applied in the view since the sim already resolved
 * per-term thresholds/mutual exclusion: one bubble per shopper (highest magnitude wins),
 * then a hard cap on simultaneous markers (roughly 8 at `regular`, 4 at `compact` —
 * caller passes the number, resolved from `src/platform/layout`).
 */
export function buildTellDrawPlan(
  events: readonly TellOccurrence[],
  content: GentleSurfaceContent,
  shopperPositions: ReadonlyMap<number, { x: number; y: number }>,
  origin: { x: number; y: number },
  maxSimultaneous: number,
): readonly TellMarker[] {
  const bestPerShopper = new Map<number, TellOccurrence>();
  for (const event of events) {
    const current = bestPerShopper.get(event.shopperId);
    if (!current || event.magnitude > current.magnitude) {
      bestPerShopper.set(event.shopperId, event);
    }
  }

  const candidates = [...bestPerShopper.values()]
    .filter((e) => shopperPositions.has(e.shopperId))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, maxSimultaneous);

  const markers: TellMarker[] = [];
  for (const event of candidates) {
    const bubble = content.get(event.term)?.bubble;
    if (!bubble) continue; // world-mark-only or animation-only terms have no bubble to draw here
    const position = shopperPositions.get(event.shopperId)!;
    const screen = worldToScreen(position.x, position.y, origin);
    markers.push({ x: screen.x, y: screen.y, bubbleId: bubble, shopperId: event.shopperId });
  }
  return markers;
}
