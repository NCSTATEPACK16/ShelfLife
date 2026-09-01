# Balance Harness — Design Spec

*2026-09-01. M2 phase 2.0's companion sub-project ("built second — it measures what Rival
Dynamics built," per `docs/superpowers/specs/2026-08-04-rival-dynamics-design.md`'s "Scope &
sequencing"). Consumes `src/sim/systems/rivals/` as delivered; does not modify rival content or
mechanics beyond the one prerequisite fix in §0.*

## 1. Purpose & scope

`tools/sim-harness/` is a headless CLI that runs `src/sim` with no renderer, drives it through six
canned strategies against the currently-authored rival roster, and reports win rate, days-to-win,
and EBITDA distribution (PLAN.md §11.3). Its output is what actually proves the phase 2.0 gate:
*"harness win rates decrease monotonically with CL rank."*

**What this sub-project is not:** it does not build the level/chapter schema (phase 2.1), does not
author bosses 4–10 (phase 5.1), and does not add any new sim mechanic. It is a consumer of the
public `src/sim` API, exactly like `tests/golden/scenarios.ts` already is — the harness's world
construction is a generalization of that same pattern, not a new architecture.

Reused later, unmodified in its core, as the leaderboard replay verifier (§8.3) — so
`tools/sim-harness/` stays dependency-free: no new npm package, hand-rolled CLI parsing.

## 2. Scope decisions carried from brainstorming

- **`--level N` means N=1..3, cumulative roster.** Level 1 is Sav-A-Lott alone; level 2 is
  Sav-A-Lott + Grocerteria 24 (target); level 3 is all three (target BulkHaus Club). The roster
  is CL-ordered and the harness's level count grows automatically as bosses 4–10 land in phase
  5.1 — nothing about the harness's shape changes when that happens. The monotonic-CL gate runs
  on whatever's authored today (n=3 points), matching Rival Dynamics' own scope note that it only
  had to deliver the rivals the harness measures.
- **Win condition:** trailing 30-day trip share vs. the level's target rival crosses 50% and holds
  through the end of the run (§5).
- **Prerequisite fix:** `reactWeekly`'s price step is corrected before the harness is built, so
  `price-war`-shaped strategies measure a rival that can actually counter-move on price (§0).

## 0. Prerequisite: `reactWeekly` price-reactivity fix

**The bug.** `src/sim/systems/rivals/reactivity.ts` computes:

```ts
const priceTarget = Math.min(current.priceIndex, playerPriceLevel);
```

When a rival's `priceIndex` is already ≤ the player's `playerPriceLevel` — true for all three
authored rivals (0.82, 0.99, 0.71-ish derived) against a player at reference pricing (1.0) — this
target equals `current.priceIndex`, so `(priceTarget - current.priceIndex) === 0` and the price
term never moves, regardless of `magnitude`. `priceAggression` is also never read anywhere in the
function, despite being a personality field.

**The spec's actual intent**
(`docs/superpowers/specs/2026-08-04-rival-dynamics-design.md` line 200):
> `priceAggression × reactivity` pulls `priceIndex` toward undercutting `deps.playerPriceLevel()`,
> never below `minPriceIndex`.

**The fix.** Two changes to `reactWeekly`:

1. The target becomes an **undercut** of the player's price, not a clamp against the rival's own
   current price: `priceTarget = playerPriceLevel * (1 - config.undercutFraction)`, floored at
   `config.minPriceIndex`. `config.undercutFraction` is a new `RivalsConfig` field (small, e.g.
   `0.05`–`0.1`) — a magic number, so it lives in `content/balance/rivals.json5`, not inlined.
2. `magnitude` gains the missing `priceAggression` factor:
   `magnitude = p.priceAggression * p.reactivity * config.reactionRate * shareDeficit` (previously
   missing `p.priceAggression` entirely).

Quality/ambiance terms and the `(1 - qualityInvestment)` split are unchanged — only the price
target and its magnitude change.

