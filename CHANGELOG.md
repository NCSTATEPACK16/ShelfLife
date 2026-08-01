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
