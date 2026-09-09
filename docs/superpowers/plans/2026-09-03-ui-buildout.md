# UI Build-out (Phase 2.3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents — this
> project's established pattern (see `docs/handoff.md`).

**Goal:** Ship the Preact overlay (HUD, finance dashboard, pricing, staff, inventory, rival intel,
objective tracker, advisors, chapter cards) that turns the fully-tested-but-invisible sim/campaign
stack into something a stranger can actually play on a phone — PLAN.md §16 phase 2.3's gate.

**Architecture:** Merge `BuildModeBridge` into `CampaignBridge` so one bridge carries both the
campaign/objective surface and the full build/stock/price/staff command surface. Add the six
missing pricing/staff bridge commands (the sim commands already exist) and five new read
accessors (finance, staff roster, rival intel, inventory levels, objective progress). Build the
HUD/advisor/panel layer as Preact components reading only those accessors, mounted by a new
`campaign-mode.ts` that replaces `build-mode.ts`.

**Tech Stack:** TypeScript strict, Preact (no signals needed for this phase — plain
render-on-mutation matches the existing `build-mode.ts` pattern), Vitest, Playwright, Zod/JSON5
content (unchanged), `content/design/tokens.json`.

**Spec:** `docs/superpowers/specs/2026-09-03-ui-buildout-design.md`

## Global Constraints

- `src/sim/**` gets zero new imports from Phaser/DOM/window (unchanged boundary) — every task
  touching `src/sim` is a thin accessor with no new mechanic.
- No raw pointer/mouse/touch listeners outside `src/platform/input` — panels are plain Preact
  `onClick` handlers, not new input plumbing.
- Every UI file styles exclusively from `content/design/tokens.json` — a hardcoded hex fails
  `tools/check-tokens.mjs`.
- Compact breakpoint is built first in every panel; regular is the same component with a layout
  branch, per `src/platform/layout`'s `Breakpoint` type — never a regular-only panel.
- Every interactive element keeps a `data-testid` and a `min-width:44px;min-height:44px` hit
  target, matching `BuildModePanel.tsx`/`SelectionActionBar.tsx`'s existing convention.
- No control renders inside the bottom 34px on compact (`tokens.layout.homeIndicatorGuard`).
- Every KPI display pairs its number with a trailing average or rival benchmark — never a bare
  number (PLAN.md §12.4) — enforced by code review at each panel task, not by a lint rule.
- `npm run typecheck` and the task's own targeted `vitest` file(s) after every task; full
  `npm run verify` + `npm run test:e2e` only at the plan's final gate task.
- If a golden hash moves, STOP — every change in this plan wraps already-hashed, already-tested
  paths; a hash moving means a "thin wrapper" became a behavior change.

---

### Task 1: `CheckoutSystem#staffIds()`

**Files:**
- Modify: `src/sim/systems/checkout/system.ts` (add method near `staff()`, line ~120)
- Test: `src/sim/systems/checkout/system.test.ts`

**Interfaces:**
- Produces: `CheckoutSystem#staffIds(): readonly number[]` — every hired staff id, ascending.

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/systems/checkout/system.test.ts — add near the existing 'staff'-hiring tests
it('staffIds lists every hired staff member, ascending', () => {
  const system = freshCheckoutSystem(); // use this file's existing test-world helper
  world.commands.push({ type: 'hireStaff', staffId: 5, skill: 0.8, morale: 0.9 });
  world.commands.push({ type: 'hireStaff', staffId: 2, skill: 0.6, morale: 0.7 });
  world.step();
  expect(system.staffIds()).toEqual([2, 5]);
});
```

Match this file's existing setup helper name exactly (read the top of
`src/sim/systems/checkout/system.test.ts` first — every other `hireStaff` test already has a
working `world`/`system` fixture to copy).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/checkout/system.test.ts -t staffIds`
Expected: FAIL — `system.staffIds is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sim/systems/checkout/system.ts, directly above `staff(id: number): StaffMember {`
staffIds(): readonly number[] {
  return [...this.#staff.keys()].sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/checkout/system.test.ts`
Expected: PASS, all existing tests in the file still green

- [ ] **Step 5: Commit**

```bash
git add src/sim/systems/checkout/system.ts src/sim/systems/checkout/system.test.ts
git commit -m "feat(checkout): add CheckoutSystem#staffIds accessor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 2: `CampaignSystem#objectiveProgress()`

**Files:**
- Modify: `src/sim/systems/campaign/system.ts`
- Modify: `src/sim/index.ts` (no export change needed — `CampaignSystem` is already exported;
  the new method is just a method on an already-exported class)
- Test: `src/sim/systems/campaign/system.test.ts`

**Interfaces:**
- Consumes: `TripCounter#dailyCounts()`, `computeShareTrajectory` (both already imported in
  `system.ts`).
- Produces: `CampaignSystem#objectiveProgress(): { readonly current: number; readonly target:
  number }` — `current` is the latest trailing-window share (0 if no trips yet, i.e. `NaN` from
  `computeShareTrajectory` coerced to 0 — an early-game "no data" state, not a crash), `target` is
  the current chapter's `objective.threshold`. Once the level is no longer `inProgress`, returns
  `{ current: 1, target: 1 }` (nothing left to track).

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/systems/campaign/system.test.ts — add near the existing chapter-completion tests
it('objectiveProgress reports 0 before any trips and the real trailing share after some', () => {
  const { world, campaign } = freshCampaignSystem(); // this file's existing fixture builder
  expect(campaign.objectiveProgress()).toEqual({ current: 0, target: 0.15 }); // l1 ch1 threshold

  // Drive enough player-only trips to move the trailing share off zero.
  for (let day = 0; day < 7; day++) {
    for (let i = 0; i < 1440; i++) world.step();
  }
  const progress = campaign.objectiveProgress();
  expect(progress.target).toBe(0.15);
  expect(progress.current).toBeGreaterThanOrEqual(0);
});
```

Check this file's existing fixture-builder name and the exact threshold for whichever level id
it already constructs (read the file first — reuse its existing `LevelDef`/world-building helper
rather than inventing a new one; adjust the `0.15` literal above to match whatever threshold that
fixture's chapter 1 actually authors).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/campaign/system.test.ts -t objectiveProgress`
Expected: FAIL — `campaign.objectiveProgress is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sim/systems/campaign/system.ts, inside CampaignSystem, near state()
objectiveProgress(): { readonly current: number; readonly target: number } {
  if (this.#levelStatus !== 'inProgress' || this.#chapterStatus !== 'inProgress') {
    return { current: 1, target: 1 };
  }
  const chapter = this.#level.chapters[this.#chapterIndex]!;
  const trajectory = computeShareTrajectory(this.#tripCounter.dailyCounts(), chapter.objective.trailingWindowDays);
  const last = trajectory[trajectory.length - 1];
  return { current: Number.isNaN(last) ? 0 : (last ?? 0), target: chapter.objective.threshold };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/campaign/system.test.ts`
Expected: PASS, all existing tests in the file still green

- [ ] **Step 5: Commit**

```bash
git add src/sim/systems/campaign/system.ts src/sim/systems/campaign/system.test.ts
git commit -m "feat(campaign): add CampaignSystem#objectiveProgress accessor

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 3: `registerCampaignSystems` returns the full system set

**Files:**
- Modify: `src/sim/campaignWorld.ts`
- Test: `src/sim/campaignWorld.test.ts`

**Interfaces:**
- Produces: `CampaignWorldHandle` grows from `{ world, campaign }` to `{ world, campaign, grid,
  pathing, inventory, checkout, economy, rivals, market, shoppers }` — every system
  `registerCampaignSystems` already builds locally, now returned instead of discarded. Existing
  consumers (`buildCampaignWorld`, `loadCampaignWorld`, and every test that destructures `{
  world }` or `{ campaign }`) are unaffected — this is purely additive on the returned object.

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/campaignWorld.test.ts — add to the 'buildCampaignWorld' describe block
it('returns every registered system, not just world and campaign', () => {
  const handle = buildCampaignWorld('l1', 1);
  expect(handle.grid).toBeDefined();
  expect(handle.pathing).toBeDefined();
  expect(handle.inventory).toBeDefined();
  expect(handle.checkout).toBeDefined();
  expect(handle.economy).toBeDefined();
  expect(handle.rivals).toBeDefined();
  expect(handle.market).toBeDefined();
  expect(handle.shoppers).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/campaignWorld.test.ts -t "every registered system"`
Expected: FAIL — `handle.grid` etc. are `undefined`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/sim/campaignWorld.ts

export interface CampaignWorldHandle {
  readonly world: World;
  readonly campaign: CampaignSystem;
  readonly grid: GridSystem;
  readonly pathing: PathingSystem;
  readonly inventory: InventorySystem;
  readonly checkout: CheckoutSystem;
  readonly economy: EconomySystem;
  readonly rivals: RivalsSystem;
  readonly market: MarketSystem;
  readonly shoppers: ShoppersSystem;
}

interface RegisteredCampaign {
  readonly campaign: CampaignSystem;
  readonly households: readonly GeneratedHousehold[];
  readonly grid: GridSystem;
  readonly pathing: PathingSystem;
  readonly inventory: InventorySystem;
  readonly checkout: CheckoutSystem;
  readonly economy: EconomySystem;
  readonly rivals: RivalsSystem;
  readonly market: MarketSystem;
  readonly shoppers: ShoppersSystem;
}

function registerCampaignSystems(world: World, levelId: string): RegisteredCampaign {
  const level = buildLevelDef(levelId);
  const grid = new GridSystem(CAMPAIGN_GRID_DIMENSIONS);
  world.register(grid);
  const pathing = new PathingSystem(grid.grid);
  world.register(pathing);
  const inventory = new InventorySystem();
  world.register(inventory);
  const checkout = new CheckoutSystem(grid.grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory);
  world.register(economy);

  const rivalRoster = DEFAULT_RIVAL_STORES.filter((r) => r.id === level.rivalId);
  const marketBox: { current?: MarketSystem } = {};
  const rivals = new RivalsSystem(
    {
      outcomes: () => marketBox.current!.pendingOutcomes(),
      playerPriceLevel: () => economy.priceLevel(world.tick),
    },
    rivalRoster,
  );
  world.register(rivals);
  const loyalty = new LoyaltySystem(
    {
      householdIds: () => marketBox.current!.householdIds(),
      pendingOutcomes: () => marketBox.current!.pendingOutcomes(),
    },
    rivals,
  );
  const market = new MarketSystem({ inventory, checkout, economy, loyalty }, undefined, undefined, rivals);
  marketBox.current = market;
  world.register(market);
  const shoppers = new ShoppersSystem(market, grid.grid, pathing, inventory, checkout, economy);
  world.register(shoppers);
  world.register(loyalty);
  world.register(new ReputationSystem(market, loyalty));

  const campaign = new CampaignSystem(market, economy, level);
  world.register(campaign);

  const households = generateHouseholds(world.rng.get('campaign'), level.households, rivalRoster);
  return { campaign, households, grid, pathing, inventory, checkout, economy, rivals, market, shoppers };
}

export function buildCampaignWorld(levelId: string, seed: number): CampaignWorldHandle {
  const world = new World({ seed });
  const registered = registerCampaignSystems(world, levelId);
  const level = registered.campaign.level;

  for (const command of level.startingStore) world.commands.push(command);
  for (const h of registered.households) {
    world.commands.push({ type: 'addHousehold', householdId: h.householdId, segment: h.segment, position: h.position });
  }

  return { world, ...registered };
}

export function loadCampaignWorld(save: SaveEnvelope): CampaignWorldHandle {
  let registered!: RegisteredCampaign;
  const world = replay(save.seed, save.commandLog, save.tick, (w) => {
    registered = registerCampaignSystems(w, save.levelId);
  });
  return { world, ...registered };
}
```

`households` stays on `RegisteredCampaign` (internal) but is not part of the public
`CampaignWorldHandle` — nothing outside this file needs it, matching today's behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/campaignWorld.test.ts`
Expected: PASS, all existing tests in the file still green (they destructure `{ world }`/`{
campaign }` only, unaffected by the additive fields)

- [ ] **Step 5: Commit**

```bash
git add src/sim/campaignWorld.ts src/sim/campaignWorld.test.ts
git commit -m "feat(sim): expose every registered system from CampaignWorldHandle

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 4: `CampaignBridge` absorbs `BuildModeBridge`'s command/accessor surface

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Consumes: `CampaignWorldHandle` (Task 3) — `grid`, `pathing`, `inventory`, `checkout`,
  `economy`, `shoppers`.
- Produces: `CampaignBridge` gains `place`, `rotate`, `remove`, `undo`, `redo`, `hasUndo`,
  `hasRedo`, `registerDestination`, `unregisterDestination`, `flowFieldDebug`, `addHousehold`,
  `stockFixture`, `spawnShopper`, `shoppersSnapshot`, `pendingTells`, `shelfFullness`, `snapshot`
  — same signatures `BuildModeBridge` had. A new exported `CampaignSnapshot` type (was
  `BuildModeSnapshot`). `tick()` stays as `CampaignBridge` already has it (async, drains events) —
  `BuildModeBridge`'s sync `tick()` is not carried over; every migrated caller now awaits it.

- [ ] **Step 1: Write the failing tests**

Add to `src/bridge/campaign-bridge.test.ts` (new top-level `describe` blocks, one per migrated
method — this mirrors `build-bridge.test.ts`'s coverage exactly, adapted to construct via
`CampaignBridge.start('l1', seed)` instead of a bare `GridDimensions`, and to `await` `tick()`):

```ts
describe('CampaignBridge — build/stock/shopper surface', () => {
  it('places a fixture and reflects it in the snapshot', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const snap = bridge.snapshot();
    expect(snap.placements.some((p) => p.fixtureId === 'shelf_basic')).toBe(true);
  });

  it('rotates and removes a fixture', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const placed = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!;
    bridge.rotate(placed.instanceId, 90);
    expect(bridge.snapshot().placements.find((p) => p.instanceId === placed.instanceId)?.rotation).toBe(90);
    bridge.remove(placed.instanceId);
    expect(bridge.snapshot().placements.some((p) => p.instanceId === placed.instanceId)).toBe(false);
  });

  it('undo/redo round-trip through the bridge', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const before = bridge.snapshot().placements.length;
    bridge.place('shelf_basic', 2, 2, 0);
    expect(bridge.undo()).toBe(true);
    expect(bridge.snapshot().placements.length).toBe(before);
    expect(bridge.redo()).toBe(true);
    expect(bridge.snapshot().placements.length).toBe(before + 1);
  });

  it('hasUndo/hasRedo pass through the grid stack state', () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.hasUndo()).toBe(false);
    bridge.place('shelf_basic', 2, 2, 0);
    expect(bridge.hasUndo()).toBe(true);
    bridge.undo();
    expect(bridge.hasRedo()).toBe(true);
  });

  it('registers a pathing destination and exposes its flow field for debugging', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.registerDestination('debug-exit', [{ x: 9, y: 9 }]);
    const field = bridge.flowFieldDebug('debug-exit');
    expect(field.length).toBeGreaterThan(0);
  });

  it('unregisters a pathing destination', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.registerDestination('debug-exit', [{ x: 9, y: 9 }]);
    bridge.unregisterDestination('debug-exit');
    expect(() => bridge.flowFieldDebug('debug-exit')).toThrow();
  });

  it('adds a household, stocks a fixture, and spawns a shopper visible in the snapshot', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const instanceId = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!.instanceId;
    bridge.stockFixture(instanceId, 'milk');
    bridge.addHousehold(9001, 'family', { x: 0, y: 0 });
    bridge.spawnShopper(9002, 9001);
    expect(bridge.shoppersSnapshot().some((s) => s.id === 9002)).toBe(true);
  });

  it('shelfFullness reports a stocked shelf\'s fraction of capacity', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('shelf_basic', 2, 2, 0);
    const instanceId = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!.instanceId;
    bridge.stockFixture(instanceId, 'milk');
    const fullness = bridge.shelfFullness();
    expect(fullness.find((f) => f.instanceId === instanceId)?.fraction).toBeGreaterThan(0);
  });

  it('pendingTells drains tellFired events since the last read', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.addHousehold(9001, 'family', { x: 0, y: 0 });
    // No checkout fixture placed — a guaranteed instant balk once checkingOut is reached.
    bridge.spawnShopper(9002, 9001);
    let sawFirst: readonly { shopperId: number }[] = [];
    for (let i = 0; i < 2000 && bridge.shoppersSnapshot().some((s) => s.id === 9002); i++) {
      await bridge.tick();
      const tells = bridge.pendingTells();
      if (tells.length > 0) sawFirst = tells;
    }
    expect(sawFirst.length).toBeGreaterThan(0);
    expect(bridge.pendingTells()).toHaveLength(0);
  });
});
```

Note every place/stock test above uses a fresh, high household/shopper id (9001+) to avoid
colliding with `l1`'s own generated households (ids `1..24`, Task 3's existing
`generateHouseholds`) — the l1 starting store already exists via `startingStore`, so tests use
`snapshot().placements.find(...)` rather than assuming an empty grid, unlike the old
`build-bridge.test.ts`'s bare-`GridDimensions` constructor.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: FAIL — `bridge.place is not a function` (and similar) for every new `it`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts — full rewrite of the class body
import { canPlay } from '../platform/entitlements/index.js';
import { markLevelComplete } from '../platform/profile/index.js';
import {
  buildCampaignWorld,
  loadCampaignWorld,
  type CampaignState,
  type CampaignSystem,
  type CheckoutSystem,
  type EconomySystem,
  type FixtureDef,
  type GoodDef,
  type GridDimensions,
  type GridSystem,
  type InventorySystem,
  type MarketSystem,
  type PathingSystem,
  type Placement,
  type Position,
  type RivalsSystem,
  type Rotation,
  type SaveEnvelope,
  type Segment,
  type ShopperState,
  type ShoppersSystem,
  type SimEvent,
  type World,
  DEFAULT_CATALOG,
} from '../sim/index.js';
import type { TellOccurrence } from '../view/tell-draw-plan.js';

export interface CampaignSnapshot {
  readonly dimensions: GridDimensions;
  readonly catalog: readonly FixtureDef[];
  readonly placements: readonly Placement[];
}

/**
 * The only thing in the codebase that turns UI actions into World commands for real campaign
 * play. Absorbed BuildModeBridge's entire surface (phase 2.3) — see
 * docs/superpowers/specs/2026-09-03-ui-buildout-design.md §1 for why the two bridges existed
 * separately until now and why that was a real problem, not a style choice.
 */
export class CampaignBridge {
  readonly #world: World;
  #campaign: CampaignSystem;
  readonly #grid: GridSystem;
  readonly #pathing: PathingSystem;
  readonly #inventory: InventorySystem;
  readonly #checkout: CheckoutSystem;
  readonly #economy: EconomySystem;
  readonly #rivals: RivalsSystem;
  readonly #market: MarketSystem;
  readonly #shoppers: ShoppersSystem;

  private constructor(
    world: World,
    campaign: CampaignSystem,
    grid: GridSystem,
    pathing: PathingSystem,
    inventory: InventorySystem,
    checkout: CheckoutSystem,
    economy: EconomySystem,
    rivals: RivalsSystem,
    market: MarketSystem,
    shoppers: ShoppersSystem,
  ) {
    this.#world = world;
    this.#campaign = campaign;
    this.#grid = grid;
    this.#pathing = pathing;
    this.#inventory = inventory;
    this.#checkout = checkout;
    this.#economy = economy;
    this.#rivals = rivals;
    this.#market = market;
    this.#shoppers = shoppers;
  }

  static start(levelId: string, seed: number): CampaignBridge {
    if (!canPlay(levelId, 0)) {
      throw new Error(`Not entitled to play level "${levelId}"`);
    }
    const h = buildCampaignWorld(levelId, seed);
    return new CampaignBridge(
      h.world, h.campaign, h.grid, h.pathing, h.inventory, h.checkout, h.economy, h.rivals, h.market, h.shoppers,
    );
  }

  static resume(save: SaveEnvelope): CampaignBridge {
    const h = loadCampaignWorld(save);
    const state = h.campaign.state();
    if (!canPlay(state.levelId, state.chapterIndex)) {
      throw new Error(`Not entitled to resume level "${state.levelId}" at chapter ${state.chapterIndex}`);
    }
    return new CampaignBridge(
      h.world, h.campaign, h.grid, h.pathing, h.inventory, h.checkout, h.economy, h.rivals, h.market, h.shoppers,
    );
  }

  get state(): CampaignState {
    return this.#campaign.state();
  }

  async tick(): Promise<void> {
    this.#world.step();
    await this.#handleEvents();
  }

  async advanceChapter(): Promise<boolean> {
    const before = this.state;
    const isLastChapter = before.chapterIndex === this.#campaign.level.chapters.length - 1;
    const targetChapterIndex = isLastChapter ? before.chapterIndex : before.chapterIndex + 1;
    if (!canPlay(before.levelId, targetChapterIndex)) return false;

    this.#world.commands.push({ type: 'advanceChapter' });
    this.#world.step();
    await this.#handleEvents();
    return true;
  }

  save(): SaveEnvelope {
    return {
      version: 1,
      levelId: this.state.levelId,
      seed: this.#world.seed,
      tick: this.#world.tick,
      commandLog: this.#world.commands.log,
    };
  }

  /* ── Build/stock/shopper surface, migrated from BuildModeBridge (phase 2.3) ──────────── */

  place(fixtureId: string, x: number, y: number, rotation: Rotation): void {
    this.#step({ type: 'placeFixture', fixtureId, x, y, rotation });
  }

  rotate(instanceId: number, rotation: Rotation): void {
    this.#step({ type: 'rotateFixture', instanceId, rotation });
  }

  remove(instanceId: number): void {
    this.#step({ type: 'removeFixture', instanceId });
  }

  undo(): boolean {
    const hadUndo = this.#grid.grid.hasUndo();
    this.#step({ type: 'undoBuild' });
    return hadUndo;
  }

  redo(): boolean {
    const hadRedo = this.#grid.grid.hasRedo();
    this.#step({ type: 'redoBuild' });
    return hadRedo;
  }

  hasUndo(): boolean {
    return this.#grid.grid.hasUndo();
  }

  hasRedo(): boolean {
    return this.#grid.grid.hasRedo();
  }

  registerDestination(id: string, cells: readonly { x: number; y: number }[]): void {
    this.#step({ type: 'registerPathingDestination', destinationId: id, cells });
  }

  unregisterDestination(id: string): void {
    this.#step({ type: 'unregisterPathingDestination', destinationId: id });
  }

  flowFieldDebug(destinationId: string): readonly { x: number; y: number; dx: number; dy: number }[] {
    const { width, height } = this.#grid.grid.dimensions;
    const out: { x: number; y: number; dx: number; dy: number }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!this.#grid.grid.isWalkable(x, y)) continue;
        const dir = this.#pathing.directionAt(destinationId, x, y);
        out.push({ x, y, dx: dir.x, dy: dir.y });
      }
    }
    return out;
  }

  addHousehold(householdId: number, segment: Segment, position: Position): void {
    this.#step({ type: 'addHousehold', householdId, segment, position });
  }

  stockFixture(instanceId: number, goodId: string): void {
    this.#step({ type: 'stockFixture', instanceId, goodId });
  }

  spawnShopper(shopperId: number, householdId: number): void {
    this.#step({ type: 'spawnShopper', shopperId, householdId });
  }

  shoppersSnapshot(): readonly { id: number; x: number; y: number; state: ShopperState }[] {
    return this.#shoppers.activeShopperIds().map((id) => {
      const shopper = this.#shoppers.shopper(id);
      return { id: shopper.id, x: shopper.position.x, y: shopper.position.y, state: shopper.state };
    });
  }

  pendingTells(): readonly TellOccurrence[] {
    return this.#world.events
      .drain()
      .filter((e): e is Extract<SimEvent, { type: 'tellFired' }> => e.type === 'tellFired')
      .map((e) => ({ shopperId: e.shopperId, term: e.term, magnitude: e.magnitude }));
  }

  shelfFullness(): readonly { instanceId: number; fraction: number }[] {
    const result: { instanceId: number; fraction: number }[] = [];
    for (const placement of this.#grid.grid.placements()) {
      const goodId = this.#shoppers.stockedGoodAt(placement.instanceId);
      if (!goodId) continue;
      const capacity = this.#inventory.capacityOf(goodId);
      const fraction = capacity > 0 ? Math.min(1, this.#inventory.stockOf(goodId) / capacity) : 0;
      result.push({ instanceId: placement.instanceId, fraction });
    }
    return result;
  }

  snapshot(): CampaignSnapshot {
    return {
      dimensions: this.#grid.grid.dimensions,
      catalog: DEFAULT_CATALOG,
      placements: this.#grid.grid.placements(),
    };
  }

  #step(command: Parameters<World['commands']['push']>[0]): void {
    this.#world.commands.push(command);
    this.#world.step();
  }

  async #handleEvents(): Promise<void> {
    for (const event of this.#world.events.drain()) {
      if (event.type === 'levelWon') {
        await markLevelComplete(event.levelId);
      }
    }
  }
}
```