**Test strengthening.** The existing tests assert `next.priceIndex <= base.priceIndex`, which a
no-op price also satisfies — exactly how the bug shipped unnoticed. Add a case using a rival
already priced *below* the player (e.g. Sav-A-Lott's authored 0.82 vs. player at 1.0, losing
share) that asserts **strict** movement (`toBeLessThan`, not `toBeLessThanOrEqual`) — the case the
old code provably fails.

**Golden re-baseline.** If `rival-reaction`'s hash moves (likely, since all three rivals are in
play there), confirm the other scenarios are untouched, then re-baseline in its own commit
explaining why, per `CLAUDE.md`. This is a bug fix landing in already-shipped, tested code — treat
it with the same care as any other re-baseline, in its own commit, before the harness build
starts.

## 3. World construction

### 3.1 RNG stream

`src/sim/core/rng.ts`'s `STREAM_NAMES` gains one entry: `'harness'`. Adding a stream never
reshuffles existing ones (that's the whole point of per-stream seeding, per PLAN §6.3's comment on
`STREAM_NAMES`), so this is a safe, additive change. The harness draws from
`world.rng.get('harness')` for two things: household catchment generation (§3.3) and the `random`
strategy's dice rolls (§4). This keeps a harness run's *entire* behavior — world setup and
strategy decisions alike — reproducible from a single seed, consistent with the project's
save-is-seed-plus-command-log philosophy. It is never used inside any existing sim system.

### 3.2 Baseline store

Every strategy, at every level, starts from an identical store so comparisons are fair — this is
harness-owned setup, not real level content (that's phase 2.1's job):

- One `shelf_basic` stocked with each of the 4 catalog goods (milk, bread, eggs, snacks) spread
  across separate shelf instances — enough that `layout-optimizer` has something to rearrange and
  `premium`'s "stock the full catalog" lever means something.
- One `register` (staffed) and one `self_checkout`.
- One hired staff member at moderate skill/morale, assigned to the register.
- Player store position from `DEFAULT_CATCHMENT_CONFIG.playerStorePosition`.

This baseline lives in `tools/sim-harness/world.ts`, expressed as the same `Command[]` shape every
other world-builder in this codebase uses (see `tests/golden/scenarios.ts` for the pattern) — no
new content schema, just harness-local TypeScript.

### 3.3 Rival roster & households

- Rival roster for level N: `DEFAULT_RIVAL_STORES.slice(0, N)` (already CL-ordered). Target rival
  is index `N - 1`.
- Household count and segment mix are harness-owned defaults, authored in
  `content/balance/harness.json5` (§4.3) since they're tuning knobs, not hardcoded constants:
  `householdCount` (default 24) and a segment-proportion map over the 7 segments in
  `content/balance/segments.json5`. A uniform default (`1/7` each, rounded) is the v1 authored
  value — an even segment mix is the right neutral default for a *balance* harness; skewed
  mixes are a lever for a future difficulty-curve pass (PLAN §5.4 / phase 5.4), not this
  sub-project.
- Each household's position is drawn from `world.rng.get('harness')`: uniformly within a bounding
  box that contains the player's store and every active rival's authored `position`, expanded by a
  fixed margin. Segment is assigned by proportional draw from the same stream. This all happens
  once, at world-build time, before `world.step()` is ever called — identical in spirit to how
  golden scenarios push their setup commands before ticking.

## 4. Strategies

### 4.1 Policy interface

```ts
interface StrategyContext {
  readonly world: World;
  readonly day: number;           // 0-based sim day
  readonly economy: EconomySystem;
  readonly checkout: CheckoutSystem;
  readonly grid: BuildGrid;
  readonly rng: Stream;           // world.rng.get('harness')
  readonly config: HarnessStrategyConfig; // this strategy's slice of harness.json5
}

interface Strategy {
  readonly name: StrategyName;
  /** Called once per sim day (1440 ticks) — the NIGHT (player) decision point, PLAN §4. */
  decide(ctx: StrategyContext): readonly Command[];
}
```

