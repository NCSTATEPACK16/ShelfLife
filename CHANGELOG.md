# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/).
Phases and their acceptance gates are defined in `PLAN.md` §16.

## [Unreleased]

### Milestone 1 — Playable Core

#### Phase 1.0 — Foundations · **gate PASS**
- Repository scaffold, Node pinned via `.nvmrc`, docs and legal skeleton, ADRs 0001–0002.
- TypeScript `strict` + `noUncheckedIndexedAccess`; Vite with two entry points — landing at `/`,
  game at `/game/` with a relative base so the same bundle runs inside the iOS shell.
- ESLint boundary rules enforcing the sim boundary (no platform imports, no `Math.random`/`Date.now`)
  and the platform input boundary (raw pointer events only in `src/platform/input`), with
  `tests/boundaries` asserting each rule actually fires.
- Platform seam: semantic input intents over Pointer Events, two breakpoints, entitlements stub,
  storage abstraction.
- Vitest + `verify` script; GitHub Actions CI on Ubuntu and Windows; bundle-budget check; Netlify
  deploy config.
- Design tokens (`content/design/tokens.json`) and the phone-first style guide.

##### Fixed
- Flat-config rule shadowing silently disabled every determinism check inside `src/sim`. ESLint flat
  config replaces a rule's options wholesale rather than merging them, so the later
  platform-boundary block was overriding `no-restricted-syntax`. Caught by `tests/boundaries`.

#### Phase 1.1 — Design system · **tokens in progress**
- `tools/check-tokens.mjs` enforces `content/design/tokens.json` as the single source of colour
  truth: no hex literals in `src/ui`, `src/view`, or `landing/` outside the two files that define the
  tokens, and every colour those files declare must exist in `tokens.json`. Wired into
  `npm run verify` as `check:tokens`.
- Screens/components at compact + regular breakpoints are still outstanding; Figma export remains
  blocked (see `docs/handoff.md`).

#### Phase 1.3 — Sim kernel · **gate PASS**
- Deterministic clock, per-subsystem seeded RNG streams (FNV-1a keyed on `worldSeed` + stream name),
  command queue draining at tick boundaries, output-only event bus, world snapshot, and a bit-exact
  `hashWorld` (folds floats by IEEE-754 bit pattern, not decimal rendering).
- `tests/golden/golden.test.ts` proves 10,000 ticks of an empty world hash identically across 3 runs;
  CI extends the same check across Ubuntu and Windows.
- System registration freezes once the world starts; registration order is part of the hash.
- `Clock.pump` caps catch-up at 10 steps to avoid a spiral of death after a long backgrounding.

#### Phase 1.4 — Grid & build mode · **sim half PASS, view half not started**
- `src/sim/systems/grid/`: fixture catalog (`content/fixtures/catalog.json`, Zod-validated, first
  content-driven data outside design tokens), `BuildGrid` (dimensions, rotation-aware footprint
  math, placement/occupancy/walkability, bulldoze, rotate, undo/redo), and `GridSystem` wiring it
  into `World`.
- New `placeFixture` / `rotateFixture` / `removeFixture` / `undoBuild` / `redoBuild` commands.
  `System` gained an optional `applyCommand` hook (ADR 0003) so `World#apply` can dispatch
  non-kernel commands to whichever registered system claims them — the pattern every later
  gameplay system's commands will use, without `World#apply` growing a case per system.
- A dedicated test proves the PLAN.md 1.4 gate's core claim at the sim layer: placing 50 fixtures
  then undoing all 50 hashes identically to a fresh world advanced the same number of ticks. New
  `grid-build` golden scenario locks it long-term; the four pre-existing golden hashes are
  unchanged.
- **Not yet done:** `src/view` rendering, `src/platform/input` touch handling, a `src/ui` build-mode
  panel, and the two-viewport Playwright E2E — the literal "one thumb on a phone" gate needs those.