Note `pendingTells()` drains `world.events` and `#handleEvents()` (called from `tick()`/
`advanceChapter()`) also drains it — same as before this task, both already coexisted in
`BuildModeBridge`/`CampaignBridge` independently; draining is idempotent (each call only sees
events emitted since the last drain), so this is not a new interaction, just now living in one
class. `GoodDef` import is added to the type-only import list for use in Task 5/8's accessors
appended in this same file later — if the linter flags it unused after this task alone, drop it
here and re-add in Task 8.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS, all tests (existing + new) green

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): CampaignBridge absorbs BuildModeBridge's build/stock/shopper surface

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 5: Delete `BuildModeBridge`; repoint every importer

**Files:**
- Delete: `src/bridge/build-bridge.ts`
- Delete: `src/bridge/build-bridge.test.ts`
- Modify: `src/view/draw-plan.ts` (import `CampaignSnapshot` instead of `BuildModeSnapshot`)
- Modify: `src/view/draw-plan.test.ts` (same import swap)
- Modify: `src/view/BuildScene.ts` (import `CampaignBridge` instead of `BuildModeBridge`)
- Modify: `src/ui/BuildModePanel.tsx` (same import swap)
- Modify: `src/ui/BuildModePanel.test.tsx` (construct via `CampaignBridge.start('l1', seed)`
  instead of `new BuildModeBridge({...})`)

**Interfaces:**
- Consumes: `CampaignBridge`, `CampaignSnapshot` (Task 4).

- [ ] **Step 1: Confirm the current importer list, then delete**

Run: `git rm src/bridge/build-bridge.ts src/bridge/build-bridge.test.ts`

- [ ] **Step 2: Update `draw-plan.ts` and `draw-plan.test.ts`**

```ts
// src/view/draw-plan.ts, line 1
import type { CampaignSnapshot } from '../bridge/campaign-bridge.js';
// ...and change the buildDrawPlan signature's `snapshot: BuildModeSnapshot` to `snapshot: CampaignSnapshot`
```

In `src/view/draw-plan.test.ts`, change any `BuildModeSnapshot`-typed fixture object literal's
type annotation (if any — most likely the test builds a plain object literal with no explicit
type annotation, in which case nothing changes there) to `CampaignSnapshot`; if the test imports
`BuildModeBridge` at all, switch it to build a `CampaignBridge.start('l1', 1).snapshot()` call
instead of a hand-built fixture, matching whatever pattern the file already uses most.

- [ ] **Step 3: Update `BuildScene.ts`**

```ts
// src/view/BuildScene.ts, line 2
import type { CampaignBridge } from '../bridge/campaign-bridge.js';
// ...and change every `BuildModeBridge` type reference in the class to `CampaignBridge`
```

- [ ] **Step 4: Update `BuildModePanel.tsx` and its test**

```ts
// src/ui/BuildModePanel.tsx, line 1
import type { CampaignBridge } from '../bridge/campaign-bridge.js';
// BuildModePanelProps.bridge: CampaignBridge
```

```tsx
// src/ui/BuildModePanel.test.tsx
import { CampaignBridge } from '../bridge/campaign-bridge.js';

function mount(bridge: CampaignBridge, breakpoint: 'compact' | 'regular' = 'compact'): HTMLDivElement {
  // unchanged body
}

describe('BuildModePanel', () => {
  let bridge: CampaignBridge;

  beforeEach(() => {
    bridge = CampaignBridge.start('l1', 1);
  });
  // ... existing `it` blocks unchanged — they only call bridge.snapshot()/hasUndo()/hasRedo(),
  // all of which CampaignBridge now has identically.
```

- [ ] **Step 5: Run the full unit suite and typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — no remaining reference to `build-bridge.js` or `BuildModeBridge` anywhere
(confirm with `grep -rn "BuildModeBridge\|build-bridge" src/` — expect zero matches)

Run: `npx vitest run src/view/draw-plan.test.ts src/ui/BuildModePanel.test.tsx src/bridge/campaign-bridge.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete BuildModeBridge, repoint every importer at CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 6: Pricing commands + accessors on `CampaignBridge`

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Produces: `setPrice(goodId: string, price: number): void`, `startPromotion(goodId: string,
  discountFraction: number, durationTicks: number): void`, `setMarketingSpend(dailyAmount:
  number): void`, `priceOf(goodId: string): number`, `referencePriceOf(goodId: string): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/bridge/campaign-bridge.test.ts
