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

### Milestone 2 — Surface (Track B)

*Runs in parallel with the depth track on `milestone/m2-depth` (ADR 0007). No change on this
track may move a world hash; the view is downstream of the simulation, so a moved hash is a
boundary violation to fix, never a re-baseline.*

#### ADRs 0004–0007
- **0004 — Orthogonal 3/4 projection.** Supersedes `PLAN.md` §9.1's 2:1 dimetric spec. Phaser 4's
  `TilemapGPULayer` is orthographic-only, so dimetric meant hand-writing the floor renderer;
  axis-aligned halves the sprite count per fixture, makes tap targets rectangles instead of
  diamonds, and stops tall shelves occluding the shoppers that carry the game's telemetry. Free to
  do now because zero art assets existed.
- **0005 — Pixel renderer strategy.** Phaser on WebGL with `pixelArt`, keeping the dynamic-import
  and `getContext` guard with a CANVAS fallback. A 32px logical tile with integer zoom, rather than
  a fixed 256×224 framebuffer — 256×224 scales by 1.52× on a 390px phone, which destroys the pixel
  grid on the primary target device.
- **0006 — Art as source code.** 16-bit sprites are small enough to author as text: a 16×24 shopper
  is 384 pixels, a character grid in a `.py` module, compiled to PNG by the build. Resolves the
  never-edit-binaries rule against having no pixel artist. Four routes — procedural, text sprite,
  Blender, generated image — feed one manifest through one quantize pass.
- **0007 — Parallel-track protocol.** Ownership of every shared file, and the no-moved-hash
  invariant.

#### Phase S0 — Art pipeline · **gate PASS**
- `npm run art:build` turns a manifest with zero real art into a complete, validated, packed atlas
  set: 30 declared assets → 179 frames → 3 atlases, all placeholders, game builds and boots.
- Placeholder-first (ADR 0006): a placeholder is the declared size, carries its layer's colour, is
  hatched so nobody mistakes it for finished art, and is labelled by a 3×5 font when it fits. A
  fully-placeholder store is still readable as a store, so renderer work never blocks on art work.
- The palette (`tools/art/palette.py`) is **derived from `content/design/tokens.json`**, so that file
  stays the single source of colour truth and `check-tokens.mjs` keeps working untouched.
- Frame-key enumeration lives only in `tools/art/manifest.py`; everything downstream reads the index
  it writes. `src/view/asset-manifest.ts` formats one key at a time rather than re-enumerating, and
  a parity test compares its enumeration against the index the build actually produced — verified to
  fail when the two drift.
- Five validation checks, each verified to fire: wrong dimensions, orphan files, manifest/disk case
  drift, a fixture anchored off its bottom edge, an unpacked frame. The case check cannot be tested
  by copying a file on macOS — which is exactly the macOS→Linux 404 hazard it exists for.
- Pipeline is idempotent: identical inputs produce byte-identical PNGs and atlases.
- `assets/atlases/` is committed and `assets/src/` is not. Netlify runs `vite build` and nothing
  else — no Python, no Blender — so the packed atlas is a build input. 16-bit art is small enough
  that this needs no Git LFS.
- The palette-swap multiplier in practice: one 16×24 text sprite × 2 states × 4 rotations × 2 frames
  × 7 segment palettes = 112 frames, which `detectIdentical` then packs into an 820-byte texture.

#### Phase S1 — Orthogonal renderer · **gate PASS**
- 514 sprites (400 floor tiles, 25 fixtures, 89 shoppers) at **0.15 ms per redraw** and a locked
  **60 fps at both 390×844 with touch and 1440×900**, no console errors at either. Golden hashes
  byte-identical.
- `src/view/iso.ts` retired for `projection.ts`. Depth is y-sort in fixed bands: floors always
  beneath, overlays always above, fixtures and agents interleaved by row — which is what makes a
  shopper walk behind one shelf and in front of the next.
- The pure `*-draw-plan` modules survive nearly unchanged in shape, still free of any Phaser import
  and still tested without a renderer. They now emit sprite plans instead of rect lists.
  `BuildScene` pools sprites rather than recreating them per frame.
- Camera pan rides the existing `dragMove` intent, so the platform boundary holds and no new pointer
  listener exists. Zoom is integer-only: 1× on a phone, 2× on a desktop.
- `shoppersSnapshot()` gains `segment` — the one append ADR 0007 permits — so shoppers can be
  palette-swapped to their household segment.