#### Phase 1.4 — Grid & build mode · **gate PASS (view half)**
- `BuildModeBridge` (`src/bridge`) is the only thing that turns UI actions into `World` commands.
- `src/view`: `iso.ts` (2:1 dimetric projection, PLAN §9.1, round-trip tested), `draw-plan.ts` (pure,
  tested) + `BuildScene.ts` — the project's first real Phaser usage, dynamically imported only after
  a canvas-context check (Phaser probes rendering capability on import and would otherwise crash
  under jsdom).
- `src/ui`: `BuildModePanel.tsx` (palette tap-to-arm, undo/redo) + `SelectionActionBar.tsx`
  (rotate/remove/cancel), both Preact, both breakpoints. Interaction model decided via a design spec
  (`docs/superpowers/specs/2026-08-01-build-mode-view-design.md`), not improvised.
- First Playwright E2E suite in the project (`tests/e2e/build-mode.spec.ts`): places fixtures via
  palette-tap + canvas-tap and undoes every successful placement back to zero, at both a 1440×900
  and a 390×844 (touch-emulated) viewport — the literal PLAN.md 1.4 gate, proven end to end.
- Phaser adds ~358 KB gzipped to the game bundle (10.6% of the 3.5 MB budget) — `check:budget` still
  passes comfortably.

##### Fixed
- `BuildModePanel`'s Undo/Redo buttons mutated the bridge but never told the caller to re-render, so
  the on-screen placement count and disabled states never updated. Found by the E2E suite, not the
  unit tests — fixed with `onUndo`/`onRedo` callbacks mirroring the existing `onArm`/`onSelect`
  pattern.

#### Phase 1.5 — Pathing · **gate PASS**
- `src/sim/systems/pathing/`: `computeFlowField` — multi-source BFS (equivalent to Dijkstra under
  uniform per-cell cost) over `BuildGrid`'s walkable cells, with a second 8-connected pass for the
  direction field so arrows can point diagonally without ever cutting through a wall corner.
  `computeSteering` — separation (averaged across contributing neighbors, not summed — see Fixed
  below) blended with flow-following, clamped to `maxSpeed`, tapering to zero inside `arrivalRadius`.
- `PathingSystem` owns named destinations (`registerPathingDestination`/`unregisterPathingDestination`
  commands) and recomputes **at most one dirty destination per tick** — `BuildGrid` gained a `version`
  counter, and any version change marks every registered destination dirty, but they drain from a
  FIFO queue one at a time so an edit that dirties everything still costs one flow-field pass per
  tick, not a spike. The world hash covers the destination set and dirty queue, not the computed
  field arrays themselves — those are a pure function of already-hashed inputs.
- First use of `content/balance/*.json5` (`pathing.json5`): `maxSpeed`, `separationRadius`,
  `separationWeight`, `arrivalRadius`, Zod-validated. Loaded via Vite's `?raw` import suffix + the
  `json5` package — no bespoke loader plugin needed, works identically under `vite build` and
  `vitest`.