describe('CampaignBridge — pricing', () => {
  it('setPrice changes priceOf and leaves referencePriceOf unchanged', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const reference = bridge.referencePriceOf('milk');
    bridge.setPrice('milk', reference * 0.5);
    expect(bridge.priceOf('milk')).toBeCloseTo(reference * 0.5);
    expect(bridge.referencePriceOf('milk')).toBeCloseTo(reference);
  });

  it('startPromotion discounts priceOf until the promotion ends', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    const reference = bridge.referencePriceOf('milk');
    bridge.startPromotion('milk', 0.2, 10);
    expect(bridge.priceOf('milk')).toBeCloseTo(reference * 0.8);
  });

  it('setMarketingSpend is reflected in the next daily statement\'s marketing line', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.setMarketingSpend(50);
    for (let i = 0; i < 1440; i++) await bridge.tick();
    const latest = bridge.financeStatements().at(-1);
    expect(latest?.marketing).toBe(50);
  });
});
```

The third test uses `financeStatements()` from Task 8 — write Task 6 and Task 8 together if
executing out of order is inconvenient, or stub this one `it.skip` until Task 8 lands and un-skip
it there. Prefer landing Task 8 first if that ordering is simpler; the plan lists pricing before
finance only because pricing is the smaller, more self-contained change.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts -t pricing`
Expected: FAIL — `bridge.setPrice is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts — new methods, anywhere in the class body after `snapshot()`
setPrice(goodId: string, price: number): void {
  this.#step({ type: 'setPrice', goodId, price });
}

startPromotion(goodId: string, discountFraction: number, durationTicks: number): void {
  this.#step({ type: 'startPromotion', goodId, discountFraction, durationTicks });
}

setMarketingSpend(dailyAmount: number): void {
  this.#step({ type: 'setMarketingSpend', dailyAmount });
}

priceOf(goodId: string): number {
  return this.#economy.priceOf(goodId, this.#world.tick);
}

referencePriceOf(goodId: string): number {
  return this.#economy.referencePriceOf(goodId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS (or the marketing-spend test still skipped, pending Task 8)

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): expose pricing commands and priceOf/referencePriceOf on CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 7: Staff commands + `staffRoster()` on `CampaignBridge`

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Consumes: `CheckoutSystem#staffIds()` (Task 1).
- Produces: `hireStaff(staffId: number, skill: number, morale: number): void`,
  `assignStaffToRegister(staffId: number, instanceId: number): void`, `trainStaff(staffId:
  number): void`, `staffRoster(): readonly StaffMember[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/bridge/campaign-bridge.test.ts
describe('CampaignBridge — staff', () => {
  it('hires staff and lists them in staffRoster', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.hireStaff(501, 0.7, 0.9);
    const roster = bridge.staffRoster();
    expect(roster.find((s) => s.id === 501)).toMatchObject({ skill: 0.7, morale: 0.9, assignedRegisterId: null });
  });

  it('assigns staff to a placed register and reflects it in staffRoster', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.place('register', 2, 2, 0);
    const instanceId = bridge.snapshot().placements.find((p) => p.fixtureId === 'register')!.instanceId;
    bridge.hireStaff(501, 0.7, 0.9);
    bridge.assignStaffToRegister(501, instanceId);
    expect(bridge.staffRoster().find((s) => s.id === 501)?.assignedRegisterId).toBe(instanceId);
  });

  it('trains staff, raising their skill', () => {
    const bridge = CampaignBridge.start('l1', 1);
    bridge.hireStaff(501, 0.5, 0.9);
    bridge.trainStaff(501);
    expect(bridge.staffRoster().find((s) => s.id === 501)!.skill).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts -t staff`
Expected: FAIL — `bridge.hireStaff is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts
hireStaff(staffId: number, skill: number, morale: number): void {
  this.#step({ type: 'hireStaff', staffId, skill, morale });
}

assignStaffToRegister(staffId: number, instanceId: number): void {
  this.#step({ type: 'assignStaffToRegister', staffId, instanceId });
}

trainStaff(staffId: number): void {
  this.#step({ type: 'trainStaff', staffId });
}

staffRoster(): readonly StaffMember[] {
  return this.#checkout.staffIds().map((id) => this.#checkout.staff(id));
}
```

Add `StaffMember` to the `type`-only import list from `../sim/index.js` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): expose staff commands and staffRoster on CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 8: `financeStatements()` / `financeLedger()` on `CampaignBridge`

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Produces: `financeStatements(): readonly DailyStatement[]`, `financeLedger(): readonly
  LedgerEntry[]`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/bridge/campaign-bridge.test.ts
describe('CampaignBridge — finance', () => {
  it('financeStatements is empty before the first sim day closes, then grows', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.financeStatements()).toHaveLength(0);
    for (let i = 0; i < 1440; i++) await bridge.tick();
    expect(bridge.financeStatements().length).toBeGreaterThan(0);
  });

  it('financeLedger accumulates entries as the day progresses', async () => {
    const bridge = CampaignBridge.start('l1', 1);
    for (let i = 0; i < 1440; i++) await bridge.tick();
    expect(bridge.financeLedger().length).toBeGreaterThan(0);
  });
});
```

Also un-skip Task 6's `setMarketingSpend` statement test now that `financeStatements()` exists.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts -t finance`
Expected: FAIL — `bridge.financeStatements is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts
financeStatements(): readonly DailyStatement[] {
  return this.#economy.statements();
}

financeLedger(): readonly LedgerEntry[] {
  return this.#economy.ledger();
}
```

Add `DailyStatement`, `LedgerEntry` to the `type`-only import list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS, including the previously-skipped marketing-spend test

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): expose financeStatements/financeLedger on CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 9: `rivalIntel()` on `CampaignBridge`

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Produces: `RivalIntelEntry` (new exported type: `{ id, name, archetype, communityLove, quality,
  service, ambiance, priceIndex }`), `RivalIntel` (new exported type: `{ rivals: readonly
  RivalIntelEntry[]; player: { priceLevel: number; serviceScore: number } }`), `rivalIntel():
  RivalIntel`.

- [ ] **Step 1: Write the failing test**

```ts
// src/bridge/campaign-bridge.test.ts
describe('CampaignBridge — rival intel', () => {
  it('lists l1\'s one rival (Sav-A-Lott) alongside the player\'s own comparable KPIs', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const intel = bridge.rivalIntel();
    expect(intel.rivals).toHaveLength(1);
    expect(intel.rivals[0]?.id).toBe('sav-a-lott');
    expect(intel.player.priceLevel).toBeCloseTo(1); // no setPrice called yet — at reference
    expect(intel.player.serviceScore).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts -t "rival intel"`
Expected: FAIL — `bridge.rivalIntel is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts
export interface RivalIntelEntry {
  readonly id: string;
  readonly name: string;
  readonly archetype: string;
  readonly communityLove: number;
  readonly quality: number;
  readonly service: number;
  readonly ambiance: number;
  readonly priceIndex: number;
}

export interface RivalIntel {
  readonly rivals: readonly RivalIntelEntry[];
  readonly player: { readonly priceLevel: number; readonly serviceScore: number };
}
```