##### Fixed
- **The WebGL probe was breaking the thing it probed.** Calling `getContext('webgl2')` on the real
  canvas means Phaser's later `getContext('webgl')` on that same element returns `null` forever — a
  canvas hands out exactly one kind of context. The store failed to start with "WebGL unsupported"
  on a machine that supports it fine. Now probes a throwaway canvas. Caught only because the
  screenshot pass drove a real browser.
- **`src/main.ts` was still painting the old projection.** A phase-1.0 `paint()` drew a 128×64
  dimetric grid underneath Phaser, fought it for canvas sizing via its own DPR scaling, attached a
  second `PointerSource` to the same canvas, and covered the store with a panel reading *"the canvas
  is empty on purpose."* The diagnostics panel now appears only when the renderer genuinely cannot
  start — which is what the boot smoke test was actually asserting. This also retires the
  untokenized `#2b3a33` that `check-tokens.mjs` could not see, `src/main.ts` being outside its scan
  directories.
- **Panning did not compensate the tap transform for camera scroll**, so every tap after a pan
  landed in the wrong tile.
- `README.md`, `landing/index.html`, `index.html`, and `package.json` no longer describe the game as
  isometric (ADR 0004).

#### Phase S2 — Real art: the store reads · **gate PASS**
- **157 of 179 frames are real art.** The 22 that remain placeholder are the thought
  bubbles and UI frames that phases S3 and S4 own — which is placeholder-first working as
  designed, not an omission.
- House style is **chunky outlined**, chosen from three candidates rendered through the real
  pipeline rather than from a description. Every form carries a one-pixel ink outline: it is
  what welds separately-authored sprites into one world, and what keeps a 16×24 shopper
  readable at 1× on a 390 px screen.
- Characters are authored as text (ADR 0006). Three facings drawn by hand, `right` mirrored
  from `left`, three poses each for a two-frame walk. **One 16×24 grid becomes 112 frames**
  across seven segment palettes, and `detectIdentical` packs the whole agent atlas into 33 KB.
- Fixtures are generated, not drawn: shelves must exist in three stock states across two
  rotations and several widths — twenty sprites that must stay consistent by hand, or one
  function that cannot drift.
- `self_checkout` gets its own art (a screen on a post, unmistakably not a staffed lane).
  It had been falling through to the anonymous grey fallback since phase 1.4.

##### Fixed
- The first pass drew shelf carcasses in near-black, so an **empty shelf read as a hole in
  the floor** rather than as shelving with nothing on it — fatal, since `gentle-surface.md`
  calls the empty facing the single most important tell in the game. Lightened the carcass
  and added a recessed back panel behind bright planks.
- The register's lane light was a three-pixel dot floating in the corner of the frame,
  reading as a rendering artefact. It now sits on the register where a real one does, and an
  open lane is visible across a zoomed-out store.

##### Known gap, deliberately not closed here
- **The renderer accepts stock levels; the simulation cannot yet supply them.**
  `InventorySystem` tracks stock per *good*, and the shelf → good assignment lives in
  `ShoppersSystem`'s private `#stocking` map with no accessor. Exposing it is a `src/sim`
  change, which ADR 0007 assigns to Track A. `buildDrawPlan` therefore takes
  `stockLevels` as an argument and is ready the moment they exist; the gate screenshot
  drives them directly, which is what proves all three states render. **Wiring this is a
  one-line Track A task and is what makes the game's most important tell live.**

#### Phase S3 — The gentle surface: shoppers react · **gate PASS**
- **The tell table stops being a promise.** `content/design/gentle-surface.json5` has declared a
  bubble, animation, particle, world mark and threshold for every §5.3/§5.4 term since phase 1.1,
  CI-validated the whole time, and nothing in `src/view` had ever drawn one. Seven of the fifteen
  terms now fire in the game, on the exact condition the design doc names.
- **342 of 347 frames are real art**, up from 157 of 179. Twelve 12×12 thought-bubble icons authored
  as text, each with a distinct outer silhouette so colour is confirmation rather than the only
  difference — `exclamation`/`exclamationGold` is the one deliberate exception, and it is the same
  event at two rarities, which is what the design doc asks for. `bubble_frame` and `particle_flies`
  are generated instead of drawn, because they are shapes rather than pictures.