- Phase gate proof (`pathing.perf.test.ts`): 400 synthetic point-agents (no Agent/ECS system exists
  yet — that's phase 1.6) routed through a 60×40 grid with scattered obstacles to a multi-cell exit,
  1,000 ticks, zero agents stuck (no net progress for >100 consecutive ticks) — and `world.step()`
  itself (the pathing system's actual per-tick cost, excluding the test harness's own O(n²) neighbor
  search) averages well under the 1.5 ms budget.
- New `grid-and-pathing` golden scenario; the five pre-existing golden hashes are unchanged.
- Debug overlay: `BuildModeBridge#flowFieldDebug`, a pure `buildFlowFieldDrawPlan` (reuses `iso.ts`'s
  `worldToScreen`), and a "Flow" toggle in `BuildModePanel` rendering violet arrows (from
  `tokens.color.product.violet`) over `BuildScene`. E2E-covered at both breakpoints.

##### Fixed
- `computeSteering`'s separation force summed every contributing neighbor's push vector instead of
  averaging them, so in a dense cluster neighbor count alone could dominate — and even reverse — the
  desired velocity relative to the flow direction. That produced genuine gridlock (not just slow
  queuing) near the phase gate's exit. Found by the 400-agent perf test, not the steering unit tests
  (which only ever exercised 0–3 neighbors); fixed by averaging.

#### Phase 1.6 — Shoppers · **gate PASS**
- `src/sim/systems/goods/`: a goods catalog (`content/goods/catalog.json`, Zod-validated, same
  pattern as the fixture catalog) — `unitPrice`, `depletionPerDay`, `reorderThreshold`, `impulseBase`.
- `content/design/gentle-surface.json5` + `tools/check-gentle-surface.mjs` (wired into `npm run
  verify` as `check:content`): every satisfaction (§5.3) and impulse (§5.4) term now has a declared
  tell, CI-enforced per §12.1 — authored in full even though only `fillRateMiss` and
  `discovery`/`impulsePurchase` get an on-screen bubble this phase; the rest are ready for 1.7/1.8.
- `src/sim/systems/shoppers/`: household pantry/list (pure `advancePantryDay`/`deriveShoppingList`),
  and `ShoppersSystem` — `addHousehold`/`stockFixture`/`spawnShopper` commands, a shopper FSM
  (`entering → shopping → checkingOut → leaving`) driven by `PathingSystem`/`computeSteering`, the
  first real caller of the phase 1.5 API. Satisfaction sums only `fillRate` and `discovery` this
  phase; §5.3's other terms are wired as `0` pending 1.7 (spoilage) and 1.8 (checkout/staff).
  Impulse rolls use path exposure (§5.4) — only goods within a radius of where the shopper actually
  walked, using the `'impulse'` RNG stream reserved since phase 1.3.
- New `shopper-trip` golden scenario, locked over ~8,760 ticks (4 days of depletion + a full trip);
  the six pre-existing golden hashes are unchanged.
- `BuildModeBridge` gained a `tick()` — build mode was purely action-driven through phase 1.5, but
  pantries and shoppers need real time to pass with no UI interaction at all. `mountBuildMode` now
  drives one on a plain interval at the sim's tick rate; shoppers render as small token-colored
  circles.
- Content-schema-complete but **not yet on screen**: the gentle-surface bubbles themselves. That
  needs the view layer to consume `world.events` per tick, which nothing does yet — a documented
  follow-up, not a silent gap.

##### Fixed
- `computeFlowField`'s direction field (from phase 1.5) only guarded diagonal corner-cutting, not
  neighbor walkability outright, so it happily pointed straight into a non-walkable destination cell
  — harmless for 1.5's always-walkable destinations, wrong the moment a destination is a shelf or
  register (a shopper would walk *into* the fixture, then have no valid direction out of it toward
  its next target, since that field never assigned the fixture's own cell a distance). Neighbors now
  have to be walkable outright; a cell already adjacent to a non-walkable destination gets direction
  zero ("as close as you can get") instead. Found by the first end-to-end shopper trip test — 1.5's
  own tests never exercised a non-walkable destination.

#### Phase 1.7 — Inventory & suppliers · **gate PASS**
- `src/sim/systems/inventory/`: a supply policy per good (`content/inventory/policy.json`,
  Zod-validated, cross-referenced against `content/goods/catalog.json` — an unknown `goodId` or
  `orderUpToLevel <= reorderPoint` fails validation), a closed-form freshness curve (`freshnessAt`,
  PLAN.md §5.5's exact `f(t) = exp(-t/τ_sku)` — no discretization to lose accuracy, so there's
  nothing for a balance harness to reconcile against the formula), and `InventorySystem`.
- `InventorySystem` is fully autonomous (no commands): tracked **per good, not per physical shelf**
  (the store's total stock of "milk" is one ledger regardless of which fixture displays it — a
  documented scope cut). Each tick, lands any pending delivery, then places at most one reorder per
  good at or below its `(s,S)` reorder point — skipping goods already awaiting delivery, and
  respecting a store-wide `dockCapacity` so simultaneous reorders queue rather than all landing at
  once. Supplier reliability is a single roll per order (full quantity on success, half on failure)
  using the `'spoilage'` RNG stream reserved since phase 1.3, unused until now.
- `consume(goodId, tick)` draws one unit FIFO from the oldest batch and classifies the sale by that
  batch's freshness: `'sold'` above the markdown threshold, `'markdown'` (discounted, still
  fulfilling the list item) between markdown and shrink thresholds, `'spoiled'` below shrink (written
  off, not sold), `'outOfStock'` with nothing to draw from.
- Wired into `ShoppersSystem#stepShopping`, replacing the previous unconditional pickup. This finally
  gives real behavior to the `spoiledEncounters` satisfaction term (stubbed at `0` since phase 1.6,
  via a new `spoiledEncountersWeight` in `content/balance/shoppers.json5`) and to `priceSurprise`'s
  discount case in miniature (a markdown sale actually pays less). Sale totals now come from the
  shopper's own accumulated `cartTotal` (markdowns already applied) instead of being recomputed from
  catalog list price at checkout.
- Phase gate proof (`spoilage-economics.test.ts`): an "unattended" store (`dockCapacity: 0`, so no
  reorder can ever land) consuming one unit of milk per sim day runs out on the exact precomputed
  day — not approximately, precisely, since `consume()` is deterministic and freshness is
  closed-form. A second assertion confirms `freshnessAt` matches `exp(-t/τ)` within 2% at several
  ages (in practice, exactly — it *is* the formula).
- `shopper-trip` golden scenario re-baselined in its own commit (`InventorySystem` now registered
  alongside it, and `Shopper`'s hash gained `cartTotal`/`spoiledEncounters`) — confirmed the other
  five pre-existing scenarios were untouched before re-baselining, not assumed.
- **No dedicated "runs out" golden scenario.** `InventorySystem`'s own `system.test.ts` already
  covers reorder/dock-capacity/replay determinism, and the gate-proof test above adds the exact-day
  claim; a golden scenario driving `consume()` on a schedule with no shopper would need a new
  special-cased hook in `runScenario` for marginal benefit over what's already locked. Noted as a
  deliberate scope call, not an oversight.

##### Fixed
- None — no bugs found this phase's full end-to-end test (a first, after 1.4's undo/redo bug, 1.5's
  steering bug, and 1.6's two pathing/collision bugs, all found the same way).

#### Phase 1.8 — Checkout & staff · **gate PASS**
- `content/fixtures/catalog.json` gains `self_checkout` (a distinct fixture, not a flag on
  `register`). `content/balance/staffing.json5` + `src/sim/systems/checkout/`: `hireStaff` /
  `assignStaffToRegister` / `trainStaff` commands, and `CheckoutSystem` — one `Lane` per placed
  `register`/`self_checkout` instance (refreshed on grid version change, its own `PathingSystem`
  destination per lane, same pattern every system has used since 1.5). A register lane is open only
  with an assigned staff member; self-checkout is always open.
- Queueing: `joinQueue` starts service immediately on an empty lane, otherwise queues FIFO. Service
  time approximates §5.6's `~Gamma(items, scannerSpeed × cashierSkill)` via a deterministic formula
  scaled by staff skill × morale (a true Gamma sampler wasn't worth the numerical machinery for what
  this phase's gate needs — the mean scaling with staffing, not the distribution's exact shape).
  Below `balkToleranceTicks` a shopper just waits; between balk and abandon tolerance (2× per §5.6)
  each tick rolls an escalating balk chance using the `'checkout'` RNG stream (reserved since phase
  1.3, unused until now); at `abandonToleranceTicks` the exit is unconditional, so "abandoned" can't
  be starved out by "balked" always firing first.
- `ShoppersSystem#stepCheckingOut` rewritten: pick the shortest open lane (balking immediately if
  none are open at all — the understaffing story starts there), route to it, join its queue on
  arrival, poll `statusOf` each tick instead of instantly completing. Satisfaction gains `queuePenalty`
  (superlinear in wait time, finally live), a self-checkout service-score penalty, and an extra flat
  hit for cart abandonment (both balk and abandon saturate `queuePenalty` to its max, so
  `abandonExtraPenalty` is what keeps abandonment scoring strictly worse). `fillRate` now credits `0`
  for a balked/abandoned trip instead of counting a cart the shopper never actually left with.
  `shopperTripCompleted` gained explicit `balked`/`abandoned` fields — direct telemetry for exactly
  what this phase's gate asks to measure, not inferred from `fillRate === 0`.
- Cleanliness (0-1) decays every tick and is restored per assigned staff member — a real, simple
  lever tied to the same staff pool, though not yet consumed as a satisfaction term itself.
- Phase gate proof (`understaffing.test.ts`): identical store layout and shopper arrival cadence, only
  the staffed-register count differs (1 vs. 3) — understaffed produces a strictly longer visible
  queue, at least as many balked/abandoned trips, and a measurably lower average satisfaction. All
  four of the gate's claims asserted directly.
- `shopper-trip` golden scenario re-baselined twice in this phase, each in its own commit with the
  other five scenarios confirmed untouched first: once for `CheckoutSystem` joining the registered
  systems (and six new `Shopper` hash fields), once more for the lane-reservation fix below.

##### Fixed
- A real queueing bug, not just a test artifact: `shortestOpenLane()`'s "size" only counted people
  already in a lane's queue or being served — not shoppers who had already *picked* that lane but
  hadn't physically arrived yet. Several shoppers reaching checkout in a normal burst (not a
  contrived case) would all see the same lane as shortest before any of them had joined its queue,
  piling everyone onto one lane even with others sitting empty. `Lane` gained a `reserved` counter,
  incremented at pick time and released at the corresponding `joinQueue` call, counted toward lane
  size. Found writing the gate-proof test — the understaffed-vs-fully-staffed comparison couldn't
  show a difference until this was fixed, which is exactly the kind of thing a gate test is for.
- Also fixed, smaller: two of this phase's own new tests exposed pre-existing gaps rather than new
  regressions — a replay-fidelity gap in `shoppers/system.test.ts`'s hand-rolled log replay (fixed
  by switching to `core/world.js`'s `replay()`, which schedules each command against its real
  recorded tick instead of collapsing a multi-tick log onto tick 0) and two tests (one in
  `build-bridge.test.ts`, one in `shoppers/system.test.ts`) that assumed an unstaffed register would
  behave like a working checkout lane, which stopped being true the moment lanes became real.