Six pure-ish policy modules under `tools/sim-harness/strategies/`, one file each, each unit-testable
by constructing a `StrategyContext` against a small fixture world — no full sim run required to test
a policy's decision logic in isolation.

### 4.2 The six strategies

| Strategy | Mechanism | Bets on |
|---|---|---|
| `do-nothing` | No commands, ever, beyond the baseline. | Nothing — the control run. |
| `random` | Each day, with probability `config.randomActionChance`, draws one of {price delta, promotion, staffing move, fixture tweak} uniformly via `rng`, with parameters drawn from valid ranges. | Nothing coherent — the negative control. |
| `price-war` | Cuts price below reference on the two highest-`impulseBase`/highest-volume goods by `config.priceWar.cutFraction`; runs a `startPromotion` on a rotating good every `config.priceWar.promotionCadenceDays`. | `priceFit`; post-fix, pressures rivals' `reactWeekly`. |
| `premium` | Sets price above reference by `config.premium.markupFraction` on all goods; stocks every catalog good across dedicated shelves (maximal assortment coverage — the only player-side lever close to `assortmentFit` today, since there's no quality/ambiance command). | `assortmentFit`, `priceFit` tolerance in higher-loyalty segments. |
| `service` | Hires up to `config.service.staffTarget` staff at `config.service.hireSkill`/`hireMorale`, assigns them to registers, issues `trainStaff` every `config.service.trainCadenceDays`. | `queuePenalty`, `staffInteraction`, `serviceScore`. |
| `layout-optimizer` | On day 0 only, replaces the baseline's clustered shelf placement with a fixed "long aisle" layout: shelves spread along the natural flow-field path between the entry and the checkout lanes, each stocked with a different good. | `discovery`/impulse and `fillRate` via path exposure — PLAN §5.4's literal mechanic. |

`price-war`, `premium`, and `service` each touch exactly one of the three player-side lever
families (pricing, assortment, staffing) so a monotonic-CL win-rate drop can be attributed to
rival strength rather than strategy overlap; `layout-optimizer` is the only strategy that acts on
day 0 only rather than every day, since a layout choice isn't something a player redoes daily.

### 4.3 `content/balance/harness.json5`

New file, Zod-validated like every other `content/balance/*.json5`:

```json5
{
  world: {
    householdCount: 24,
    // proportional weights, not required to sum to 1 — normalized at load time
    segmentMix: {
      priceHunter: 1, convenience: 1, family: 1, foodie: 1, bulk: 1, senior: 1, student: 1,
    },
    catchmentMarginCells: 4,
  },
  winCondition: {
    trailingWindowDays: 30,
    shareThreshold: 0.5,
  },
  strategies: {
    random: { actionChance: 0.15 },
    priceWar: { cutFraction: 0.15, promotionCadenceDays: 5, promotionDiscountFraction: 0.3, promotionDurationDays: 3 },
    premium: { markupFraction: 0.2 },
    service: { staffTarget: 3, hireSkill: 0.85, hireMorale: 0.85, trainCadenceDays: 14 },
  },
}
```

`layout-optimizer` and `do-nothing` need no tuning constants (the former's layout is a fixed
recipe, the latter issues nothing), so they have no entry here.

## 5. Metrics & win condition

### 5.1 Trip-share tracking

`MarketSystem#pendingOutcomes()` already exposes each tick's completed trips as
`{ householdId, storeIndex, satisfaction }` (`storeIndex` 0 = player, `n+1` = rival index `n`) — no
new sim API. The harness reads this once per tick (like `LoyaltySystem`/`ReputationSystem` already
do) and accumulates a per-day count of trips to the player and to the target rival.

### 5.2 Win / days-to-win

For day `d`, trailing share is:

```
playerTrips  = sum of player-store trip counts over days [d - windowDays + 1, d]
targetTrips  = sum of target-rival trip counts over the same window
share(d)     = playerTrips / (playerTrips + targetTrips)   // undefined if denominator is 0
```

A run **wins** if there is a suffix of days `[d0, lastDay]` where `share(d)` is defined and
`≥ shareThreshold` for every day in the suffix, and `d0` is as early as possible — computed by
scanning backward from the last day and stopping at the most recent day where the condition
fails (or where share is undefined). If the final day itself doesn't satisfy the threshold, the
run is a loss, regardless of any earlier crossing — a "held the lead, then lost it back" run must
not count as a win. `daysToWin = d0` for a win; a loss has no `daysToWin`.

### 5.3 EBITDA & other per-run outputs

`EconomySystem#statements()` gives daily `DailyStatement`s directly; the harness sums the run's
EBITDA and also records the full daily share trajectory (for the aggregate share-over-time output
PLAN §11.3 asks for).

### 5.4 Result types

```ts
interface RunResult {
  readonly seed: number;
  readonly won: boolean;
  readonly daysToWin: number | null;
  readonly totalEbitda: number;
  readonly shareTrajectory: readonly number[]; // one entry per day, share(d) or NaN if undefined
}

interface LevelStrategyResult {
  readonly level: number;
  readonly strategy: StrategyName;
  readonly runs: readonly RunResult[];
  readonly winRate: number;
  readonly medianDaysToWin: number | null;      // among wins only
  readonly ebitda: { mean: number; p10: number; p50: number; p90: number };
  readonly meanShareTrajectory: readonly number[];
}
```

## 6. CLI

```
npm run harness -- --level 2 --strategy service --runs 500 --days 180 \
  [--seed 20260901] [--out csv|json] [--out-file path]
```

- `--seed` is the base seed (default: a fixed constant so bare invocations are reproducible without
  specifying one); run `i` (0-based) uses `deriveSeed`-style folding of `(baseSeed, i)` so any
  single run is independently reproducible by index — `--runs 1 --seed <base>` replays exactly the
  first run of a larger sweep, which matters for debugging one bad-looking run out of 500.
- Runs execute sequentially in-process (this sim is small — 4 goods, 5 fixture types, ~24
  households per run — so 500 runs × 180 days is expected to be seconds, not minutes; parallelizing
  across `worker_threads` is a reasonable future optimization if that assumption proves wrong, not
  a v1 requirement).
- `--out csv` writes one row per run (seed, won, daysToWin, totalEbitda) plus a summary block;
  `--out json` writes the full `LevelStrategyResult`. Default destination is stdout; `--out-file`
  redirects to a file.
- Arg parsing is hand-rolled (a ~30-line `parseArgs` over `process.argv`) — no new dependency, per
  §1's dependency-free constraint.

## 7. The phase 2.0 gate: `npm run balance:gate`

A second entry point, `tools/sim-harness/gate.ts`, invoked as `npm run balance:gate`. It calls the
harness's programmatic API (not the CLI, not a subprocess) across all 3 levels × 6 strategies with
a smaller `--runs`/`--days` sufficient for statistical signal without being slow (defaults
distinct from — and smaller than — the CLI's own defaults, tunable via flags for a slower, more
rigorous check before an actual balance pass), and checks:

1. **Acceptance rule (PLAN §11.3):** `do-nothing` loses ~100% (win rate ≤ 5%), `random` loses ~95%
   (win rate ≤ 10%), and at least two of {`price-war`, `premium`, `service`, `layout-optimizer`}
   land in 55–75% win rate, **per level**.
2. **Monotonic-CL check:** for each strategy, win rate at level 2 ≤ win rate at level 1, and level
   3 ≤ level 2 (non-strict — a tie is not a violation, since n=3 is a small sample).

Prints a PASS/FAIL table per level with the specific numbers that failed, so a balance-tuning pass
(content-only changes to `content/balance/*.json5`) has something concrete to react to. This is
what actually closes PLAN.md's phase 2.0 gate — not something inferred by a human reading raw CSVs.

## 8. File layout

```
tools/sim-harness/
├── world.ts          # baseline store + rival roster + household/catchment construction
├── strategies/
│   ├── types.ts       # Strategy, StrategyContext
│   ├── do-nothing.ts  premium.ts  price-war.ts  random.ts  service.ts  layout-optimizer.ts
│   └── index.ts
├── metrics.ts         # trip-share tracking, win/daysToWin, EBITDA aggregation
├── run.ts             # single (level, strategy, seed) → RunResult
├── sweep.ts           # (level, strategy, runs, days) → LevelStrategyResult — the programmatic API
├── cli.ts             # arg parsing + CSV/JSON output — `npm run harness`
├── gate.ts            # acceptance-rule + monotonic-CL check — `npm run balance:gate`
└── *.test.ts
content/balance/harness.json5
```

`package.json` gains two scripts: `"harness": "node tools/sim-harness/cli.ts"` and
`"balance:gate": "node tools/sim-harness/gate.ts"`. No `tsx`/`ts-node` dependency: Node v26.4.0
(pinned via `.nvmrc`) has stable native TypeScript execution (type-stripping) and needs neither —
unlike the existing `tools/*.mjs` scripts (plain JS, no sim import), this is the first tool script
that runs TypeScript directly, importing `src/sim/index.ts` the same way `tests/golden/scenarios.ts`
does. One thing to confirm early in implementation, not assumed here: whether Node's native
resolution follows the codebase's existing `.js`-specifier-imports-a-`.ts`-file convention (e.g.
`from '../../src/sim/index.js'`, as `scenarios.ts` already writes it) the same way `tsc`'s
`nodenext` resolution does. If it doesn't, the fallback is a small pre-run build step (`tsc` or a
`vite build` library-mode bundle of `tools/sim-harness/` into plain JS) before `node` runs it —
still zero new runtime dependencies, since `typescript`/`vite` are already devDependencies. This is
the implementation plan's first task, verified before anything else is built on top of it.