```ts
// inside the class
rivalIntel(): RivalIntel {
  const rivals: RivalIntelEntry[] = [];
  // 'family' is a fixed representative segment for this cross-segment summary view — the
  // same documented-proxy pattern phase 2.2 used for needState (see gentle-surface spec §2).
  // Signature-driven per-segment variance is real (RivalsSystem#effectiveStore takes a
  // segment) but a single UI card can't show all seven at once; this is a deliberate
  // simplification, not a bug.
  for (let i = 0; i < this.#rivals.count(); i++) {
    const store = this.#rivals.effectiveStore(i, 'family');
    rivals.push({
      id: store.id,
      name: store.name,
      archetype: store.archetype,
      communityLove: store.communityLove,
      quality: store.quality,
      service: store.service,
      ambiance: store.ambiance,
      priceIndex: store.priceIndex,
    });
  }
  return {
    rivals,
    player: {
      priceLevel: this.#economy.priceLevel(this.#world.tick),
      serviceScore: this.#checkout.serviceScore(),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): expose rivalIntel on CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 10: `inventoryLevels()` on `CampaignBridge`

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Produces: `InventoryLevel` (new exported type: `{ goodId, stock, capacity, fraction,
  reorderPoint, freshness }`), `inventoryLevels(): readonly InventoryLevel[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/bridge/campaign-bridge.test.ts
describe('CampaignBridge — inventory', () => {
  it('lists every catalog good\'s stock/capacity/reorder point, even when unstocked', () => {
    const bridge = CampaignBridge.start('l1', 1);
    const levels = bridge.inventoryLevels();
    expect(levels.length).toBeGreaterThan(0);
    const milk = levels.find((l) => l.goodId === 'milk')!;
    expect(milk.capacity).toBeGreaterThan(0);
    expect(milk.reorderPoint).toBeGreaterThan(0);
    expect(milk.fraction).toBeGreaterThanOrEqual(0);
    expect(milk.fraction).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts -t inventory`
Expected: FAIL — `bridge.inventoryLevels is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts
export interface InventoryLevel {
  readonly goodId: string;
  readonly stock: number;
  readonly capacity: number;
  readonly fraction: number;
  readonly reorderPoint: number;
  readonly freshness: number;
}
```

```ts
// inside the class
inventoryLevels(): readonly InventoryLevel[] {
  return DEFAULT_SUPPLY_POLICIES.map((policy) => {
    const stock = this.#inventory.stockOf(policy.goodId);
    const capacity = this.#inventory.capacityOf(policy.goodId);
    return {
      goodId: policy.goodId,
      stock,
      capacity,
      fraction: capacity > 0 ? Math.min(1, stock / capacity) : 0,
      reorderPoint: policy.reorderPoint,
      freshness: this.#inventory.freshnessOf(policy.goodId, this.#world.tick),
    };
  });
}
```

Add `DEFAULT_SUPPLY_POLICIES` to the value import list from `../sim/index.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): expose inventoryLevels on CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 11: `objectiveProgress()` passthrough on `CampaignBridge`

**Files:**
- Modify: `src/bridge/campaign-bridge.ts`
- Test: `src/bridge/campaign-bridge.test.ts`

**Interfaces:**
- Consumes: `CampaignSystem#objectiveProgress()` (Task 2).
- Produces: `objectiveProgress(): { current: number; target: number }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/bridge/campaign-bridge.test.ts
describe('CampaignBridge — objective progress', () => {
  it('passes through CampaignSystem#objectiveProgress', () => {
    const bridge = CampaignBridge.start('l1', 1);
    expect(bridge.objectiveProgress()).toEqual({ current: 0, target: 0.15 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts -t "objective progress"`
Expected: FAIL — `bridge.objectiveProgress is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/bridge/campaign-bridge.ts
objectiveProgress(): { readonly current: number; readonly target: number } {
  return this.#campaign.objectiveProgress();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/bridge/campaign-bridge.test.ts`
Expected: PASS — full file green, this is the last bridge-layer task

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/bridge/campaign-bridge.ts src/bridge/campaign-bridge.test.ts
git commit -m "feat(bridge): expose objectiveProgress on CampaignBridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 12: `src/ui/advisors.ts` — pure advisor-line derivation

**Files:**
- Create: `src/ui/advisors.ts`
- Test: `src/ui/advisors.test.ts`

**Interfaces:**
- Consumes: `DailyStatement`, `RivalIntel` (Task 9), `CampaignState`, `TellOccurrence[]` (all
  already-defined types) — bundled into a new `AdvisorInput` this file defines.
- Produces: `AdvisorLine` (new exported type: `{ advisor: 'diane' | 'marcus' | 'chloe'; line:
  string; showMe: { tab: ManageTab; rowId?: string } }`), `ManageTab` (new exported type union:
  `'finance' | 'pricing' | 'staff' | 'inventory' | 'rivals' | 'objective'`),
  `deriveAdvisorLines(input: AdvisorInput, cooldowns: AdvisorCooldownState): readonly
  AdvisorLine[]`, `createAdvisorCooldownState(): AdvisorCooldownState`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/ui/advisors.test.ts
import { describe, expect, it } from 'vitest';
import { createAdvisorCooldownState, deriveAdvisorLines } from './advisors.js';
import type { AdvisorInput } from './advisors.js';

const emptyInput: AdvisorInput = {
  latestStatement: null,
  rivalIntel: { rivals: [], player: { priceLevel: 1, serviceScore: 0.5 } },
  campaignState: { levelId: 'l1', chapterIndex: 0, chapterStatus: 'inProgress', levelStatus: 'inProgress' },
  recentTellCounts: {},
  tick: 0,
};

describe('deriveAdvisorLines', () => {
  it('produces no lines when nothing is wrong', () => {
    const lines = deriveAdvisorLines(emptyInput, createAdvisorCooldownState());
    expect(lines).toHaveLength(0);
  });

  it('Diane flags spoilage exceeding the revenue-fraction threshold', () => {
    const input: AdvisorInput = {
      ...emptyInput,
      latestStatement: {
        day: 0, revenue: 100, cogs: 40, labor: 10, rent: 5, utilities: 2, marketing: 0,
        shrink: 0, spoilage: 30, ebitda: 13,
      },
    };
    const lines = deriveAdvisorLines(input, createAdvisorCooldownState());
    expect(lines.find((l) => l.advisor === 'diane')).toBeDefined();
    expect(lines.find((l) => l.advisor === 'diane')?.showMe.tab).toBe('finance');
  });

  it('Marcus flags a checkout-queue tell frequency spike', () => {
    const input: AdvisorInput = { ...emptyInput, recentTellCounts: { queuePenaltyBalk: 5 } };
    const lines = deriveAdvisorLines(input, createAdvisorCooldownState());
    expect(lines.find((l) => l.advisor === 'marcus')?.showMe.tab).toBe('staff');
  });

  it('Chloe flags a rival price move relative to the player', () => {
    const input: AdvisorInput = {
      ...emptyInput,
      rivalIntel: {
        rivals: [{ id: 'sav-a-lott', name: 'Sav-A-Lott', archetype: 'discounter', communityLove: 22, quality: 0.3, service: 0.2, ambiance: 0.3, priceIndex: 0.6 }],
        player: { priceLevel: 1, serviceScore: 0.5 },
      },
    };
    const lines = deriveAdvisorLines(input, createAdvisorCooldownState());
    expect(lines.find((l) => l.advisor === 'chloe')?.showMe.tab).toBe('rivals');
  });

  it('respects a rule\'s cooldown — fires once, then stays silent until the window elapses', () => {
    const input: AdvisorInput = {
      ...emptyInput,
      latestStatement: {
        day: 0, revenue: 100, cogs: 40, labor: 10, rent: 5, utilities: 2, marketing: 0,
        shrink: 0, spoilage: 30, ebitda: 13,
      },
    };
    const cooldowns = createAdvisorCooldownState();
    const first = deriveAdvisorLines(input, cooldowns);
    expect(first.length).toBeGreaterThan(0);
    const second = deriveAdvisorLines({ ...input, tick: input.tick + 1 }, cooldowns);
    expect(second).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/advisors.test.ts`
Expected: FAIL — module `./advisors.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/advisors.ts
import type { CampaignState, DailyStatement } from '../sim/index.js';
import type { RivalIntel } from '../bridge/campaign-bridge.js';

export type ManageTab = 'finance' | 'pricing' | 'staff' | 'inventory' | 'rivals' | 'objective';

export interface AdvisorLine {
  readonly advisor: 'diane' | 'marcus' | 'chloe';
  readonly line: string;
  readonly showMe: { readonly tab: ManageTab; readonly rowId?: string };
}

export interface AdvisorInput {
  readonly latestStatement: DailyStatement | null;
  readonly rivalIntel: RivalIntel;
  readonly campaignState: CampaignState;
  readonly recentTellCounts: Readonly<Record<string, number>>;
  readonly tick: number;
}

export interface AdvisorCooldownState {
  readonly lastFiredTick: Map<string, number>;
}

export function createAdvisorCooldownState(): AdvisorCooldownState {
  return { lastFiredTick: new Map() };
}

const COOLDOWN_TICKS = 1440; // one sim day (TICKS_PER_SIM_DAY) — a line doesn't repeat within a day
const SPOILAGE_REVENUE_FRACTION_THRESHOLD = 0.15;
const QUEUE_TELL_COUNT_THRESHOLD = 3;

function ready(cooldowns: AdvisorCooldownState, ruleId: string, tick: number): boolean {
  const last = cooldowns.lastFiredTick.get(ruleId);
  return last === undefined || tick - last >= COOLDOWN_TICKS;
}

function fire(cooldowns: AdvisorCooldownState, ruleId: string, tick: number): void {
  cooldowns.lastFiredTick.set(ruleId, tick);
}

export function deriveAdvisorLines(input: AdvisorInput, cooldowns: AdvisorCooldownState): readonly AdvisorLine[] {
  const lines: AdvisorLine[] = [];

  const statement = input.latestStatement;
  if (
    statement &&
    statement.revenue > 0 &&
    statement.spoilage / statement.revenue >= SPOILAGE_REVENUE_FRACTION_THRESHOLD &&
    ready(cooldowns, 'diane-spoilage', input.tick)
  ) {
    fire(cooldowns, 'diane-spoilage', input.tick);
    lines.push({
      advisor: 'diane',
      line: "You're marking down too much stock before it sells. Check what's spoiling.",
      showMe: { tab: 'finance', rowId: 'spoilage' },
    });
  }

  const queueTells = input.recentTellCounts['queuePenaltyBalk'] ?? 0;
  if (queueTells >= QUEUE_TELL_COUNT_THRESHOLD && ready(cooldowns, 'marcus-queue', input.tick)) {
    fire(cooldowns, 'marcus-queue', input.tick);
    lines.push({
      advisor: 'marcus',
      line: 'People are walking out of line. You need another register open.',
      showMe: { tab: 'staff' },
    });
  }

  const cheapestRival = [...input.rivalIntel.rivals].sort((a, b) => a.priceIndex - b.priceIndex)[0];
  if (
    cheapestRival &&
    cheapestRival.priceIndex < input.rivalIntel.player.priceLevel - 0.1 &&
    ready(cooldowns, `chloe-price-${cheapestRival.id}`, input.tick)
  ) {
    fire(cooldowns, `chloe-price-${cheapestRival.id}`, input.tick);
    lines.push({
      advisor: 'chloe',
      line: `${cheapestRival.name} is undercutting you on price.`,
      showMe: { tab: 'rivals', rowId: cheapestRival.id },
    });
  }

  return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/advisors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/advisors.ts src/ui/advisors.test.ts
git commit -m "feat(ui): add pure advisor-line derivation (Diane/Marcus/Chloe)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 13: `src/ui/HudTopBar.tsx`

**Files:**
- Create: `src/ui/HudTopBar.tsx`
- Test: `src/ui/HudTopBar.test.tsx`

**Interfaces:**
- Consumes: `CampaignState`, `objectiveProgress()`'s return shape, a `cash` number (from
  `financeStatements()`'s latest `ebitda`-derived running total — for this task the prop is just
  a plain `number`, computed by the caller in Task 21).
- Produces: `HudTopBarProps`, `HudTopBar(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/HudTopBar.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { HudTopBar } from './HudTopBar.js';

describe('HudTopBar', () => {
  it('shows the store name, cash, and objective progress', () => {
    const root = document.createElement('div');
    render(
      <HudTopBar
        storeName="Sav-A-Lott"
        cash={1234}
        chapterTitle="Open Your Doors"
        objectiveCurrent={0.08}
        objectiveTarget={0.15}
        mode="build"
        onToggleMode={() => {}}
      />,
      root,
    );
    expect(root.textContent).toContain('Sav-A-Lott');
    expect(root.textContent).toContain('1234');
    expect(root.textContent).toContain('Open Your Doors');
    expect(root.querySelector('[data-testid="objective-progress"]')?.textContent).toMatch(/8%.*15%/s);
  });

  it('the mode toggle button reflects the current mode and calls onToggleMode', () => {
    const root = document.createElement('div');
    let toggled = false;
    render(
      <HudTopBar
        storeName="Sav-A-Lott" cash={0} chapterTitle="Ch" objectiveCurrent={0} objectiveTarget={1}
        mode="build" onToggleMode={() => { toggled = true; }}
      />,
      root,
    );
    const button = root.querySelector<HTMLButtonElement>('[data-testid="mode-toggle"]')!;
    expect(button.getAttribute('aria-label')).toMatch(/manage/i);
    button.click();
    expect(toggled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/HudTopBar.test.tsx`
Expected: FAIL — module `./HudTopBar.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/HudTopBar.tsx
export interface HudTopBarProps {
  readonly storeName: string;
  readonly cash: number;
  readonly chapterTitle: string;
  readonly objectiveCurrent: number;
  readonly objectiveTarget: number;
  readonly mode: 'build' | 'manage';
  readonly onToggleMode: () => void;
}

/** Persistent top bar, safe-area-respecting, unchanged in content across both modes. */
export function HudTopBar(props: HudTopBarProps): preact.JSX.Element {
  const style = `position:fixed;top:var(--safe-area-top,0);left:0;right:0;z-index:10;
    display:flex;align-items:center;gap:var(--space-3);
    padding:var(--space-2) var(--space-3);
    background:var(--surface-raised);box-shadow:var(--shadow-raised);
    font-family:var(--font-body);color:var(--ink)`;

  return (
    <div style={style} role="banner">
      <strong>{props.storeName}</strong>
      <span class="num" data-testid="cash">${props.cash.toFixed(0)}</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        {props.chapterTitle}
        <span data-testid="objective-progress" style="margin-left:var(--space-2);color:var(--ink-muted)">
          {Math.round(props.objectiveCurrent * 100)}% / {Math.round(props.objectiveTarget * 100)}%
        </span>
      </span>
      <button
        type="button"
        data-testid="mode-toggle"
        aria-label={props.mode === 'build' ? 'Switch to manage mode' : 'Switch to build mode'}
        style="min-width:44px;min-height:44px"
        onClick={props.onToggleMode}
      >
        {props.mode === 'build' ? '📋' : '🔨'}
      </button>
    </div>
  );
}
```

Use the actual CSS custom property names already defined in `src/ui/styles/base.css` for
`--surface-raised`/`--shadow-raised`/`--ink`/`--ink-muted`/`--space-*`/`--font-body` — read that
file first and match its exact variable names (some panels above use `--shadow-panel` per
`SelectionActionBar.tsx`; confirm which shadow token base.css actually defines for a top bar and
use that one consistently).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/HudTopBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/HudTopBar.tsx src/ui/HudTopBar.test.tsx
git commit -m "feat(ui): add HudTopBar component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 14: `src/ui/AdvisorFeed.tsx`

**Files:**
- Create: `src/ui/AdvisorFeed.tsx`
- Test: `src/ui/AdvisorFeed.test.tsx`

**Interfaces:**
- Consumes: `AdvisorLine[]` (Task 12).
- Produces: `AdvisorFeedProps`, `AdvisorFeed(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/AdvisorFeed.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { AdvisorFeed } from './AdvisorFeed.js';
import type { AdvisorLine } from './advisors.js';

const lines: AdvisorLine[] = [
  { advisor: 'diane', line: 'Dairy is bleeding.', showMe: { tab: 'finance', rowId: 'spoilage' } },
  { advisor: 'marcus', line: 'Line 2 has no one working it.', showMe: { tab: 'staff' } },
  { advisor: 'chloe', line: 'Sav-A-Lott cut prices.', showMe: { tab: 'rivals' } },
  { advisor: 'diane', line: 'A fourth line — should be dropped, max 3 shown.', showMe: { tab: 'finance' } },
];

describe('AdvisorFeed', () => {
  it('shows at most 3 lines at once, oldest dropped first', () => {
    const root = document.createElement('div');
    render(<AdvisorFeed lines={lines} onShowMe={() => {}} onDismiss={() => {}} />, root);
    expect(root.querySelectorAll('[data-testid="advisor-line"]').length).toBe(3);
    expect(root.textContent).not.toContain('Dairy is bleeding.'); // the oldest, dropped
  });

  it('a "Show me" button calls onShowMe with the line\'s target tab', () => {
    const root = document.createElement('div');
    let clicked: { tab: string; rowId?: string } | null = null;
    render(
      <AdvisorFeed
        lines={[lines[1]!]}
        onShowMe={(target) => { clicked = target; }}
        onDismiss={() => {}}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="advisor-show-me"]')!.click();
    expect(clicked).toEqual({ tab: 'staff', rowId: undefined });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/AdvisorFeed.test.tsx`
Expected: FAIL — module `./AdvisorFeed.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/AdvisorFeed.tsx
import type { AdvisorLine, ManageTab } from './advisors.js';

export interface AdvisorFeedProps {
  readonly lines: readonly AdvisorLine[];
  readonly onShowMe: (target: { tab: ManageTab; rowId?: string }) => void;
  readonly onDismiss: (index: number) => void;
}

const MAX_VISIBLE = 3;

/** Stacked advisor queue, most recent first, capped at MAX_VISIBLE — anchored below the HUD top bar. */
export function AdvisorFeed(props: AdvisorFeedProps): preact.JSX.Element {
  const visible = props.lines.slice(-MAX_VISIBLE);
  const style = `position:fixed;top:calc(var(--safe-area-top,0) + 48px);left:var(--space-3);
    right:var(--space-3);z-index:9;display:flex;flex-direction:column;gap:var(--space-2)`;

  return (
    <div style={style} aria-live="polite">
      {visible.map((line, i) => (
        <div
          key={i}
          data-testid="advisor-line"
          style="display:flex;align-items:center;gap:var(--space-2);
            background:var(--surface-raised);border-radius:var(--radius-md);
            box-shadow:var(--shadow-raised);padding:var(--space-2) var(--space-3)"
        >
          <strong style="text-transform:capitalize">{line.advisor}:</strong>
          <span style="flex:1">{line.line}</span>
          <button
            type="button"
            data-testid="advisor-show-me"
            style="min-width:44px;min-height:44px"
            onClick={() => props.onShowMe(line.showMe)}
          >
            Show me
          </button>
          <button
            type="button"
            data-testid="advisor-dismiss"
            aria-label="Dismiss"
            style="min-width:44px;min-height:44px"
            onClick={() => props.onDismiss(i)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/AdvisorFeed.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/AdvisorFeed.tsx src/ui/AdvisorFeed.test.tsx
git commit -m "feat(ui): add AdvisorFeed component

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 15: `src/ui/ChapterModal.tsx`

**Files:**
- Create: `src/ui/ChapterModal.tsx`
- Test: `src/ui/ChapterModal.test.tsx`

**Interfaces:**
- Consumes: `CampaignState`, `AdvisorLine`-shaped `{ advisor, line }` from `ChapterDef.introCopy`/
  `outroCopy` (already-defined `AdvisorLine` type from `src/sim/index.js` — note this is a
  *different, pre-existing* `AdvisorLine` type than Task 12's new one in `src/ui/advisors.ts`;
  they happen to share a name but live in different modules. This component takes the sim one.
  Import it explicitly as `import type { AdvisorLine as ChapterAdvisorLine } from
  '../sim/index.js'` to avoid confusion with `src/ui/advisors.ts`'s export of the same name).
- Produces: `ChapterModalProps`, `ChapterModal(props): preact.JSX.Element | null`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/ChapterModal.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ChapterModal } from './ChapterModal.js';

describe('ChapterModal', () => {
  it('renders nothing when kind is null', () => {
    const root = document.createElement('div');
    render(<ChapterModal kind={null} copy={null} onContinue={() => {}} />, root);
    expect(root.querySelector('[data-testid="chapter-modal"]')).toBeNull();
  });

  it('renders an outro card with a Continue button', () => {
    const root = document.createElement('div');
    let continued = false;
    render(
      <ChapterModal
        kind="outro"
        copy={{ advisor: 'diane', line: "You're on the board." }}
        onContinue={() => { continued = true; }}
      />,
      root,
    );
    expect(root.textContent).toContain("You're on the board.");
    root.querySelector<HTMLButtonElement>('[data-testid="chapter-modal-continue"]')!.click();
    expect(continued).toBe(true);
  });

  it('renders a won modal with no copy required', () => {
    const root = document.createElement('div');
    render(<ChapterModal kind="won" copy={null} onContinue={() => {}} />, root);
    expect(root.textContent?.toLowerCase()).toContain('won');
  });

  it('renders a lost modal with a Retry label on its continue button', () => {
    const root = document.createElement('div');
    render(<ChapterModal kind="lost" copy={null} onContinue={() => {}} />, root);
    expect(root.querySelector('[data-testid="chapter-modal-continue"]')?.textContent).toMatch(/retry/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/ChapterModal.test.tsx`
Expected: FAIL — module `./ChapterModal.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/ChapterModal.tsx
import type { AdvisorLine as ChapterAdvisorLine } from '../sim/index.js';

export type ChapterModalKind = 'intro' | 'outro' | 'won' | 'lost' | null;

export interface ChapterModalProps {
  readonly kind: ChapterModalKind;
  readonly copy: ChapterAdvisorLine | null;
  readonly onContinue: () => void;
}

const CONTINUE_LABEL: Record<Exclude<ChapterModalKind, null>, string> = {
  intro: 'Start',
  outro: 'Continue',
  won: 'Return to menu',
  lost: 'Retry',
};

/** Full-screen, blocking chapter/level transition card. Returns null (renders nothing) when kind is null. */
export function ChapterModal(props: ChapterModalProps): preact.JSX.Element | null {
  if (!props.kind) return null;

  const style = `position:fixed;inset:0;z-index:20;display:flex;align-items:center;
    justify-content:center;background:rgba(20,19,17,0.72);padding:var(--space-4)`;
  const cardStyle = `max-width:28rem;background:var(--surface-raised);border-radius:var(--radius-lg);
    box-shadow:var(--shadow-panel);padding:var(--space-5);text-align:center;color:var(--ink)`;

  const heading = props.kind === 'won' ? 'You won!' : props.kind === 'lost' ? 'Store closed' : null;

  return (
    <div style={style} data-testid="chapter-modal" role="dialog" aria-modal="true">
      <div style={cardStyle}>
        {heading && <h2>{heading}</h2>}
        {props.copy && (
          <p>
            <strong style="text-transform:capitalize">{props.copy.advisor}: </strong>
            {props.copy.line}
          </p>
        )}
        <button
          type="button"
          data-testid="chapter-modal-continue"
          style="min-width:44px;min-height:44px"
          onClick={props.onContinue}
        >
          {CONTINUE_LABEL[props.kind]}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/ChapterModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/ChapterModal.tsx src/ui/ChapterModal.test.tsx
git commit -m "feat(ui): add ChapterModal for intro/outro/won/lost transitions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 16: `src/ui/FinancePanel.tsx`

**Files:**
- Create: `src/ui/FinancePanel.tsx`
- Test: `src/ui/FinancePanel.test.tsx`

**Interfaces:**
- Consumes: `DailyStatement[]` (via `CampaignBridge#financeStatements()`), `LedgerEntry[]` (via
  `#financeLedger()`) — both passed as props, not read from the bridge directly (panels never
  touch the bridge except through props the mount function supplies, so they stay unit-testable
  without constructing a bridge).
- Produces: `FinancePanelProps`, `FinancePanel(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/FinancePanel.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { FinancePanel } from './FinancePanel.js';
import type { DailyStatement, LedgerEntry } from '../sim/index.js';

const statements: DailyStatement[] = [
  { day: 0, revenue: 100, cogs: 40, labor: 10, rent: 5, utilities: 2, marketing: 0, shrink: 0, spoilage: 5, ebitda: 38 },
  { day: 1, revenue: 120, cogs: 45, labor: 10, rent: 5, utilities: 2, marketing: 0, shrink: 0, spoilage: 3, ebitda: 55 },
];
const ledger: LedgerEntry[] = [
  { tick: 1440, category: 'revenue', amount: 60 },
  { tick: 1440, category: 'revenue', amount: 60 },
  { tick: 2880, category: 'revenue', amount: 120 },
];

describe('FinancePanel', () => {
  it('renders every line of the latest statement plus a trailing average, at compact', () => {
    const root = document.createElement('div');
    render(<FinancePanel statements={statements} ledger={ledger} breakpoint="compact" expandedCategory={null} onExpandCategory={() => {}} />, root);
    expect(root.querySelector('[data-testid="finance-row-revenue"]')?.textContent).toContain('120');
    expect(root.querySelector('[data-testid="finance-row-revenue"]')?.textContent).toMatch(/avg|trailing/i);
    expect(root.querySelector('[data-testid="finance-row-ebitda"]')?.textContent).toContain('55');
  });

  it('renders the same content at regular', () => {
    const root = document.createElement('div');
    render(<FinancePanel statements={statements} ledger={ledger} breakpoint="regular" expandedCategory={null} onExpandCategory={() => {}} />, root);
    expect(root.querySelector('[data-testid="finance-row-revenue"]')).not.toBeNull();
  });

  it('tapping a row calls onExpandCategory with that category', () => {
    const root = document.createElement('div');
    let expanded: string | null = null;
    render(
      <FinancePanel statements={statements} ledger={ledger} breakpoint="compact" expandedCategory={null} onExpandCategory={(c) => { expanded = c; }} />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="finance-row-revenue"]')!.click();
    expect(expanded).toBe('revenue');
  });

  it('when expanded, shows the constituent ledger entries for that category and day', () => {
    const root = document.createElement('div');
    render(
      <FinancePanel statements={statements} ledger={ledger} breakpoint="compact" expandedCategory="revenue" onExpandCategory={() => {}} />,
      root,
    );
    const entries = root.querySelectorAll('[data-testid="finance-ledger-entry"]');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('renders a placeholder state with no statements yet', () => {
    const root = document.createElement('div');
    render(<FinancePanel statements={[]} ledger={[]} breakpoint="compact" expandedCategory={null} onExpandCategory={() => {}} />, root);
    expect(root.textContent).toMatch(/no data|not yet/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/FinancePanel.test.tsx`
Expected: FAIL — module `./FinancePanel.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/FinancePanel.tsx
import type { DailyStatement, LedgerCategory, LedgerEntry } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface FinancePanelProps {
  readonly statements: readonly DailyStatement[];
  readonly ledger: readonly LedgerEntry[];
  readonly breakpoint: Breakpoint;
  readonly expandedCategory: LedgerCategory | null;
  readonly onExpandCategory: (category: LedgerCategory | null) => void;
}

const CATEGORIES: readonly LedgerCategory[] = [
  'revenue', 'cogs', 'labor', 'rent', 'utilities', 'marketing', 'shrink', 'spoilage',
];

function valueOf(statement: DailyStatement, category: LedgerCategory | 'ebitda'): number {
  return statement[category];
}

function trailingAverage(statements: readonly DailyStatement[], category: LedgerCategory | 'ebitda', windowDays = 7): number {
  const window = statements.slice(-windowDays);
  if (window.length === 0) return 0;
  return window.reduce((sum, s) => sum + valueOf(s, category), 0) / window.length;
}

/** PLAN.md §12.4 — every number pairs with a 7-day trailing average, never bare. */
export function FinancePanel(props: FinancePanelProps): preact.JSX.Element {
  const latest = props.statements.at(-1);
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);padding:var(--space-4)';

  if (!latest) {
    return <div style={containerStyle}>No data yet — trade a full sim day to see the first statement.</div>;
  }

  const rows: readonly (LedgerCategory | 'ebitda')[] = [...CATEGORIES, 'ebitda'];

  return (
    <div style={containerStyle} data-testid="finance-panel">
      {rows.map((category) => {
        const value = valueOf(latest, category);
        const avg = trailingAverage(props.statements, category);
        return (
          <div key={category}>
            <button
              type="button"
              data-testid={`finance-row-${category}`}
              style="width:100%;text-align:left;min-height:44px;display:flex;justify-content:space-between;gap:var(--space-2)"
              onClick={() => props.onExpandCategory(props.expandedCategory === category ? null : (category as LedgerCategory))}
            >
              <span style="text-transform:capitalize">{category}</span>
              <span class="num">
                ${value.toFixed(2)} <span style="color:var(--ink-faint)">(7d avg ${avg.toFixed(2)})</span>
              </span>
            </button>
            {props.expandedCategory === category && category !== 'ebitda' && (
              <div style="padding-left:var(--space-3)">
                {props.ledger
                  .filter((e) => e.category === category)
                  .map((entry, i) => (
                    <div key={i} data-testid="finance-ledger-entry" class="num">
                      tick {entry.tick}: ${entry.amount.toFixed(2)}
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/FinancePanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/FinancePanel.tsx src/ui/FinancePanel.test.tsx
git commit -m "feat(ui): add FinancePanel with per-category ledger drilldown

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 17: `src/ui/PricingPanel.tsx`

**Files:**
- Create: `src/ui/PricingPanel.tsx`
- Test: `src/ui/PricingPanel.test.tsx`

**Interfaces:**
- Consumes: `GoodDef[]` (from `DEFAULT_GOODS_CATALOG`), a `priceOf`/`referencePriceOf` function
  pair, `marketingSpend: number`.
- Produces: `PricingPanelProps`, `PricingPanel(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/PricingPanel.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { PricingPanel } from './PricingPanel.js';
import { DEFAULT_GOODS_CATALOG } from '../sim/index.js';

describe('PricingPanel', () => {
  it('shows every catalog good\'s price relative to reference', () => {
    const root = document.createElement('div');
    render(
      <PricingPanel
        goods={DEFAULT_GOODS_CATALOG}
        priceOf={(id) => DEFAULT_GOODS_CATALOG.find((g) => g.id === id)!.unitPrice}
        referencePriceOf={(id) => DEFAULT_GOODS_CATALOG.find((g) => g.id === id)!.unitPrice}
        marketingSpend={0}
        breakpoint="compact"
        onSetPrice={() => {}}
        onStartPromotion={() => {}}
        onSetMarketingSpend={() => {}}
      />,
      root,
    );
    expect(root.querySelectorAll('[data-testid^="pricing-row-"]').length).toBe(DEFAULT_GOODS_CATALOG.length);
    expect(root.textContent).toMatch(/reference|at ref/i);
  });

  it('the price stepper calls onSetPrice with an adjusted value', () => {
    const root = document.createElement('div');
    let called: [string, number] | null = null;
    const good = DEFAULT_GOODS_CATALOG[0]!;
    render(
      <PricingPanel
        goods={DEFAULT_GOODS_CATALOG}
        priceOf={() => good.unitPrice}
        referencePriceOf={() => good.unitPrice}
        marketingSpend={0}
        breakpoint="compact"
        onSetPrice={(id, price) => { called = [id, price]; }}
        onStartPromotion={() => {}}
        onSetMarketingSpend={() => {}}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>(`[data-testid="pricing-row-${good.id}-increase"]`)!.click();
    expect(called?.[0]).toBe(good.id);
    expect(called?.[1]).toBeGreaterThan(good.unitPrice);
  });

  it('the marketing-spend input calls onSetMarketingSpend', () => {
    const root = document.createElement('div');
    let spend: number | null = null;
    render(
      <PricingPanel
        goods={DEFAULT_GOODS_CATALOG} priceOf={() => 1} referencePriceOf={() => 1} marketingSpend={0}
        breakpoint="compact" onSetPrice={() => {}} onStartPromotion={() => {}}
        onSetMarketingSpend={(v) => { spend = v; }}
      />,
      root,
    );
    const input = root.querySelector<HTMLInputElement>('[data-testid="pricing-marketing-spend"]')!;
    input.value = '75';
    input.dispatchEvent(new Event('input'));
    expect(spend).toBe(75);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/PricingPanel.test.tsx`
Expected: FAIL — module `./PricingPanel.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/PricingPanel.tsx
import type { GoodDef } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface PricingPanelProps {
  readonly goods: readonly GoodDef[];
  readonly priceOf: (goodId: string) => number;
  readonly referencePriceOf: (goodId: string) => number;
  readonly marketingSpend: number;
  readonly breakpoint: Breakpoint;
  readonly onSetPrice: (goodId: string, price: number) => void;
  readonly onStartPromotion: (goodId: string) => void;
  readonly onSetMarketingSpend: (dailyAmount: number) => void;
}

const PRICE_STEP_FRACTION = 0.05;
const DEFAULT_PROMOTION_DISCOUNT = 0.2;
const DEFAULT_PROMOTION_DURATION_TICKS = 1440;

function relativeLabel(price: number, reference: number): string {
  if (reference === 0) return 'at reference';
  const pct = Math.round(((price - reference) / reference) * 100);
  if (pct === 0) return 'at reference';
  return pct > 0 ? `${pct}% above reference` : `${Math.abs(pct)}% below reference`;
}

export function PricingPanel(props: PricingPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-3);padding:var(--space-4)';

  return (
    <div>
      <div style={containerStyle} data-testid="pricing-panel">
        {props.goods.map((good) => {
          const price = props.priceOf(good.id);
          const reference = props.referencePriceOf(good.id);
          return (
            <div key={good.id} data-testid={`pricing-row-${good.id}`} style="display:flex;align-items:center;gap:var(--space-2)">
              <span style="flex:1">{good.name}</span>
              <span class="num">${price.toFixed(2)}</span>
              <span style="color:var(--ink-faint);font-size:var(--text-sm)">{relativeLabel(price, reference)}</span>
              <button
                type="button"
                data-testid={`pricing-row-${good.id}-decrease`}
                style="min-width:44px;min-height:44px"
                onClick={() => props.onSetPrice(good.id, Math.max(0, price * (1 - PRICE_STEP_FRACTION)))}
              >
                −
              </button>
              <button
                type="button"
                data-testid={`pricing-row-${good.id}-increase`}
                style="min-width:44px;min-height:44px"
                onClick={() => props.onSetPrice(good.id, price * (1 + PRICE_STEP_FRACTION))}
              >
                +
              </button>
              <button
                type="button"
                data-testid={`pricing-row-${good.id}-promote`}
                style="min-width:44px;min-height:44px"
                onClick={() => props.onStartPromotion(good.id)}
              >
                Promo
              </button>
            </div>
          );
        })}
      </div>
      <label style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3)">
        Marketing spend / day
        <input
          type="number"
          data-testid="pricing-marketing-spend"
          value={props.marketingSpend}
          min={0}
          onInput={(e) => props.onSetMarketingSpend(Number((e.target as HTMLInputElement).value))}
        />
      </label>
    </div>
  );
}
```

`onStartPromotion` takes just `goodId` here — the panel always starts a promotion at
`DEFAULT_PROMOTION_DISCOUNT`/`DEFAULT_PROMOTION_DURATION_TICKS`; the mount function in Task 21
calls `bridge.startPromotion(goodId, DEFAULT_PROMOTION_DISCOUNT, DEFAULT_PROMOTION_DURATION_TICKS)`.
A per-promotion discount/duration picker is a real future refinement, not required by the phase
gate (every promotion this phase uses the same authored discount/duration).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/PricingPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/PricingPanel.tsx src/ui/PricingPanel.test.tsx
git commit -m "feat(ui): add PricingPanel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 18: `src/ui/StaffPanel.tsx`

**Files:**
- Create: `src/ui/StaffPanel.tsx`
- Test: `src/ui/StaffPanel.test.tsx`

**Interfaces:**
- Consumes: `StaffMember[]`, a list of open (unassigned) register `instanceId`s.
- Produces: `StaffPanelProps`, `StaffPanel(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/StaffPanel.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { StaffPanel } from './StaffPanel.js';
import type { StaffMember } from '../sim/index.js';

const roster: StaffMember[] = [
  { id: 1, skill: 0.5, morale: 0.9, assignedRegisterId: null },
  { id: 2, skill: 0.8, morale: 0.6, assignedRegisterId: 42 },
];

describe('StaffPanel', () => {
  it('lists every staff member with skill/morale shown against the roster average', () => {
    const root = document.createElement('div');
    render(<StaffPanel roster={roster} openRegisterIds={[42, 43]} breakpoint="compact" onHire={() => {}} onAssign={() => {}} onTrain={() => {}} />, root);
    expect(root.querySelectorAll('[data-testid^="staff-row-"]').length).toBe(2);
    expect(root.textContent).toMatch(/avg|average/i);
  });

  it('Hire calls onHire', () => {
    const root = document.createElement('div');
    let hired = false;
    render(<StaffPanel roster={[]} openRegisterIds={[]} breakpoint="compact" onHire={() => { hired = true; }} onAssign={() => {}} onTrain={() => {}} />, root);
    root.querySelector<HTMLButtonElement>('[data-testid="staff-hire"]')!.click();
    expect(hired).toBe(true);
  });

  it('Train calls onTrain with that staff id', () => {
    const root = document.createElement('div');
    let trained: number | null = null;
    render(<StaffPanel roster={roster} openRegisterIds={[]} breakpoint="compact" onHire={() => {}} onAssign={() => {}} onTrain={(id) => { trained = id; }} />, root);
    root.querySelector<HTMLButtonElement>('[data-testid="staff-row-1-train"]')!.click();
    expect(trained).toBe(1);
  });

  it('an unassigned staff member can be assigned to an open register', () => {
    const root = document.createElement('div');
    let assigned: [number, number] | null = null;
    render(<StaffPanel roster={roster} openRegisterIds={[42, 43]} breakpoint="compact" onHire={() => {}} onAssign={(s, r) => { assigned = [s, r]; }} onTrain={() => {}} />, root);
    const select = root.querySelector<HTMLSelectElement>('[data-testid="staff-row-1-assign"]')!;
    select.value = '43';
    select.dispatchEvent(new Event('change'));
    expect(assigned).toEqual([1, 43]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/StaffPanel.test.tsx`
Expected: FAIL — module `./StaffPanel.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/StaffPanel.tsx
import type { StaffMember } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface StaffPanelProps {
  readonly roster: readonly StaffMember[];
  readonly openRegisterIds: readonly number[];
  readonly breakpoint: Breakpoint;
  readonly onHire: () => void;
  readonly onAssign: (staffId: number, instanceId: number) => void;
  readonly onTrain: (staffId: number) => void;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

export function StaffPanel(props: StaffPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);padding:var(--space-4)';
  const avgSkill = average(props.roster.map((s) => s.skill));
  const avgMorale = average(props.roster.map((s) => s.morale));

  return (
    <div style={containerStyle} data-testid="staff-panel">
      <button type="button" data-testid="staff-hire" style="min-width:44px;min-height:44px" onClick={props.onHire}>
        Hire
      </button>
      {props.roster.map((staff) => (
        <div key={staff.id} data-testid={`staff-row-${staff.id}`} style="display:flex;align-items:center;gap:var(--space-2)">
          <span>Staff #{staff.id}</span>
          <span class="num">
            skill {staff.skill.toFixed(2)} <span style="color:var(--ink-faint)">(avg {avgSkill.toFixed(2)})</span>
          </span>
          <span class="num">
            morale {staff.morale.toFixed(2)} <span style="color:var(--ink-faint)">(avg {avgMorale.toFixed(2)})</span>
          </span>
          <button
            type="button"
            data-testid={`staff-row-${staff.id}-train`}
            style="min-width:44px;min-height:44px"
            onClick={() => props.onTrain(staff.id)}
          >
            Train
          </button>
          <select
            data-testid={`staff-row-${staff.id}-assign`}
            value={staff.assignedRegisterId ?? ''}
            onChange={(e) => {
              const value = (e.target as HTMLSelectElement).value;
              if (value) props.onAssign(staff.id, Number(value));
            }}
          >
            <option value="">Unassigned</option>
            {props.openRegisterIds.map((id) => (
              <option key={id} value={id}>
                Register {id}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/StaffPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/StaffPanel.tsx src/ui/StaffPanel.test.tsx
git commit -m "feat(ui): add StaffPanel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 19: `src/ui/InventoryPanel.tsx`

**Files:**
- Create: `src/ui/InventoryPanel.tsx`
- Test: `src/ui/InventoryPanel.test.tsx`

**Interfaces:**
- Consumes: `InventoryLevel[]` (Task 10).
- Produces: `InventoryPanelProps`, `InventoryPanel(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/InventoryPanel.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { InventoryPanel } from './InventoryPanel.js';
import type { InventoryLevel } from '../bridge/campaign-bridge.js';

const levels: InventoryLevel[] = [
  { goodId: 'milk', stock: 30, capacity: 100, fraction: 0.3, reorderPoint: 40, freshness: 0.7 },
];

describe('InventoryPanel', () => {
  it('shows each good\'s stock against its reorder point, not as a bare number', () => {
    const root = document.createElement('div');
    render(<InventoryPanel levels={levels} breakpoint="compact" />, root);
    const row = root.querySelector('[data-testid="inventory-row-milk"]')!;
    expect(row.textContent).toContain('30');
    expect(row.textContent).toMatch(/reorder/i);
    expect(row.textContent).toContain('40');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/InventoryPanel.test.tsx`
Expected: FAIL — module `./InventoryPanel.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/InventoryPanel.tsx
import type { InventoryLevel } from '../bridge/campaign-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface InventoryPanelProps {
  readonly levels: readonly InventoryLevel[];
  readonly breakpoint: Breakpoint;
}

export function InventoryPanel(props: InventoryPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-3);padding:var(--space-4)';

  return (
    <div style={containerStyle} data-testid="inventory-panel">
      {props.levels.map((level) => (
        <div key={level.goodId} data-testid={`inventory-row-${level.goodId}`} style="display:flex;align-items:center;gap:var(--space-2)">
          <span style="flex:1;text-transform:capitalize">{level.goodId}</span>
          <span class="num">
            {level.stock.toFixed(0)} / {level.capacity.toFixed(0)}{' '}
            <span style="color:var(--ink-faint)">(reorder at {level.reorderPoint.toFixed(0)})</span>
          </span>
          <span class="num" style="color:var(--ink-faint)">freshness {Math.round(level.freshness * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/InventoryPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/InventoryPanel.tsx src/ui/InventoryPanel.test.tsx
git commit -m "feat(ui): add InventoryPanel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 20: `src/ui/RivalsPanel.tsx`

**Files:**
- Create: `src/ui/RivalsPanel.tsx`
- Test: `src/ui/RivalsPanel.test.tsx`

**Interfaces:**
- Consumes: `RivalIntel` (Task 9).
- Produces: `RivalsPanelProps`, `RivalsPanel(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/RivalsPanel.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { RivalsPanel } from './RivalsPanel.js';
import type { RivalIntel } from '../bridge/campaign-bridge.js';

const intel: RivalIntel = {
  rivals: [{ id: 'sav-a-lott', name: 'Sav-A-Lott', archetype: 'discounter', communityLove: 22, quality: 0.3, service: 0.2, ambiance: 0.3, priceIndex: 0.7 }],
  player: { priceLevel: 1, serviceScore: 0.82 },
};

describe('RivalsPanel', () => {
  it('shows each rival\'s terms alongside the player\'s comparable KPI, never a bare number', () => {
    const root = document.createElement('div');
    render(<RivalsPanel intel={intel} breakpoint="compact" />, root);
    const card = root.querySelector('[data-testid="rival-card-sav-a-lott"]')!;
    expect(card.textContent).toContain('Sav-A-Lott');
    expect(card.textContent).toMatch(/your service.*0\.82/is);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/RivalsPanel.test.tsx`
Expected: FAIL — module `./RivalsPanel.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/RivalsPanel.tsx
import type { RivalIntel } from '../bridge/campaign-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface RivalsPanelProps {
  readonly intel: RivalIntel;
  readonly breakpoint: Breakpoint;
}

export function RivalsPanel(props: RivalsPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-3);padding:var(--space-4)';

  return (
    <div style={containerStyle} data-testid="rivals-panel">
      {props.intel.rivals.map((rival) => (
        <div
          key={rival.id}
          data-testid={`rival-card-${rival.id}`}
          style="background:var(--surface-raised);border-radius:var(--radius-lg);
            box-shadow:var(--shadow-raised);padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <strong>{rival.name}</strong>
          <span style="color:var(--ink-faint)">{rival.archetype} — CL {rival.communityLove}</span>
          <span class="num">Their service: {rival.service.toFixed(2)} — Your service: {props.intel.player.serviceScore.toFixed(2)}</span>
          <span class="num">Their price index: {rival.priceIndex.toFixed(2)} — Your price level: {props.intel.player.priceLevel.toFixed(2)}</span>
          <span class="num">Their quality: {rival.quality.toFixed(2)} · ambiance: {rival.ambiance.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/RivalsPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/RivalsPanel.tsx src/ui/RivalsPanel.test.tsx
git commit -m "feat(ui): add RivalsPanel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 21: `src/ui/ObjectiveTab.tsx`

**Files:**
- Create: `src/ui/ObjectiveTab.tsx`
- Test: `src/ui/ObjectiveTab.test.tsx`

**Interfaces:**
- Consumes: `CampaignState`, current `ChapterDef` (title + `introCopy`), `objectiveProgress()`'s
  return shape.
- Produces: `ObjectiveTabProps`, `ObjectiveTab(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/ObjectiveTab.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ObjectiveTab } from './ObjectiveTab.js';

describe('ObjectiveTab', () => {
  it('shows the chapter title, advisor line, and a progress bar', () => {
    const root = document.createElement('div');
    render(
      <ObjectiveTab
        chapterTitle="Open Your Doors"
        introLine={{ advisor: 'diane', line: "Get the doors open." }}
        current={0.08}
        target={0.15}
      />,
      root,
    );
    expect(root.textContent).toContain('Open Your Doors');
    expect(root.textContent).toContain('Get the doors open.');
    const bar = root.querySelector<HTMLElement>('[data-testid="objective-tab-progress"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('8');
    expect(bar.getAttribute('aria-valuemax')).toBe('15');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/ObjectiveTab.test.tsx`
Expected: FAIL — module `./ObjectiveTab.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/ObjectiveTab.tsx
import type { AdvisorLine as ChapterAdvisorLine } from '../sim/index.js';

export interface ObjectiveTabProps {
  readonly chapterTitle: string;
  readonly introLine: ChapterAdvisorLine;
  readonly current: number;
  readonly target: number;
}

export function ObjectiveTab(props: ObjectiveTabProps): preact.JSX.Element {
  const currentPct = Math.round(props.current * 100);
  const targetPct = Math.round(props.target * 100);

  return (
    <div style="padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-2)" data-testid="objective-tab">
      <h3>{props.chapterTitle}</h3>
      <p>
        <strong style="text-transform:capitalize">{props.introLine.advisor}: </strong>
        {props.introLine.line}
      </p>
      <div
        data-testid="objective-tab-progress"
        role="progressbar"
        aria-valuenow={currentPct}
        aria-valuemin={0}
        aria-valuemax={targetPct}
        style="height:8px;border-radius:var(--radius-full);background:var(--line);overflow:hidden"
      >
        <div
          style={`height:100%;background:var(--accent);width:${Math.min(100, (currentPct / Math.max(1, targetPct)) * 100)}%`}
        />
      </div>
      <span class="num">{currentPct}% / {targetPct}% share</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/ObjectiveTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/ObjectiveTab.tsx src/ui/ObjectiveTab.test.tsx
git commit -m "feat(ui): add ObjectiveTab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 22: `src/ui/ManageTabBar.tsx`

**Files:**
- Create: `src/ui/ManageTabBar.tsx`
- Test: `src/ui/ManageTabBar.test.tsx`

**Interfaces:**
- Consumes: `ManageTab` (Task 12).
- Produces: `ManageTabBarProps`, `ManageTabBar(props): preact.JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/ui/ManageTabBar.test.tsx
// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ManageTabBar } from './ManageTabBar.js';

describe('ManageTabBar', () => {
  it('renders one button per tab, marking the active one', () => {
    const root = document.createElement('div');
    render(<ManageTabBar active="finance" breakpoint="compact" onSelect={() => {}} />, root);
    const tabs = root.querySelectorAll('[data-testid^="manage-tab-"]');
    expect(tabs.length).toBe(6); // finance/pricing/staff/inventory/rivals/objective
    expect(root.querySelector('[data-testid="manage-tab-finance"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-testid="manage-tab-pricing"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('tapping a tab calls onSelect with that tab', () => {
    const root = document.createElement('div');
    let selected: string | null = null;
    render(<ManageTabBar active="finance" breakpoint="compact" onSelect={(tab) => { selected = tab; }} />, root);
    root.querySelector<HTMLButtonElement>('[data-testid="manage-tab-staff"]')!.click();
    expect(selected).toBe('staff');
  });

  it('renders as a bottom bar at compact and a side rail at regular', () => {
    const compact = document.createElement('div');
    render(<ManageTabBar active="finance" breakpoint="compact" onSelect={() => {}} />, compact);
    expect(compact.querySelector('[data-testid="manage-tab-bar"]')?.getAttribute('data-layout')).toBe('bottom');

    const regular = document.createElement('div');
    render(<ManageTabBar active="finance" breakpoint="regular" onSelect={() => {}} />, regular);
    expect(regular.querySelector('[data-testid="manage-tab-bar"]')?.getAttribute('data-layout')).toBe('rail');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/ui/ManageTabBar.test.tsx`
Expected: FAIL — module `./ManageTabBar.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/ManageTabBar.tsx
import type { ManageTab } from './advisors.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface ManageTabBarProps {
  readonly active: ManageTab;
  readonly breakpoint: Breakpoint;
  readonly onSelect: (tab: ManageTab) => void;
}

const TABS: readonly { readonly id: ManageTab; readonly label: string }[] = [
  { id: 'objective', label: 'Objective' },
  { id: 'finance', label: 'Finance' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'staff', label: 'Staff' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'rivals', label: 'Rivals' },
];

/** Compact: fixed bottom bar, positioned above the home-indicator guard by the mount function
 *  (this component itself doesn't know the safe-area inset value — that's a layout concern
 *  applied by its caller). Regular: a left icon rail. */
export function ManageTabBar(props: ManageTabBarProps): preact.JSX.Element {
  const layout = props.breakpoint === 'compact' ? 'bottom' : 'rail';
  const style =
    layout === 'bottom'
      ? 'position:fixed;left:0;right:0;bottom:var(--layout-home-indicator-guard,34px);
         display:flex;justify-content:space-around;background:var(--surface-raised);
         box-shadow:var(--shadow-sheet);padding:var(--space-2)'
      : 'position:fixed;top:0;left:0;bottom:0;width:5rem;display:flex;flex-direction:column;
         gap:var(--space-2);background:var(--surface-raised);box-shadow:var(--shadow-raised);
         padding:var(--space-3) var(--space-2)';

  return (
    <div style={style} data-testid="manage-tab-bar" data-layout={layout} role="tablist" aria-label="Manage store">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-testid={`manage-tab-${tab.id}`}
          aria-pressed={props.active === tab.id}
          style="min-width:44px;min-height:44px"
          onClick={() => props.onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/ManageTabBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/ui/ManageTabBar.tsx src/ui/ManageTabBar.test.tsx
git commit -m "feat(ui): add ManageTabBar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 23: `src/view/campaign-mode.ts` — mount everything

**Files:**
- Create: `src/view/campaign-mode.ts`
- Delete: `src/view/build-mode.ts`
- Test: `src/view/campaign-mode.test.ts` (a focused DOM-mount smoke test — full interaction
  coverage already lives in each panel's own test and in Task 25's E2E suite)

**Interfaces:**
- Consumes: every component from Tasks 12–22, `CampaignBridge` (Task 4), `DEFAULT_GOODS_CATALOG`.
- Produces: `mountCampaign(canvas: HTMLCanvasElement, uiRoot: HTMLElement): Promise<{ bridge:
  CampaignBridge } | null>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/view/campaign-mode.test.ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../platform/storage/index.js';
import { mountCampaign } from './campaign-mode.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

describe('mountCampaign', () => {
  it('returns null when the canvas cannot produce a rendering context', async () => {
    const canvas = document.createElement('canvas');
    // jsdom's default canvas has no real context — this exercises the same early-return
    // mountBuildMode always had.
    const uiRoot = document.createElement('div');
    const result = await mountCampaign(canvas, uiRoot);
    expect(result).toBeNull();
  });
});
```

This mirrors `build-mode.ts`'s only currently-tested-in-isolation behavior (the null-return
guard) — Phaser itself can't run under jsdom (see CLAUDE.md's "Weird / worth knowing" note in
`docs/handoff.md`), so a full mount test belongs in Playwright (Task 25), not here.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view/campaign-mode.test.ts`
Expected: FAIL — module `./campaign-mode.js` does not exist

- [ ] **Step 3: Write minimal implementation**

```bash
git mv src/view/build-mode.ts src/view/campaign-mode.ts
```

```ts
// src/view/campaign-mode.ts — full rewrite
import { render } from 'preact';
import { CampaignBridge } from '../bridge/campaign-bridge.js';
import { PointerSource } from '../platform/input/index.js';
import { breakpointFor, type Breakpoint } from '../platform/layout/index.js';
import { getProfile } from '../platform/profile/index.js';
import { BuildModePanel } from '../ui/BuildModePanel.js';
import { SelectionActionBar } from '../ui/SelectionActionBar.js';
import { HudTopBar } from '../ui/HudTopBar.js';
import { AdvisorFeed } from '../ui/AdvisorFeed.js';
import { ChapterModal, type ChapterModalKind } from '../ui/ChapterModal.js';
import { ManageTabBar } from '../ui/ManageTabBar.js';
import { ObjectiveTab } from '../ui/ObjectiveTab.js';
import { FinancePanel } from '../ui/FinancePanel.js';
import { PricingPanel } from '../ui/PricingPanel.js';
import { StaffPanel } from '../ui/StaffPanel.js';
import { InventoryPanel } from '../ui/InventoryPanel.js';
import { RivalsPanel } from '../ui/RivalsPanel.js';
import { createAdvisorCooldownState, deriveAdvisorLines, type AdvisorLine, type ManageTab } from '../ui/advisors.js';
import { screenToWorld, worldToScreen } from './iso.js';
import { DEFAULT_GOODS_CATALOG, TICK_MS } from '../sim/index.js';
import type { LedgerCategory, Rotation } from '../sim/index.js';

const LEVEL_ID = 'l1';
const PROFILE_SAVE_INTERVAL_TICKS = 1440; // once per sim day
const DEFAULT_PROMOTION_DISCOUNT = 0.2;
const DEFAULT_PROMOTION_DURATION_TICKS = 1440;

/**
 * Mounts real campaign play: a Phaser scene on `canvas`, the full HUD/advisor/panel Preact
 * overlay in `uiRoot`, driven by one merged `CampaignBridge` (phase 2.3 — see
 * docs/superpowers/specs/2026-09-03-ui-buildout-design.md).
 *
 * Returns `null` (mounts nothing) if `canvas` can't produce a rendering context, same guard
 * `mountBuildMode` always had.
 */
export async function mountCampaign(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
): Promise<{ bridge: CampaignBridge } | null> {
  const ctx = canvas.getContext('2d') ?? canvas.getContext('webgl');
  if (!ctx) return null;

  const [{ default: Phaser }, { BuildScene }] = await Promise.all([
    import('phaser'),
    import('./BuildScene.js'),
  ]);

  const bridge = CampaignBridge.start(LEVEL_ID, Date.now());
  const origin = { x: canvas.clientWidth / 2, y: 80 };

  const scene = new BuildScene(bridge, origin);
  new Phaser.Game({
    type: Phaser.CANVAS,
    canvas,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    transparent: true,
    scene,
  });

  let armedFixtureId: string | null = null;
  let selectedInstanceId: number | null = null;
  let mode: 'build' | 'manage' = 'build';
  let manageTab: ManageTab = 'objective';
  let expandedFinanceCategory: LedgerCategory | null = null;
  let advisorLines: readonly AdvisorLine[] = [];
  const advisorCooldowns = createAdvisorCooldownState();
  const tellCounts = new Map<string, number>();
  let chapterModalKind: ChapterModalKind = null;

  const hudRoot = document.createElement('div');
  uiRoot.appendChild(hudRoot);
  const advisorRoot = document.createElement('div');
  uiRoot.appendChild(advisorRoot);
  const panelRoot = document.createElement('div');
  uiRoot.appendChild(panelRoot);
  const actionBarRoot = document.createElement('div');
  uiRoot.appendChild(actionBarRoot);
  const tabBarRoot = document.createElement('div');
  uiRoot.appendChild(tabBarRoot);
  const modalRoot = document.createElement('div');
  uiRoot.appendChild(modalRoot);

  function renderUi(): void {
    const breakpoint: Breakpoint = breakpointFor(globalThis.innerWidth);

    render(
      HudTopBar({
        storeName: bridge.state.levelId,
        cash: bridge.financeStatements().reduce((sum, s) => sum + s.ebitda, 0),
        chapterTitle: `Chapter ${bridge.state.chapterIndex + 1}`,
        objectiveCurrent: bridge.objectiveProgress().current,
        objectiveTarget: bridge.objectiveProgress().target,
        mode,
        onToggleMode: () => {
          mode = mode === 'build' ? 'manage' : 'build';
          renderUi();
        },
      }),
      hudRoot,
    );

    render(
      AdvisorFeed({
        lines: advisorLines,
        onShowMe: (target) => {
          mode = 'manage';
          manageTab = target.tab;
          renderUi();
        },
        onDismiss: (index) => {
          advisorLines = advisorLines.filter((_, i) => i !== index);
          renderUi();
        },
      }),
      advisorRoot,
    );

    render(
      ChapterModal({
        kind: chapterModalKind,
        copy:
          chapterModalKind === 'outro'
            ? { advisor: 'diane', line: 'Chapter complete.' } // real copy comes from ChapterDef in the mode's own tick handler below
            : null,
        onContinue: () => {
          if (chapterModalKind === 'outro') void bridge.advanceChapter();
          chapterModalKind = null;
          renderUi();
        },
      }),
      modalRoot,
    );

    if (mode === 'build') {
      render(
        BuildModePanel({
          bridge,
          breakpoint,
          armedFixtureId,
          onArm: (id) => {
            armedFixtureId = id;
            selectedInstanceId = null;
            scene.setSelected(null);
            renderUi();
          },
          onSelect: (id) => {
            selectedInstanceId = id;
            renderUi();
          },
          onUndo: () => {
            scene.redraw();
            renderUi();
          },
          onRedo: () => {
            scene.redraw();
            renderUi();
          },
          pathingDebugOn: false,
          onTogglePathingDebug: () => {},
        }),
        panelRoot,
      );

      const selected = bridge.snapshot().placements.find((p) => p.instanceId === selectedInstanceId);
      render(
        SelectionActionBar({
          screenPosition: selected ? worldToScreen(selected.x, selected.y, origin) : null,
          onRotate: () => {
            if (selected) bridge.rotate(selected.instanceId, nextRotation(selected.rotation));
            scene.redraw();
            renderUi();
          },
          onRemove: () => {
            if (selected) bridge.remove(selected.instanceId);
            selectedInstanceId = null;
            scene.setSelected(null);
            renderUi();
          },
          onCancel: () => {
            selectedInstanceId = null;
            scene.setSelected(null);
            renderUi();
          },
        }),
        actionBarRoot,
      );
      render(null, tabBarRoot);
    } else {
      render(null, actionBarRoot);
      render(
        ManageTabBar({ active: manageTab, breakpoint, onSelect: (tab) => { manageTab = tab; renderUi(); } }),
        tabBarRoot,
      );

      const chapter = undefined as never; // placeholder removed below — see note
      switch (manageTab) {
        case 'objective':
          render(
            ObjectiveTab({
              chapterTitle: `Chapter ${bridge.state.chapterIndex + 1}`,
              introLine: { advisor: 'diane', line: '' }, // filled from real ChapterDef — see note below
              current: bridge.objectiveProgress().current,
              target: bridge.objectiveProgress().target,
            }),
            panelRoot,
          );
          break;
        case 'finance':
          render(
            FinancePanel({
              statements: bridge.financeStatements(),
              ledger: bridge.financeLedger(),
              breakpoint,
              expandedCategory: expandedFinanceCategory,
              onExpandCategory: (c) => { expandedFinanceCategory = c; renderUi(); },
            }),
            panelRoot,
          );
          break;
        case 'pricing':
          render(
            PricingPanel({
              goods: DEFAULT_GOODS_CATALOG,
              priceOf: (id) => bridge.priceOf(id),
              referencePriceOf: (id) => bridge.referencePriceOf(id),
              marketingSpend: 0,
              breakpoint,
              onSetPrice: (id, price) => { bridge.setPrice(id, price); renderUi(); },
              onStartPromotion: (id) => {
                bridge.startPromotion(id, DEFAULT_PROMOTION_DISCOUNT, DEFAULT_PROMOTION_DURATION_TICKS);
                renderUi();
              },
              onSetMarketingSpend: (v) => { bridge.setMarketingSpend(v); renderUi(); },
            }),
            panelRoot,
          );
          break;
        case 'staff':
          render(
            StaffPanel({
              roster: bridge.staffRoster(),
              openRegisterIds: bridge
                .snapshot()
                .placements.filter((p) => p.fixtureId === 'register' || p.fixtureId === 'self_checkout')
                .map((p) => p.instanceId),
              breakpoint,
              onHire: () => {
                const staffId = Date.now();
                bridge.hireStaff(staffId, 0.5 + Math.random() * 0.3, 0.6 + Math.random() * 0.3);
                renderUi();
              },
              onAssign: (staffId, instanceId) => { bridge.assignStaffToRegister(staffId, instanceId); renderUi(); },
              onTrain: (staffId) => { bridge.trainStaff(staffId); renderUi(); },
            }),
            panelRoot,
          );
          break;
        case 'inventory':
          render(InventoryPanel({ levels: bridge.inventoryLevels(), breakpoint }), panelRoot);
          break;
        case 'rivals':
          render(RivalsPanel({ intel: bridge.rivalIntel(), breakpoint }), panelRoot);
          break;
      }
    }
  }

  const input = new PointerSource(canvas, {
    toWorld: (screen) => screenToWorld(screen.x, screen.y, origin),
  });
  input.subscribe((intent) => {
    if (mode !== 'build' || intent.kind !== 'tap') return;
    const tileX = Math.floor(intent.world.x);
    const tileY = Math.floor(intent.world.y);

    const hit = bridge.snapshot().placements.find((p) => p.x === tileX && p.y === tileY);
    if (hit) {
      selectedInstanceId = hit.instanceId;
      armedFixtureId = null;
      scene.setSelected(hit.instanceId);
      renderUi();
      return;
    }

    if (armedFixtureId) {
      try {
        bridge.place(armedFixtureId, tileX, tileY, 0);
      } catch {
        // Rejected placement — no-op, matches mountBuildMode's existing behavior.
      }
      scene.redraw();
      renderUi();
    }
  });
  input.attach();

  let ticksSinceProfileSave = 0;
  globalThis.setInterval(() => {
    void (async () => {
      const before = bridge.state;
      await bridge.tick();
      scene.redraw();

      for (const tell of bridge.pendingTells()) {
        tellCounts.set(tell.term, (tellCounts.get(tell.term) ?? 0) + 1);
      }

      advisorLines = deriveAdvisorLines(
        {
          latestStatement: bridge.financeStatements().at(-1) ?? null,
          rivalIntel: bridge.rivalIntel(),
          campaignState: bridge.state,
          recentTellCounts: Object.fromEntries(tellCounts),
          tick: ticksSinceProfileSave,
        },
        advisorCooldowns,
      );

      const after = bridge.state;
      if (before.chapterStatus === 'inProgress' && after.chapterStatus === 'complete') {
        chapterModalKind = 'outro';
      }
      if (after.levelStatus === 'won') chapterModalKind = 'won';
      if (after.levelStatus === 'lost') chapterModalKind = 'lost';

      renderUi();
    })();
  }, TICK_MS);

  await getProfile(); // establishes the profile store before first render, matching CampaignBridge's own dependency
  renderUi();
  return { bridge };
}

function nextRotation(current: Rotation): Rotation {
  return ((current + 90) % 360) as Rotation;
}
```

This step deliberately leaves two rough edges called out inline (`chapter` placeholder variable
and `ObjectiveTab`'s empty `introLine`) — Step 3's real implementation must resolve both by
reading the actual `ChapterDef` for the current chapter, not ship the placeholder. Fix them now,
in this same step, before running the test — do not leave `introLine: { advisor: 'diane', line:
'' }` in the committed code:

```ts
// Add near the top of mountCampaign, after `const bridge = CampaignBridge.start(...)`:
import { DEFAULT_LEVEL_CONTENT } from '../sim/index.js';
const levelDef = DEFAULT_LEVEL_CONTENT.get(LEVEL_ID)!;

// Then, wherever the chapter's copy is needed (ObjectiveTab's introLine, ChapterModal's outro copy):
const currentChapter = levelDef.chapters[bridge.state.chapterIndex]!;
// ObjectiveTab: introLine: currentChapter.introCopy
// ChapterModal outro: copy: currentChapter.outroCopy — but note advanceChapter() has already
// run inside the tick handler's chapter-complete branch by the time this renders in some
// flows; capture the chapter BEFORE calling advanceChapter (i.e. read currentChapter's outroCopy
// at the moment chapterModalKind is set to 'outro' in the tick handler above, store it in a
// `let pendingOutroCopy: AdvisorLine | null` alongside chapterModalKind, and pass that captured
// value into ChapterModal rather than re-deriving it after the chapter index has already moved).
```

Apply this fix directly in the Step 3 code above (replace the two placeholder spots) rather than
treating it as a follow-up — this file has no separate "fix" step, Step 3's committed code must
already be correct.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/campaign-mode.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: no errors — confirms every prop shape lines up with each panel's actual `Props`
interface from Tasks 12–22

- [ ] **Step 5: Commit**

```bash
git add src/view/campaign-mode.ts src/view/campaign-mode.test.ts
git rm src/view/build-mode.ts 2>/dev/null || true
git commit -m "feat(view): mountCampaign wires HUD/advisors/panels/chapter modal into one screen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 24: `src/main.ts` rewrite

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `mountCampaign` (Task 23).

- [ ] **Step 1: Write the failing check**

This task has no new unit test of its own — `main.ts` is boot glue already covered by
`tests/smoke/boot.test.ts` (confirm that file's name by checking `tests/smoke/` first) and by
Task 25's E2E suite. Instead, verify the *current* smoke test still passes before changing
anything, so any break is attributable to this task's edit:

Run: `npx vitest run tests/smoke/boot.test.ts`
Expected: PASS (baseline, before editing `main.ts`)

- [ ] **Step 2: Rewrite `main.ts`**

```ts
// src/main.ts — full rewrite
import './ui/styles/base.css';
import { mountCampaign } from './view/campaign-mode.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLDivElement>('#ui-root');

if (!canvas || !uiRoot) {
  throw new Error('Boot failed: #game-canvas or #ui-root is missing from index.html');
}

mountCampaign(canvas, uiRoot).catch((error: unknown) => {
  console.error('Campaign mode failed to mount:', error);
});
```

This drops the phase-1.0 diagnostic panel, its standalone `paint()`, and its own `PointerSource`
instance entirely — `mountCampaign` owns the only `PointerSource` now, matching
`mountBuildMode`'s existing pattern (one input source per mounted screen, not one at the
`main.ts` level and a second inside the mount function).

- [ ] **Step 3: Run the smoke test again**

Run: `npx vitest run tests/smoke/boot.test.ts`
Expected: PASS — if it fails, read what it actually asserts (it may assert on the removed
diagnostic panel's DOM content) and update its assertions to check for `#game-canvas`/`#ui-root`
existing and `mountCampaign` being invoked without throwing, rather than deleting the test.

- [ ] **Step 4: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/main.ts tests/smoke/boot.test.ts
git commit -m "feat: boot straight into campaign mode, drop the phase-1.0 diagnostic panel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 25: Gate-proof integration test

**Files:**
- Create: `src/bridge/ui-buildout-gate.test.ts`

**Interfaces:**
- Consumes: every `CampaignBridge` method from Tasks 4–11.

- [ ] **Step 1: Write the test**

```ts
// src/bridge/ui-buildout-gate.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore, setStore } from '../platform/storage/index.js';
import { CampaignBridge } from './campaign-bridge.js';

beforeEach(() => {
  setStore(new MemoryStore());
});

/**
 * One deliberately thorough scenario exercising every command/accessor phase 2.3 added at
 * once — the same "run it for real" pattern every prior phase's gate-proof test has used
 * (see docs/handoff.md's phase 2.2 entry for the precedent this follows).
 */
describe('phase 2.3 gate — every new bridge command and accessor, exercised together', () => {
  it('build, stock, price, staff, and read every new accessor consistently', async () => {
    const bridge = CampaignBridge.start('l1', 20260903);

    // Build: place and stock a shelf, place a register.
    bridge.place('shelf_basic', 5, 5, 0);
    const shelfId = bridge.snapshot().placements.find((p) => p.fixtureId === 'shelf_basic')!.instanceId;
    bridge.stockFixture(shelfId, 'milk');
    bridge.place('register', 6, 5, 0);
    const registerId = bridge.snapshot().placements.find((p) => p.fixtureId === 'register')!.instanceId;

    // Staff: hire, assign, train.
    bridge.hireStaff(9001, 0.5, 0.8);
    bridge.assignStaffToRegister(9001, registerId);
    bridge.trainStaff(9001);
    const staff = bridge.staffRoster().find((s) => s.id === 9001)!;
    expect(staff.assignedRegisterId).toBe(registerId);
    expect(staff.skill).toBeGreaterThan(0.5);

    // Pricing: set a price, start a promotion, set marketing spend.
    const reference = bridge.referencePriceOf('milk');
    bridge.setPrice('milk', reference * 0.8);
    bridge.startPromotion('milk', 0.1, 500);
    bridge.setMarketingSpend(25);
    expect(bridge.priceOf('milk')).toBeLessThan(reference);

    // Run a full sim day so finance/inventory/rival state all have real data.
    for (let i = 0; i < 1440; i++) await bridge.tick();

    // Finance: a statement closed with the marketing spend reflected.
    const statement = bridge.financeStatements().at(-1);
    expect(statement).toBeDefined();
    expect(statement!.marketing).toBe(25);
    expect(bridge.financeLedger().length).toBeGreaterThan(0);

    // Inventory: the stocked good shows up with consistent stock/capacity/fraction.
    const milk = bridge.inventoryLevels().find((l) => l.goodId === 'milk')!;
    expect(milk.capacity).toBeGreaterThan(0);
    expect(milk.fraction).toBeCloseTo(milk.stock / milk.capacity, 5);

    // Rival intel: l1's one rival is present with the player's comparable KPIs alongside it.
    const intel = bridge.rivalIntel();
    expect(intel.rivals).toHaveLength(1);
    expect(intel.rivals[0]!.id).toBe('sav-a-lott');
    expect(intel.player.priceLevel).toBeLessThan(1); // milk was discounted above

    // Objective progress: a real number, not NaN or a placeholder.
    const progress = bridge.objectiveProgress();
    expect(Number.isFinite(progress.current)).toBe(true);
    expect(progress.target).toBe(0.15);

    // Tells: at least the shelf-fullness/queue mechanics from phase 2.2 are still reachable
    // through the merged bridge (regression guard — Task 4 must not have dropped this).
    bridge.addHousehold(9002, 'family', { x: 0, y: 0 });
    bridge.spawnShopper(9003, 9002);
    let sawTell = false;
    for (let i = 0; i < 2000 && !sawTell; i++) {
      await bridge.tick();
      if (bridge.pendingTells().length > 0) sawTell = true;
    }
    expect(sawTell).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/bridge/ui-buildout-gate.test.ts`
Expected: PASS. If anything fails, this is the point of the task — investigate per
`superpowers:systematic-debugging` before touching any earlier task's code, since a failure here
means two individually-tested pieces don't actually compose correctly.

- [ ] **Step 3: Commit**

```bash
git add src/bridge/ui-buildout-gate.test.ts
git commit -m "test: phase 2.3 gate-proof — every new bridge command/accessor exercised together

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 26: E2E — `tests/e2e/campaign-play.spec.ts`

**Files:**
- Create: `tests/e2e/campaign-play.spec.ts`

**Interfaces:**
- Consumes: the mounted app at `/` (same as `tests/e2e/build-mode.spec.ts`), the `data-testid`
  attributes from Tasks 13, 22 (`mode-toggle`, `manage-tab-*`, `pricing-row-*-increase`,
  `staff-hire`, panel test ids).

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/campaign-play.spec.ts
import { expect, test } from '@playwright/test';

test.describe('campaign play — build then manage', () => {
  test('boots into build mode, places a shelf, toggles to manage mode, and every tab renders real content', async ({ page }) => {
    await page.goto('/');

    // Boots directly into build mode (matches build-mode.spec.ts's existing expectation).
    await expect(page.locator('[data-testid="fixture-shelf_basic"]')).toBeVisible();

    const viewport = page.viewportSize();
    if (!viewport) throw new Error('no viewport size');
    const origin = { x: viewport.width / 2, y: 80 };
    const TILE_WIDTH = 128;
    const TILE_HEIGHT = 64;
    const screenFor = (x: number, y: number) => ({
      x: origin.x + (x - y) * (TILE_WIDTH / 2),
      y: origin.y + (x + y) * (TILE_HEIGHT / 2),
    });

    await page.locator('[data-testid="fixture-shelf_basic"]').click();
    const target = screenFor(10, 10);
    await page.mouse.click(target.x, target.y);
    await expect(page.locator('[data-testid="placement-count"]')).not.toHaveText('0');

    // Toggle to manage mode.
    await page.locator('[data-testid="mode-toggle"]').click();
    await expect(page.locator('[data-testid="manage-tab-bar"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-objective"]').click();
    await expect(page.locator('[data-testid="objective-tab"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-finance"]').click();
    await expect(page.locator('[data-testid="finance-panel"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-pricing"]').click();
    await expect(page.locator('[data-testid="pricing-panel"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-staff"]').click();
    await expect(page.locator('[data-testid="staff-panel"]')).toBeVisible();
    await page.locator('[data-testid="staff-hire"]').click();
    await expect(page.locator('[data-testid^="staff-row-"]').first()).toBeVisible();

    await page.locator('[data-testid="manage-tab-inventory"]').click();
    await expect(page.locator('[data-testid="inventory-panel"]')).toBeVisible();

    await page.locator('[data-testid="manage-tab-rivals"]').click();
    await expect(page.locator('[data-testid="rivals-panel"]')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run at both viewports**

Run: `npx playwright test tests/e2e/campaign-play.spec.ts`
Expected: PASS on both the desktop (1440×900) and mobile (390×844) projects configured in
`playwright.config.ts`. If the dev server hangs on first run, `lsof -ti:5173 | xargs kill -9`
and retry once before treating it as a real failure — a known false alarm from phase 2.2's
handoff notes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/campaign-play.spec.ts
git commit -m "test(e2e): campaign play — build mode to manage mode, every tab, both viewports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

### Task 27: Phase gate — full verify, manual check, handoff, tag

**Files:**
- Modify: `CHANGELOG.md` (new phase 2.3 entry, same format as the phase 2.2 entry)
- Modify: `docs/handoff.md` (local-only, not committed to the entry itself — update per
  CLAUDE.md's workflow rule, but this file is gitignored; do not `git add` it)

This task is not TDD (there is no new failing test to write) — it is the phase-gate checklist
CLAUDE.md's workflow section and this plan's own header require before calling phase 2.3 done.

- [ ] **Step 1: Full verify**

Run: `npm run verify`
Expected: green — typecheck, lint, `check:content`, `check:tokens`, unit, golden, build all pass.
If a golden hash moved, STOP per CLAUDE.md — every task in this plan wraps already-hashed paths,
so a moved hash means something unintended happened; do not re-baseline reflexively, find out why
first.

- [ ] **Step 2: Full E2E**

Run: `npm run test:e2e`
Expected: green at both viewports, including `build-mode.spec.ts` (unchanged behavior — confirm
it still passes since `main.ts` now boots differently) and the new `campaign-play.spec.ts`.

- [ ] **Step 3: Manual dev-server check**

Run: `npm run dev`, open the app in a real browser (not just Playwright), and confirm by eye:
- A shopper's tell bubble renders on the canvas while a Finance or Staff panel is open
  alongside it (confirms Task 23's `renderUi()` cadence doesn't starve the Phaser redraw).
- The advisor feed populates from a real triggered condition (e.g. price above every rival, or
  a queue balk) — not just its Task 12 unit tests in isolation.
- No console errors over several minutes with the tab left open.
- Both mode toggle and every manage tab work with mouse and with touch emulation (Chrome
  DevTools device toolbar) at a phone width.

- [ ] **Step 4: Update `CHANGELOG.md`**

Add a new `## Phase 2.3 — UI build-out` section above the phase 2.2 entry, in the same format:
what shipped (bridge merge, HUD, advisors, six panels, chapter cards), what was found (name the
real bridge-split finding from the spec's §0), and what's explicitly deferred (level select,
sandbox mode, a real charting library — spec §7).

- [ ] **Step 5: Update `docs/handoff.md`** (do not commit this file — it's gitignored)

Move the current "Now" section's phase 2.3 description into a "done" write-up matching every
prior phase's shape (what landed, what was found, what's explicitly deferred, what's next —
sandbox mode, phase 2.4), and add a fresh "Now" pointing at 2.4.

- [ ] **Step 6: Tag**

```bash
git tag phase/2.3
```

- [ ] **Step 7: Commit the CHANGELOG**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG entry for phase 2.3 (UI build-out)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo"
```

---

## Self-Review Notes

**Spec coverage:** §1 (bridge merge) → Tasks 1, 3–11. §2 (HUD/mode toggle/boot) → Tasks 13, 23,
24. §3 (advisors) → Task 12, wired in Task 23. §4 (objective tracker/chapter cards) → Tasks 2, 11,
15, 21, wired in Task 23. §5 (six panels) → Tasks 16–20, wired in Task 23. §6 (testing) → every
task's own unit tests, plus Tasks 25–26. §7 (out of scope) — no task attempts level-select,
sandbox mode, or a charting library; confirmed absent by design. §8 (golden hashes) — every sim
change (Tasks 1–3) is a thin accessor with its own test proving no behavior change; no task
touches `applyCommand`/`update`/`hash` logic.

**Placeholder scan:** Task 23's draft callout (`chapter`/`introLine: ''`) is resolved inline
within the same step before the code is considered complete — flagged explicitly so the step
isn't executed as written without the fix.

**Type consistency check:** `RivalIntel`/`RivalIntelEntry` (Task 9) used identically in Task 20
(`RivalsPanel`) and Task 23. `InventoryLevel` (Task 10) used identically in Task 19 and Task 23.
`ManageTab` (Task 12) used identically in Tasks 14, 22, 23. `AdvisorLine` from `src/ui/advisors.ts`
(Task 12) vs. the pre-existing sim `AdvisorLine` type (imported as `ChapterAdvisorLine` in Tasks
15/21/23) are kept explicitly distinct per the note in Task 15 — confirmed no task conflates them.
`CampaignSnapshot` (Task 4, renamed from `BuildModeSnapshot`) used consistently in Task 5's
`draw-plan.ts` update.