#### Phase 1.9 — Economy & pricing · **gate PASS — M1 (Playable Core) complete**
- Every `GoodDef` now carries a `cost` (COGS) alongside `unitPrice` — nothing stops a price below it,
  which is what a loss leader is. `content/balance/economy.json5`: rent/utilities, the elasticity
  coefficient, `priceSurprise`'s satisfaction weight, and a loss-leader margin threshold.
- `src/sim/systems/economy/`: `EconomySystem` — `setPrice`/`startPromotion`/`setMarketingSpend`
  commands. `priceOf` resolves override price → catalog price → an active promotion's discount on
  top; `referencePriceOf` always returns the catalog price (the baseline `priceSurprise`/elasticity
  compare against, regardless of overrides). `isLossLeader` flags a good priced at or below
  `cost × lossLeaderMarginThreshold`.
- Daily P&L (§5.7) is built from a tagged ledger, not just aggregates, so any statement line drills
  to the exact entries that produced it — this phase's literal gate. `recordSale` is called directly
  by `ShoppersSystem` at the moment of sale; labor and spoilage pull from two new accessors,
  `CheckoutSystem#dailyWageCost` and `InventorySystem#drainSpoilageValue`. Shrink stays `0` — no
  theft mechanic exists yet, the same documented cut carried from 1.7/1.8.