## 9. Testing

- **Reactivity fix:** strengthened unit tests in `reactivity.test.ts` (§0), plus the golden
  re-baseline if `rival-reaction`'s hash moves.
- **Strategy policies:** one test file per strategy, constructing a minimal `StrategyContext` and
  asserting the emitted `Command[]` shape — no full sim run needed.
- **World construction:** a test asserting level N's roster is exactly `DEFAULT_RIVAL_STORES`'s
  first N entries, and that household generation is deterministic (same seed → identical household
  list) and varies with seed.
- **Metrics:** unit tests for the win/daysToWin algorithm against hand-constructed share
  trajectories (crosses and holds; crosses and reverts; never crosses; crosses exactly at the
  threshold) — this is pure arithmetic and the easiest place to get an off-by-one wrong.
- **Integration:** one end-to-end test running a short sweep (`--runs 3 --days 10`) through the
  real CLI/`sweep.ts` path, proving the wiring end to end without needing full-length runs.
- **Gate script:** a test with a fabricated set of `LevelStrategyResult`s (not a real sim run)
  proving the acceptance-rule and monotonic-CL logic classifies PASS/FAIL correctly, independent of
  actual balance numbers.

No golden-hash entries are needed — the harness drives `src/sim` through its existing public API
exactly like `tests/golden/scenarios.ts` does, so it never touches determinism itself.

## 10. Explicitly out of scope

- The real level/chapter schema (phase 2.1) and bosses 4–10 (phase 5.1) — the harness's roster and
  "level" concept here are its own scoped stand-in, designed so neither future phase requires
  reshaping this tool.
- Actual balance tuning (phase 5.4) — this sub-project delivers the measuring instrument and proves
  it can currently only report what it currently reports (likely FAIL on the acceptance rule and/or
  monotonic-CL check with today's untouched `content/balance/*` numbers) — a `balance:gate` FAIL at
  the end of this sub-project is an expected, honest outcome, not a bug to chase down. Tuning
  `content/balance/*.json5` in response is real future work.
- Parallel/worker-thread execution (§6) — a documented future optimization, not required unless
  actual run times prove it necessary.
- Any new player-facing command or sim mechanic. Every strategy in §4.2 is built only from the
  command surface `src/sim/core/commands.ts` already defines.
