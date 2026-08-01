# Phase 2.0a — Household segments & personality-vector data model

Part of PLAN.md §16 phase **2.0 Market & rivals**, split into ordered sub-phases (see
`docs/handoff.md` for the full sequence: segments → catchment/rival stores → logit choice →
loyalty → word-of-mouth → rival AI → signatures). This spec covers only the first sub-phase: the
data model for household segments and their §5.1 utility weights. It intentionally does **not**
touch store choice, rival stores, or loyalty — those need this foundation first and are separate
specs.

## Goal

Give every household a `Segment` (§5.1: PriceHunter, Convenience, Family, Foodie, Bulk, Senior,
Student) with a content-defined utility-weight vector (`βp, βa, βq, βv, βm, βl, βb, βd, τ`) for the
future store-choice logit, and a consumption multiplier that makes pantry depletion — and therefore
shopping frequency — segment-dependent now, per §5.4's "why milk-buyers come back weekly,
rice-buyers monthly, emergently" claim.

## Non-goals

- No rival stores, no catchment graph, no logit evaluation (`U(h,s)`) — there is only one store to
  choose today, so `U(h,s)` has nothing to compare against yet. The weight vector is defined and
  validated now so later phases only need to *read* it.
- No per-category consumption nuance (Foodie buying premium goods, Bulk buying large packs). A
  single scalar multiplier per segment is the whole mechanism this phase adds.
- No population-mix generation. Households are still added one at a time via the existing
  `addHousehold` command; segment is a required parameter on that command, supplied by the caller
  (test, scenario, or future population generator), not sampled by the sim itself.

## Data model

New directory `src/sim/systems/market/` (the `market` system named in PLAN.md §4's system
inventory):

```ts
// types.ts
export const SEGMENTS = [
  'priceHunter', 'convenience', 'family', 'foodie', 'bulk', 'senior', 'student',
] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface UtilityWeights {
  readonly priceFit: number;      // βp
  readonly assortmentFit: number; // βa
  readonly quality: number;       // βq
  readonly service: number;       // βv
  readonly ambiance: number;      // βm
  readonly loyalty: number;       // βl
  readonly brandAffinity: number; // βb
  readonly travelCost: number;    // βd
  readonly temperature: number;   // τ, > 0
}

export interface SegmentDef {
  readonly segment: Segment;
  readonly weights: UtilityWeights;
  /** Multiplies every good's depletionPerDay for a household of this segment. */
  readonly consumptionMultiplier: number;
}
```

`content/balance/segments.json5`: one `SegmentDef` per segment, all 7 required. Field names in
JSON5 spell out the β terms (`priceFit`, `assortmentFit`, etc.) rather than the Greek letters, for
grep-ability — matches how `economy.json5` already names things descriptively rather than
symbolically.

`config.ts` follows the exact pattern of `economy/config.ts` and `goods/catalog.ts`: JSON5 import,
zod schema (`SegmentConfigSchema`, `z.record` or array + completeness check), `parseSegmentConfig`,
`DEFAULT_SEGMENT_CONFIG`. Validation requirements:
- All 7 `SEGMENTS` values present, no duplicates, no unknown segment ids.
- Every `UtilityWeights` field is a finite number.
- `temperature` (τ) > 0 (it's a logit-softmax denominator; zero or negative breaks §5.1's formula).
- `consumptionMultiplier` > 0.

## Household & command changes

`shoppers/types.ts`: `Household` gains `readonly segment: Segment` (import from `market/types.ts`).

`shoppers` command type (wherever `addHousehold` is defined — currently inline in
`system.ts`'s `applyCommand` switch and the command union in `core`): `addHousehold` gains a
required `segment: Segment` field. All existing call sites (system.test.ts, household.test.ts, any
golden-test fixtures, scenario/harness setup) are updated to pass one explicitly — no default,
per the "required" decision.

`household.ts`:
```ts
export function advancePantryDay(
  household: Household,
  catalog: readonly GoodDef[],
  segmentConfig: SegmentConfig, // or however DEFAULT_SEGMENT_CONFIG is threaded through
): Household
```
Depletion becomes `stock - good.depletionPerDay * multiplierFor(household.segment)`. The system
call site (`system.ts`'s day-advance loop) passes `DEFAULT_SEGMENT_CONFIG` the same way it already
passes `this.#catalog`.

## Testing

- `market/config.test.ts` (new, mirrors `economy/config.test.ts`): rejects a config missing a
  segment, a τ ≤ 0, a non-finite weight, a non-positive `consumptionMultiplier`, a duplicate/unknown
  segment id.
- `household.test.ts`: two households, identical catalog and starting pantry, different segments
  with different `consumptionMultiplier`s → after N days, their pantry stocks (and therefore
  reorder timing) measurably diverge. This is the unit-level proof of §5.4's frequency claim, ahead
  of any store-choice wiring.
- Existing `shoppers/system.test.ts` and the golden shopper-trip fixture: updated to pass an
  explicit `segment` on every `addHousehold` call. `family` is designated the neutral segment and
  configured with `consumptionMultiplier: 1.0` specifically so the golden test's household fixture
  can use it without perturbing the existing hash (documented inline in `segments.json5` and in the
  fixture). If the golden hash still moves for any other reason, it re-baselines in its own commit
  per `CLAUDE.md`'s golden-hash rule, not silently alongside this change.

## Gate

Content validation fails on an incomplete/invalid segment config (schema test proves each failure
mode). Two households with different segments, same catalog, deplete pantries at provably
different, deterministic rates.