- `ShoppersSystem` now prices goods through `EconomySystem#priceOf` instead of the static catalog
  `unitPrice`, so pricing commands actually change what a shopper pays. Each pickup computes
  `priceSurprise` against the catalog reference price (finally live, averaged into satisfaction at
  trip end); impulse rolls scale by an elasticity multiplier
  `(referencePrice/currentPrice)^elasticityCoefficient` — the mechanism a loss leader actually works
  through, since required list items are still bought regardless of price (a documented scope cut —
  price-driven substitution/store-choice is §5.1, M2/multi-store territory).
- Phase gate proof: a store pricing milk at cost (a genuine loss leader, zero margin on every
  required sale) alongside normal-margin goods stays EBITDA-positive on days with actual trade —
  normal-margin goods carry the P&L (`loss-leader.test.ts`). A second test confirms every statement
  line's ledger entries sum to exactly that line — revenue/cogs tagged at their real sale tick,
  rent/labor/spoilage as a single lump entry at the closing tick, both equally drillable.
- New `pricing-and-promotions` golden scenario; the seven pre-existing scenarios are unchanged.
  `shopper-trip` was re-baselined twice this phase (once for `EconomySystem` joining the registered
  systems and a new `Shopper.priceSurpriseSum` field, once more — see Fixed) — the other scenarios
  confirmed untouched before each re-baseline, not assumed.

