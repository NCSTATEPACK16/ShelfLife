# Phase 2.0b — Catchment graph & rival store data model

Part of `PLAN.md` §16 phase **2.0 Market & rivals**, split into ordered sub-phases (see
`docs/handoff.md` for the full sequence: segments (2.0a, done) → catchment/rival stores (this
phase) → logit choice → loyalty → word-of-mouth → rival AI → signatures). This spec covers only
the data model for rival stores and travel cost. It intentionally does **not** touch the store-
choice logit (`U(h,s)`, `P(h→s)`) — that's the next sub-phase, and it should only need to *read*
what this phase defines, the same relationship 2.0a's `UtilityWeights` has to it today.

## Goal

Give the sim a `RivalStore` content type (id, name, archetype, Community Love, position, identity
tag, and the store-level `quality`/`service`/`ambiance` terms `U(h,s)` needs from §5.1) and a
`Position` + `travelCost` primitive on a coarse catchment grid, so a household's distance from the
player's store — and from a rival's — becomes a real, deterministic, content-driven number ahead
of any store-choice decision using it.

## Non-goals

- No `U(h,s)` evaluation, no softmax `P(h→s)`, no store-choice decision of any kind. There is still
  only one store a household can shop at; `quality`/`service`/`ambiance`/`travelCost` are defined
  and tested now so the logit sub-phase only needs to read them.
- No rival AI, no personality vector (§5.8 — `priceAggression`, `reactivity`, etc.). That's a later
  sub-phase in the same sequence, after loyalty and word-of-mouth land.
- No population generation for household *positions*, matching 2.0a's stance on segments —
  `position` is a required, caller-supplied field on `addHousehold`, not sampled by the sim.
- Only one rival: **Sav-A-Lott** (§3's L1 boss). The other nine are added when their level is
  built (§16's phase 5.1), not stubbed here.
- No real road network or city geometry. "Coarse catchment grid" is an abstract integer coordinate
  space, unrelated to and non-interacting with the in-store `BuildGrid` from phase 1.4.

## Data model

Extends `src/sim/systems/market/` (created in 2.0a):

```ts
// types.ts — additions
export interface Position {
  readonly x: number;
  readonly y: number;
}

export interface RivalStore {
  readonly id: string;
  readonly name: string;
  readonly archetype: string;       // flavor text, from §3's table
  readonly communityLove: number;   // CL, §3 — 0–100
  readonly position: Position;
  readonly identity: string;        // tag for future brandAffinity(h, s.identity)
  readonly quality: number;         // store-level U(h,s) term, §5.1 — [0,1]
  readonly service: number;         // ditto
  readonly ambiance: number;        // ditto
}
```

`content/rivals/sav-a-lott.json5` — one `RivalStore` record, values consistent with §3's table
(`archetype: "Dying deep-discounter"`, `communityLove: 22`). `quality`/`service`/`ambiance` are new
values not in §3 (it only defines CL) — author them low but not zero, matching "One register open,
ever" as the signature: weak service, weak-to-middling quality, minimal ambiance investment.

`content/balance/catchment.json5` — the shared constants:
```json5
{
  playerStorePosition: { x: 0, y: 0 },
  distanceCostPerUnit: /* number, > 0 */,
}
```
The player's store is fixed at the origin — multi-store is a v2 non-goal (`PLAN.md` §1.3), so a
single fixed position is the honest model, not a placeholder for something more general.

`config.ts` follows the `economy/config.ts` / `segments`-in-2.0a pattern exactly: JSON5 import, zod
schema, `parseCatchmentConfig`, `parseRivalStore`, `DEFAULT_CATCHMENT_CONFIG`,
`DEFAULT_RIVAL_STORES`. Validation requirements:
- `communityLove` in `[0, 100]`.
- `quality`, `service`, `ambiance` each in `[0, 1]`.
- `position.x`, `position.y` finite integers.
- `distanceCostPerUnit` > 0 (a non-positive value makes `travelCost` meaningless or perverse).
- `id`, `name`, `archetype`, `identity` non-empty strings.

## `travelCost` — the catchment primitive

```ts
// catchment.ts
export function travelCost(a: Position, b: Position, config: CatchmentConfig): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * config.distanceCostPerUnit;
}
```

**Manhattan distance, not Euclidean.** §5.1 is explicit: "`travelCost` uses road-network distance
on a coarse catchment graph, not Euclidean." Manhattan distance on the coarse grid is the direct
reading of "road-network, not straight-line" without building actual road geometry.

Pure function, no RNG, no sim-state dependency — same tier as `consumptionMultiplierFor`.

## Household & command changes

`shoppers/types.ts`: `Household` gains `readonly position: Position` (import from
`market/types.ts`), required, same treatment as `segment` in 2.0a.

`addHousehold` command (in `core/commands.ts`) gains a required `position: Position` field;
`hashCommand` folds it in.

**Not wired into any decision.** Nothing in `ShoppersSystem` calls `travelCost` yet — there's still
only one store to shop at, so a travel-cost number has nothing to influence. This phase proves the
function and the content are correct; the next sub-phase (logit choice) is what actually consumes
them.

## Testing

- `market/catchment.test.ts` (new): schema tests for `parseCatchmentConfig`/`parseRivalStore` —
  rejects CL outside `[0,100]`, quality/service/ambiance outside `[0,1]`, non-integer position,
  non-positive `distanceCostPerUnit`, empty required strings, a malformed `sav-a-lott.json5`. Plus
  `travelCost` unit tests: zero at identical positions, symmetric (`travelCost(a,b) ===
  travelCost(b,a)`), matches hand-computed Manhattan distance for fixed pairs (e.g. `(0,0)` to
  `(3,4)` → `7 * distanceCostPerUnit`, not `5 * distanceCostPerUnit` — the Euclidean answer would be
  wrong here and the test should make that distinction obvious).
- `household.test.ts`: two households at different positions relative to
  `DEFAULT_CATCHMENT_CONFIG.playerStorePosition`, same segment → `travelCost` differs
  deterministically and matches the expected Manhattan computation.
- Existing call sites updated with an explicit `position` on every `addHousehold` push, the same
  mechanical update 2.0a did for `segment`: `shoppers/system.test.ts`, `build-bridge.test.ts`,
  `checkout/understaffing.test.ts`, `economy/loss-leader.test.ts`, `tests/golden/scenarios.ts`.
- **Golden hash is expected to move** this time — unlike 2.0a, where `family`/
  `consumptionMultiplier: 1.0` was deliberately chosen as a neutral value so the `shopper-trip`
  fixture's hash didn't need to change, there's no equivalent "neutral position": `position` is now
  part of every household's hashed state (`addHousehold`'s `hashCommand` includes it), so the
  fixture's recorded hash will differ regardless of what position value is chosen. Per
  `CLAUDE.md`'s golden-hash rule, this re-baselines in its own commit, explaining that the change is
  expected because `position` is new hashed state, not a behavior regression.

## Gate

Content validation fails on an invalid rival/catchment config (schema tests prove each failure
mode: bad CL, bad quality/service/ambiance range, non-integer position, non-positive
`distanceCostPerUnit`). `sav-a-lott.json5` loads and validates against `PLAN.md` §3's table values.
Two households at different, known distances from `playerStorePosition` produce different,
deterministic `travelCost` values matching a hand-computed Manhattan distance.
