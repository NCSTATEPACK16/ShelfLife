# Rival Dynamics — Design Spec

**Date:** 2026-08-04
**Phase:** M2 · 2.0 completion (Sub-project A of two)
**Status:** approved, pre-implementation
**Companion sub-project:** Balance Harness (separate spec, built second — it measures what this
builds). See "Scope & sequencing" below.

---

## 1. Context & goal

Phase 2.0 (Market & rivals) has landed 2.0a–2.0c: catchment graph, segments, the multinomial-logit
store choice, per-household loyalty, and word-of-mouth (§5.1–5.3). What it does **not** have is a
*rival sim*. Today every `RivalStore` is a frozen set of authored terms; nothing evolves, no
personality vector exists, and there are no signature mechanics (§5.8). The §16 phase-2.0 line
requires exactly those: "rival sim, personality vectors, first 3 signatures."

The 2.0 **gate** is *"harness win rates decrease monotonically with CL rank."* That gate is the
Balance Harness sub-project's job to prove; **this** sub-project builds the rivals the harness
measures. The two are sequenced: Rival Dynamics first (a pure `src/sim` system, TDD-able in
isolation), Balance Harness second (a `tools/` consumer of `src/sim`'s public API).

**Decisions locked during brainstorming (2026-08-04):**

1. **Multi-CL via the three real M2 rivals**, not a synthetic sweep and not all ten bosses. Author
   Sav-A-Lott (CL 22, exists), Grocerteria 24 (CL 35), BulkHaus Club (CL 48) — exactly §16's M2
   scope ("first 3 signatures"). Bosses 4–10 remain phase 5.1.
2. **Win metric = share-of-wallet capture** (harness sub-project) — independent of the campaign
   win/lose objectives, which are phase 2.1.
3. **Rivals are reactive**: personality derives initial terms *and* a weekly tick evolves them in
   response to player share/pricing, scaled by `reactivity` (§5.8 "checked weekly, not daily").
   Signatures hook this tick. This is the honest reading of "rival sim + personality vectors."

---

## 2. Architecture — a new `rivals` system

New directory `src/sim/systems/rivals/` (`index.ts`, `types.ts`, `system.ts`, `signatures/`,
`*.test.ts`) owning the **mutable, evolving** rival state. Pure `src/sim` — zero platform imports;
exported through `src/sim/index.ts`.

`MarketSystem` stops owning a static `readonly RivalStore[]` and reads current terms through a
narrow view.

### 2.1 Registration order

```
grid → pathing → inventory → checkout → economy → RIVALS → market → shoppers → loyalty → reputation
```

`rivals` registers **before** `market` so that within a single tick:

- when `market` schedules the day's trips, it already sees this week's fresh rival terms; and
- `rivals` reads `market.pendingOutcomes()` at the top of its own `update`, catching the *previous*
  tick's completed trips exactly once — a one-tick accumulation lag, invisible at weekly
  granularity.

### 2.2 The seam

`MarketSystem` consumes rivals through one method:

```ts
interface RivalsView {
  /** Current effective RivalStore for a rival, resolved for a given household segment. */
  effectiveStore(rivalIndex: number, segment: Segment): RivalStore;
  /** Current rival roster (stable order, stable length within a run). */
  stores(): readonly RivalStore[];
  count(): number;
}
```

`RivalsSystem` composes `base-derived terms + weekly reactive adjustments + signature deltas` into
an effective `RivalStore` per `(rival, segment)`. Because `MarketSystem` already knows
`household.segment` inside `#termsFor` and `#resolveRivalTrip`, it stays a pure **consumer** of
`RivalStore` values — no reactivity or signature logic leaks across the seam. Per-segment resolution
is what lets a signature pull specific segments (Grocerteria; §5.1 example).

`MarketSystem` changes:

- `#termsFor`: `this.#rivals.map(...)` → iterate `rivalsView.stores()`, calling
  `rivalsView.effectiveStore(i, household.segment)` for each rival's store-side terms before adding
  the household-side terms (`loyalty`, `brandAffinity`, `travelCost`) it already computes.
- `#resolveRivalTrip`: reads the chosen rival's terms via `effectiveStore(storeIndex-1,
  household.segment)` instead of the static array.
- `storeIndexOf`: reads `rivalsView.stores()`.
- Constructor: the `rivals: readonly RivalStore[]` positional param becomes a `RivalsView`
  (late-bound; see 2.3). `DEFAULT_RIVAL_STORES` stays as the *content* the view is built from.

### 2.3 Circular dependency

`market` needs rival terms; `rivals` needs trip outcomes, the player's price level, and household
segments. Resolved with the **existing late-binding deps pattern** already used for market↔loyalty
(the `marketBox` getters in `tests/golden/scenarios.ts`). `RivalsSystem`'s constructor takes:

```ts
interface RivalDeps {
  outcomes(): readonly TripOutcome[];  // () => market.pendingOutcomes()
  playerPriceLevel(): number;          // () => economy.<accessor> (see §4)
}
```

Reactivity and signature weekly hooks work on per-store weekly *shares*, not per-household state,
so no household-segment accessor is needed in `RivalDeps`; `shapeTerms` receives the segment from
`MarketSystem` at call time.

`MarketSystem` receives the `RivalsView` (the `RivalsSystem` instance) — also late-bound where a
`marketBox`-style forward reference is needed in scenario/test wiring.

### 2.4 Share accumulation

`RivalsSystem` sums `outcomes()` per tick into per-store weekly tallies (`storeIndex 0` = player,
`≥1` = each rival — the tags already exist on `TripOutcome`). On the weekly boundary it computes
each store's share of the window's trips, feeds reactivity + signature hooks, then resets the
window.

### 2.5 Loyalty roster

`LoyaltySystem` currently sizes its per-store loyalty arrays from `DEFAULT_RIVAL_STORES` and reads
each rival's static `loyaltyDecay`. It now reads roster **count** and each rival's **effective**
`loyaltyDecay` from `RivalsView` — decay is store-level and segment-independent, so a
`decayFor(rivalIndex)` accessor on the view (or reading `effectiveStore(i, <any segment>).loyaltyDecay`)
suffices. This is the integration point that makes BulkHaus's lock-in (§5, a lowered effective
`loyaltyDecay`) actually reach `LoyaltySystem`; without it the signature would be inert. The roster
grows 1 → 3, so loyalty indexing covers `[player, savALott, grocerteria, bulkhaus]`.

### 2.6 Determinism

- `RivalsSystem.hash` folds its evolving state: each rival's current terms + signature state +
  weekly tallies, iterated in ascending rival index.
- The weekly reactive tick is **RNG-free** — a pure function of share and prices. It never draws
  from `rivalNoise`, so it cannot perturb the store-choice draw sequence that already consumes that
  stream (§5.1 `ε`). This is a hard rule, tested.
- Because rivals now carry hashed evolving state **and** the roster grows, the `shopper-trip` and
  `catchment-week` golden hashes will legitimately change. Re-baseline in a **dedicated commit**
  explaining the roster-growth + evolving-state change (CLAUDE.md). `empty-world`,
  `single-system`, `three-systems`, `speed-and-pause`, `grid-build`, `grid-and-pathing`, and
  `pricing-and-promotions` stay byte-identical — confirmed before re-baselining, not assumed.

---

## 3. Content schema, derivation & the two new bosses

### 3.1 Personality vector

Extend the `RivalStore` Zod schema and `types.ts` with an **optional** `personality`:

```ts
personality?: {
  priceAggression: number;    // [0,1]
  qualityInvestment: number;  // [0,1]
  marketingSpend: number;     // [0,1]
  expansionRate: number;      // [0,1]  (authored now; consumer deferred — see 6)
  reactivity: number;         // [0,1]
  signature: 'oneRegister' | 'neverCloses' | 'membershipLockIn';
}
```

The static `quality/service/ambiance/priceIndex/assortmentBreadth` fields **remain authored** and
are the *baseline* the derivation and weekly tick adjust around. This keeps existing Sav-A-Lott
content valid and makes personality a modifier, not a replacement. Rivals without a `personality`
(there are none after this phase, but the field is optional for schema-compat) behave statically.

### 3.2 Derivation

`deriveInitialTerms(base: RivalStore, communityLove, personality, config) → RivalStore` — a pure,
deterministic, bounded function producing the run's *initial* effective terms:

- `qualityInvestment` nudges `quality` up from baseline; `priceAggression` pushes `priceIndex` down;
  `marketingSpend` lifts effective `ambiance`.
- `communityLove` sets the loyalty-stickiness floor (higher CL → lower effective `loyaltyDecay`,
  bounded, unless a boss authors an explicit override).
- Every output clamped to its field domain (`[0,1]`, `priceIndex` positive and `≥ minPriceIndex`).

Coefficients live in `content/balance/rivals.json5` (new, Zod-validated) — never inlined.

### 3.3 The two new bosses

`content/rivals/grocerteria-24.json5` (CL 35, `signature: neverCloses`) and
`content/rivals/bulkhaus-club.json5` (CL 48, `signature: membershipLockIn`), each authored to its
§3 boss-ladder row. Sav-A-Lott gains a `personality` block with `signature: oneRegister`.
`DEFAULT_RIVAL_STORES` grows to all three, ascending by CL.

**Ordering rule (CLAUDE.md, hard):** before writing either new rival file, add its
`docs/legal/parody-review.md` entry (real-world archetype, borrowed strategy, deliberately-not
name/logo/colors/slogan) and pass the four-part §2.2 name test. Parody-review entry precedes
implementation.

---

## 4. The weekly reactive tick

`RivalsSystem.update(world)`:

1. **Every tick:** accumulate `deps.outcomes()` into per-store weekly tallies.
2. **On a 7-sim-day boundary** (`world.tick % (TICKS_PER_SIM_DAY * 7) === 0 && world.tick > 0`),
   per rival in ascending index:
   1. Compute the rival's own share and the player's share from the week's tallies.
   2. **Reactivity** — bounded, RNG-free, scaled by `personality.reactivity`:
      - `priceAggression × reactivity` pulls `priceIndex` toward undercutting
        `deps.playerPriceLevel()`, never below `minPriceIndex` (the §5.8 "never cheat on money"
        invariant, expressed as a floor — rivals cut price toward viability, never below it).
      - `marketingSpend × reactivity` nudges effective `ambiance` up when the player is taking
        share, decays it back otherwise.
      - `qualityInvestment` governs how much of any reaction goes into `quality` vs `priceIndex`.
   3. Run the rival's **signature weekly hook** (§5), which may further shape terms from share.
   4. Clamp every term to its domain; reset the weekly window.

**Tested invariant:** across any run, no rival term leaves its domain and `priceIndex ≥
minPriceIndex` always. All constants (`reactionRate`, `minPriceIndex`, weekly-window length,
derivation coefficients) live in `content/balance/rivals.json5`.

---

## 5. Signature interface & the three signatures

```ts
interface RivalSignature {
  readonly id: 'oneRegister' | 'neverCloses' | 'membershipLockIn';
  /** Weekly: mutate the rival's evolving state from its share this week. */
  weeklyTick(state: RivalState, share: RivalShare, config: RivalsConfig): void;
  /** Per-(rival, segment) term shaping, applied inside effectiveStore. */
  shapeTerms(base: RivalStore, segment: Segment, state: RivalState, config: RivalsConfig): RivalStore;
}
```

Registered in `src/sim/systems/rivals/signatures/index.ts` (id → impl map); a boss's
`personality.signature` string resolves to a hook. Both hooks are pure w.r.t. RNG.

- **`oneRegister` (Sav-A-Lott).** Reduced-fidelity read of "one register, ever." `weeklyTick`
  **degrades `service`** as the rival's own captured share rises (a single register congests when
  busy) and recovers it as share falls. `shapeTerms`: identity. Makes Sav-A-Lott self-limiting —
  the "beatable by literally anything" L1 lesson.
- **`neverCloses` (Grocerteria 24).** "Owns 10pm–6am." The scheduler is daily (no intra-day clock
  yet), so the honest reduction is a per-segment **`shapeTerms` bump** to `service`/`ambiance` for
  `convenience` and `student` households (the segments that value 24h access), zero for others.
  `weeklyTick`: none. Documented as the reduced-fidelity stand-in for time-of-day; true off-hours
  pull arrives when intra-day scheduling does (§5.1 autonomous scheduling, future).
- **`membershipLockIn` (BulkHaus Club).** "Membership lock-in + sample corridor." Expressed through
  existing machinery: a low effective `loyaltyDecay` (lock-in — slow to lose a member, a mild
  cousin of Trailblazer's δ/5) + a `shapeTerms` assortment/quality bump for `bulk` and `family`
  (the sample-corridor discovery pull). **Honest stub:** no per-household membership set this phase,
  so store-wide slow decay slightly over-applies to non-members; per-household membership is
  deferred and noted in the handoff.

Each signature ships a focused unit test proving its characteristic tell: Sav-A-Lott's `service`
drops under sustained high share; Grocerteria out-pulls a baseline rival on `convenience` but not
`foodie`; BulkHaus retains loyalty through a visit gap that would sink a normal-decay rival.

---

## 6. Explicitly deferred (honest, not oversight)

- **`expansionRate`** — authored in the personality vector (schema-complete) but has no consumer
  this phase; store expansion/relocation is later-milestone territory. A real lever, inert now.
- **Per-household BulkHaus membership** — reduced to store-wide slow decay (§5).
- **Intra-day / time-of-day trip timing** — Grocerteria's night pull is a segment stand-in until
  the scheduler gains intra-day timing.
- **Bosses 4–10 and their signatures** — phase 5.1, per §16.
- **The monotonic-CL gate itself** — proven in the Balance Harness sub-project, not here. This spec
  delivers the rivals it measures.

---

## 7. Testing plan

- **Unit** (`src/sim` 80% bar, un-negotiated): derivation purity + domain bounds; weekly reactivity
  direction, clamps, and the `minPriceIndex` floor invariant; each signature's characteristic tell;
  the circular-dep wiring (rivals↔market late-binding); loyalty roster-growth indexing.
- **Golden**: extend `catchment-week` (or add a dedicated `rival-reaction` scenario, ≥3 weeks, all
  three rivals present) so the reactive tick + signatures are locked. Re-baseline `shopper-trip` +
  `catchment-week` in a dedicated commit; confirm the other seven scenarios byte-identical first.
- **Boundary**: `tests/boundaries` still green — `rivals` is pure sim, zero platform imports.
- **`npm run verify`** green end to end before the phase is called done; a manual dev-server sanity
  check (place a store, add households across segments, fast-forward, observe rival share shift) per
  the project's "run it for real" habit.

---

## 8. Definition of done (this sub-project)

1. `src/sim/systems/rivals/` exists with system, signatures, and tests; exported from
   `src/sim/index.ts`.
2. Three real rivals authored (Sav-A-Lott updated, Grocerteria 24 + BulkHaus Club new), each with a
   parody-review entry written **before** its content.
3. `content/balance/rivals.json5` holds every new constant; nothing inlined.
4. Reactive weekly tick + three signatures implemented, each with a passing characteristic test; the
   RNG-free and `minPriceIndex` invariants tested.
5. `MarketSystem`/`LoyaltySystem` read rivals through the view; no static roster remains.
6. Golden re-baseline committed on its own with rationale; other scenarios confirmed unchanged.
7. `npm run verify` green.

The 2.0 milestone gate ("win rates decrease monotonically with CL rank") is **not** claimed here —
it is the Balance Harness sub-project's gate, which consumes these rivals.