##### Fixed
- No sim bugs this phase, but a real test-authoring lesson: the loss-leader gate test's first attempt
  measured EBITDA across the *entire* run, including 5 days of pure pantry-depletion wait with zero
  trade — fixed costs alone during that dead setup period would sink any pricing strategy, which
  said nothing about whether the loss leader itself was viable. Fixed by judging viability only on
  days that actually saw trade, and by scaling the test's fixed-cost config down to match its
  deliberately small shopper count rather than the authored production balance (documented in the
  test itself, not silently tuned).

**Milestone 1 (Playable Core) is complete as of this phase.** See `docs/handoff.md` for the M1 gate
assessment and what M2 inherits.

### Milestone 2 — Depth

#### Phase 2.0a — Household segments · **gate PASS**
- `src/sim/systems/market/`: the seven household segments (`priceHunter`, `convenience`, `family`,
  `foodie`, `bulk`, `senior`, `student`), each with store-choice utility weights (§5.1 — inert until
  the logit lands in a later 2.0 sub-phase) and a `consumptionMultiplier` that is live now.
  `content/balance/segments.json5` holds the values; `parseSegmentConfig` rejects a duplicate id, a
  missing segment, and an unknown one (`z.enum(SEGMENTS)` does the last).
- `Household` carries a required `segment`, and `addHousehold` requires one — there is no default,
  so every call site states its intent rather than inheriting a silent fallback.
- `advancePantryDay` scales each good's `depletionPerDay` by the household's `consumptionMultiplier`,
  making shopping frequency segment-dependent (§5.4). This is the phase gate: two households with
  identical starting pantries and the same catalog now deplete at provably different, deterministic
  rates (`household.test.ts`).
- `family` is deliberately the neutral segment (`consumptionMultiplier: 1.0`) so existing fixtures
  could adopt a segment without perturbing depletion *behavior*.
- The market API is re-exported from `src/sim/index.ts`, so the bridge keeps importing through the
  barrel rather than deep-importing a system.
- `shopper-trip` was re-baselined in its own commit: `ShoppersSystem#hash` now folds in
  `household.segment`, which shifts the recorded hash sequence even though `family`'s neutral
  multiplier leaves behavior unchanged. Tick count unchanged; the other nine scenarios were confirmed
  untouched before re-baselining, not assumed.

#### Phase 2.0b — Catchment graph & rival stores · **gate PASS**
- `Position` — an abstract integer coordinate on the coarse catchment grid. Deliberately not
  `pathing`'s `Vec2`: that is a continuous in-store position on the `BuildGrid`, and the two
  coordinate spaces never interact.
- `travelCost(a, b, config)` is **Manhattan, not Euclidean** — §5.1 specifies road-network distance
  on a coarse catchment graph, and Manhattan is the direct reading of that without modelling road
  geometry. A test asserts `(0,0)→(3,4)` costs 7 units and explicitly *not* the Euclidean 5, so a
  future straight-line "simplification" fails loudly.
- `RivalStore` (id, name, archetype, Community Love, position, identity, and the store-level
  `quality`/`service`/`ambiance` terms `U(h,s)` needs) plus `content/rivals/sav-a-lott.json5` —
  §3's L1 boss, `communityLove: 22`, logged in `docs/legal/parody-review.md` before implementation
  and now marked `implemented`. The other nine rivals are added when their level is built (§16
  phase 5.1); stubbing them now would be content no test could justify.
- `content/balance/catchment.json5` fixes the player's store at the origin — multi-store is a v2
  non-goal (§1.3), so a single fixed position is the honest model rather than a placeholder.
