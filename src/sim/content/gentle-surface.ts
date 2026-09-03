import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../content/design/gentle-surface.json5?raw';

export const SATISFACTION_TELL_TERMS = [
  'fillRateMiss',
  'priceSurpriseNegative',
  'priceSurprisePositive',
  'queuePenaltyRising',
  'queuePenaltyBalk',
  'spoiledEncounters',
  'cleanlinessLow',
  'staffInteractionGood',
  'staffInteractionAbsent',
  'discovery',
] as const;

export const IMPULSE_TELL_TERMS = ['impulsePurchase', 'visibility', 'adjacencyBonus', 'promoLift', 'needState'] as const;

export const TELL_TERMS = [...SATISFACTION_TELL_TERMS, ...IMPULSE_TELL_TERMS] as const;
export type TellTerm = (typeof TELL_TERMS)[number];

export interface TellDef {
  readonly term: TellTerm;
  readonly bubble: string | null;
  readonly animation: string | null;
  readonly particle: string | null;
  readonly worldMark: boolean;
  readonly threshold: number;
}

const TellDefSchema = z.object({
  term: z.string().min(1),
  bubble: z.string().min(1).nullable(),
  animation: z.string().min(1).nullable(),
  particle: z.string().min(1).nullable(),
  worldMark: z.boolean(),
  threshold: z.number().min(0),
});

const GentleSurfaceSchema = z.object({
  satisfaction: z.array(TellDefSchema),
  impulse: z.array(TellDefSchema),
});

export type GentleSurfaceContent = ReadonlyMap<TellTerm, TellDef>;

const TERM_SET = new Set<string>(TELL_TERMS);

export function parseGentleSurfaceContent(raw: unknown): GentleSurfaceContent {
  const parsed = GentleSurfaceSchema.parse(raw);
  const map = new Map<TellTerm, TellDef>();
  for (const def of [...parsed.satisfaction, ...parsed.impulse]) {
    if (!TERM_SET.has(def.term)) throw new Error(`Unknown gentle-surface term: ${def.term}`);
    map.set(def.term as TellTerm, def as TellDef);
  }
  for (const term of TELL_TERMS) {
    if (!map.has(term)) throw new Error(`Missing gentle-surface tell: ${term}`);
  }
  return map;
}

export const DEFAULT_GENTLE_SURFACE_CONTENT: GentleSurfaceContent = parseGentleSurfaceContent(JSON5.parse(raw));

export function thresholdFor(content: GentleSurfaceContent, term: TellTerm): number {
  return content.get(term)!.threshold;
}