- **Three shared reaction poses, not fifteen.** `pause`, `recoil` and `hop` cover all seven live
  tells: the bubble is already unique per term and carries the primary signal (`gentle-surface.md`
  §12.1), so the body only has to say what *kind* of reaction it is. One grid per pose per facing;
  the second animation frame is derived — the head sinks a pixel for pause and recoil, the whole
  body lifts for hop — the same economy that makes `right` the mirror of `left`. 168 new frames
  took the agents atlas from 33 KB to 77 KB, against a budget the whole game uses 13% of.
- `src/view/gentle-surface-draw-plan.ts` decides which tell fires. It is pure, like every other
  `*-draw-plan`, and it computes nothing the simulation does not: every trigger is a delta over a
  counter `ShoppersSystem` already keeps *and already hashes*, or an event it already emits. That is
  what makes ADR 0007's no-moved-hash invariant true by construction rather than by care.
- **Silence is a feature, structurally.** `gentle-surface.md` §3's three rules are data shapes, not
  conventions somebody has to remember: thresholds come from the tell table, active bubbles are
  keyed by shopper id so one-bubble-per-shopper cannot be violated, and overflow past the
  per-breakpoint cap (8 at regular, 4 at compact) is dropped rather than queued.
- The rising-queue tell is **edge-triggered**: it fires the tick the wait crosses the declared 0.3,
  not every tick above it. Level-triggered, a long queue is a strobe.
- Three read-only bridge appends, the only kind ADR 0007 permits this track: the shopper counters,
  `drainEvents()`, and `currentTick()`. `drainEvents` had no consumer at all before this, which also
  means the event bus had been growing without bound for the life of a session.
- Verified in a real browser at **1440×900 and 390×844**, with an emergent scenario — shoppers
  arrive with real lists, the shelves run dry, one self-checkout cannot keep up — rather than a
  staged one. Golden hashes byte-identical.

##### Fixed
- **The fill-rate miss painted the shelf red.** The first pass flashed a tint for every tell
  declaring `worldMark: true`, but §1 says the miss's world mark is the empty facing itself. A dry
  shelf misses for every shopper who walks up to it, so the game's most common tell was also its
  loudest — and the colour said "error" where the design says "gap". Caught by looking at the first
  browser screenshot rather than by a test, which is the argument for taking the screenshot.
- `playwright.config.ts` takes a `PLAYWRIGHT_PORT` override. `reuseExistingServer` adopts whatever
  is already listening on 5173 — including an unrelated project's dev server, which then fails every
  test with a missing selector instead of an obvious error.

##### Known gaps, deliberately not closed here
- **Eight of the fifteen terms are drawn but wired to nothing.** `staffInteractionGood`,
  `staffInteractionAbsent` and `cleanlinessLow` have no sim mechanic (`ShoppersSystem`'s own comment:
  "not consumed yet"); `adjacencyBonus`, `promoLift` and `needState` have no term in `#rollImpulse`;
  `visibility` is already satisfied by S2's shelf states and needs nothing. `discovery` is the
  interesting one: it and `impulsePurchase` both trace to the same `impulseHits` increment, and the
  sim has no signal distinguishing an ordinary impulse buy from a delightful discovery. Firing both
  bubbles for one event would break the one-bubble-per-shopper rule and overstate what the sim
  knows, so the literal, unambiguous term fires and `discovery` waits for a real signal. All eight
  have manifest-declared art and will light up the day a Track A change adds the mechanic — the same
  placeholder-first pattern S2 used for stock levels.
- **`queuePenaltyBalk` cannot be reached from the bridge**, so the browser check does not exercise
  it. It fires off the `cartAbandoned` event, which needs a shopper to wait out
  `abandonToleranceTicks` (400) in a queue; `CheckoutSystem` caps its queue well before that, and no
  command assigns staff, so a staffed register never opens a lane at all. Crowding the store harder
  plateaus the longest wait at ~290 ticks. The trigger is covered against hand-built snapshots in
  the unit tests; making it reachable is a Track A concern.
- **The queue-penalty exponent (1.6) is copied, not imported.** It is written inline in
  `ShoppersSystem#stepLeaving` rather than exported. A test pins the view's copy to the sim's
  formula; if Track A exports it, delete the copy.
- **The abandoned cart fades on a timer.** Its tell says it "persists until staff clears it", and
  there is no staff-clearing mechanic. The marker is view-local with a fixed lifetime — the same
  category of documented simplification as 1.7's per-good inventory tracking.