- `Household` and the `addHousehold` command both gain a required `position`, with no default, so
  every call site states its intent. Positions are caller-supplied, not sampled by the sim — the
  same stance 2.0a took on segments.
- **Nothing consumes `travelCost` yet.** There is still only one store to shop at, so a travel-cost
  number has nothing to influence. This phase proves the function and content are correct; the
  store-choice logit sub-phase is what reads them.
- `shopper-trip` was re-baselined in its own commit: `position` is new hashed state in
  `ShoppersSystem#hash`. Unlike 2.0a, no neutral value could have avoided this. Tick count
  unchanged; the other nine scenarios were confirmed untouched before re-baselining.

#### Phase 2.2 — Gentle surface · **gate PASS**
- All 15 declared tells in `content/design/gentle-surface.json5` (10 satisfaction + 5 impulse terms)
  now fire from a real sim signal and render as a placeholder-art marker in `BuildScene`, closing the
  gap `docs/handoff.md` had flagged since phase 1.6. One new `SimEvent` variant, `tellFired`
  (`shopperId`, `term`, `magnitude`, optional `worldRef`) rather than growing the union 15 cases —
  producers gate on each term's threshold, loaded once from a new `src/sim/content/gentle-surface.ts`
  loader (same `?raw` + JSON5 + Zod pattern every `content/balance/*` loader uses).
- Seven terms had no live sim signal at all before this phase and needed real (minimal) mechanics,
  reusing existing infrastructure rather than inventing new systems: `cleanlinessLow` and
  `staffInteractionGood`/`Absent` finally implement §5.3's long-absent `w6`/`w5` satisfaction terms
  (`CheckoutSystem.cleanliness()` and `StaffMember.morale` already existed, just unconsumed);
  `visibility` is a world-mark-only shelf-fullness bar (`InventorySystem.capacityOf` × `stockOf`, no
  event); `promoLift`/`adjacencyBonus`/`needState` are impulse-hit tags picked with precedence
  `adjacencyBonus > promoLift > needState > impulsePurchase` (a new `category` field on
  `content/goods/catalog.json` plus an authored combo table in `content/balance/market.json5`;
  `needState` reuses the existing `family` segment as a documented proxy — no "kids in trip" schema
  exists). `queuePenaltyRising`/`Balk` moved from a trip-end-only computation to a live per-tick check
  while queued.
- A pure `src/view/tell-draw-plan.ts` (same convention as `shopper-draw-plan.ts`) enforces
  `docs/design/gentle-surface.md` §3's "silence is a feature": one bubble per shopper (highest
  magnitude wins), then a hard cap on simultaneous markers. `BuildModeBridge` gained
  `pendingTells()`/`shelfFullness()`, the first consumers of `world.events` for anything beyond
  internal sim wiring.
- **A real, previously-invisible bug**, found building the phase's own gate-proof test (an adverse
  store exercising all 15 terms at once — `src/bridge/gentle-surface-gate.test.ts`): `ShoppersSystem`
  computed queue-penalty magnitude against the hardcoded `DEFAULT_STAFFING_CONFIG.balkToleranceTicks`
  instead of the actual `CheckoutSystem` instance's configured value. Invisible until now because
  every prior test either used the default config or happened to pass the same value as the default.
  Fixed with a new `CheckoutSystem#balkToleranceTicks()` accessor; no golden-hash impact beyond what
  cleanliness/staffInteraction already caused, since default-config scenarios compute the identical
  value before and after. Same "run it for real" pattern as every prior phase's gate-proof test.
- Golden re-baseline, its own commit: `shopper-trip`, `catchment-week`, `rival-reaction`, and
  `campaign-l1` moved (all exercise an active staffed checkout); the other nine scenarios were
  confirmed byte-identical first via a before/after diff, not assumed.
- An explicit, documented scope cut: richer per-term world marks (a spoiled-shelf tint, a persistent
  abandoned-cart object, a spill decal, a promo sign) are deferred — every `tellFired` event already
  carries `worldRef` when relevant, so a future pass can add them without touching the sim again. Not
  blocking this phase's gate, which only needs every term to fire and be visible in some form.
