# UI Build-out (Phase 2.3) — Design

Companion to `PLAN.md` §16 phase 2.3 and §12.2/§12.4. Phase 2.3's deliverable: a Preact overlay
(HUD, finance dashboard, pricing, staff, inventory, rival intel, objective tracker) at both
compact and regular breakpoints — the first time a player can see and operate any of this without
reading test output. Judged against PLAN.md §16's real phase 2.3 gate: "a fresh player completes
L1 on a phone without external docs."

## 0. What investigation found before designing this

Two bridges exist and have quietly diverged. `BuildModeBridge` (`src/bridge/build-bridge.ts`)
registers grid/pathing/inventory/checkout/economy/rivals/loyalty/market/shoppers/reputation
directly in its constructor and exposes the full command surface the current view layer
(`BuildScene`, `BuildModePanel`, `SelectionActionBar`, `build-mode.ts`) is built against —
`place`/`rotate`/`remove`/`undo`/`redo`/`registerDestination`/`addHousehold`/`stockFixture`/
`spawnShopper`/`pendingTells`/`shelfFullness`/`shoppersSnapshot`/`snapshot`/`tick`. It has no
`CampaignSystem` and no pricing/staff commands. `CampaignBridge` (`src/bridge/campaign-bridge.ts`)
builds off `campaignWorld.ts`'s `buildCampaignWorld`/`loadCampaignWorld`, which registers nearly
the identical system set *plus* `CampaignSystem` (chapters/objectives/win-lose) — but exposes only
`state`/`tick`/`advanceChapter`/`save`. Neither bridge has `setPrice`/`startPromotion`/
`setMarketingSpend`/`hireStaff`/`assignStaffToRegister`/`trainStaff`, even though all six commands
already exist in the `Command` union and are handled by `EconomySystem`/`CheckoutSystem`'s
`applyCommand` — this phase is a bridge/UI gap, not a sim gap.

A real "play L1 on a phone" screen needs both halves — campaign objectives *and* the full
build/stock/price/staff surface — at once. Decision (confirmed with the user): merge into one
bridge. `CampaignBridge` absorbs `BuildModeBridge`'s entire surface plus the new commands and new
read accessors; `BuildModeBridge` is deleted, not kept alongside. This matches CLAUDE.md's "one
schema, not one code path per mode" spirit — sandbox mode (phase 2.4) will want this same merged
bridge, not a third one.

## 1. Bridge: `CampaignBridge` becomes the one bridge

`registerCampaignSystems` (`src/sim/campaignWorld.ts`) stays the single system-registration
function — already shared between `buildCampaignWorld`/`loadCampaignWorld` since phase 2.1, so
`BuildModeBridge`'s constructor logic is deleted, not duplicated onto a second call site.

`CampaignBridge` gains, migrated verbatim from `BuildModeBridge` (same signatures, same
semantics, `#step` helper included):

```
place, rotate, remove, undo, redo, hasUndo, hasRedo,
registerDestination, unregisterDestination, flowFieldDebug,
addHousehold, stockFixture, spawnShopper,
shoppersSnapshot, pendingTells, shelfFullness,
tick, snapshot
```

Plus six new command methods wrapping already-defined `Command` variants:

```ts
setPrice(goodId: string, price: number): void
startPromotion(goodId: string, discountFraction: number, durationTicks: number): void
setMarketingSpend(dailyAmount: number): void
hireStaff(staffId: number, skill: number, morale: number): void
assignStaffToRegister(staffId: number, instanceId: number): void
trainStaff(staffId: number): void
```

Plus four new read accessors, each a thin wrapper over an existing system method (no new sim
code):

```ts
financeStatements(): readonly DailyStatement[]   // EconomySystem#statements()
financeLedger(): readonly LedgerEntry[]          // EconomySystem#ledger() — drilldown source
staffRoster(): readonly StaffMember[]            // CheckoutSystem#staff() over known ids
rivalIntel(): readonly RivalIntelEntry[]         // RivalsSystem#stores()/effectiveStore()/count(), zipped with the player's own comparable KPIs
inventoryLevels(): readonly InventoryLevel[]      // InventorySystem, generalized shelfFullness() logic that doesn't require a placed shelf
```

`RivalIntelEntry`/`InventoryLevel` are new small view-shape types in `src/bridge/campaign-bridge.ts`
(same pattern as `BuildModeSnapshot`), not new sim types — they exist only to give the UI a stable
read shape independent of internal system field names.

`staffRoster()` needs a way to enumerate known staff ids — `CheckoutSystem` has no such accessor
today (`staff(id)` requires already knowing the id). Add `CheckoutSystem#staffIds(): readonly
number[]` (new, trivial — the system already tracks a `Map`/array of hired staff internally).

**Migration of existing tests.** `build-bridge.test.ts`'s assertions move onto `CampaignBridge`,
constructed via a small test-only `LevelDef` fixture (same shape `campaign/system.test.ts` already
authors) instead of a bare `GridDimensions`. `BuildModePanel.test.tsx`, `BuildScene`'s consumers,
and `draw-plan.test.ts` update their bridge type import only — their assertions are behavior-
identical since the migrated methods keep the same signatures.

## 2. HUD shell, mode toggle, and boot

`main.ts` drops the phase-1.0 diagnostic boot panel (the "canvas is empty on purpose" readout,
its standalone `paint()`, and its own bare `PointerSource`) — that was phase-1.0 scaffolding for
verifying the platform seam before any real screen existed; a real screen now exists; keeping both
on top of each other fails the "fresh player completes L1" gate on sight. `main.ts` becomes a thin
boot: resolve a level id (hardcoded `'l1'` for this phase — a level-select screen is out of scope,
see §5), call `mountCampaign(canvas, uiRoot)` (new, `src/view/campaign-mode.ts`, replacing
`build-mode.ts`), which internally calls `CampaignBridge.start('l1', seed)` or `.resume(save)` if
`src/platform/storage` has a saved envelope for that slot.

`mountCampaign` mounts:

- **HUD top bar** (safe-area-respecting, persistent): store name, cash, current chapter's
  objective progress in one line, a Build/Manage mode toggle icon. Reused verbatim across both
  modes — it is not part of the tab bar that swaps.
- **Bottom tab bar** (compact: fixed above the home-indicator inset, per CLAUDE.md's "never in the
  bottom 34px" rule — the bar itself sits inside the inset, not over it; regular: left icon rail).
  Contents swap by mode:
  - **Build mode**: today's `BuildModePanel` (fixture palette, undo/redo) + `SelectionActionBar`,
    re-pointed at `CampaignBridge`, otherwise unchanged.
  - **Manage mode**: five tabs — Finance, Pricing, Staff, Inventory, Rivals — plus an
    always-present Objective tab (see §4).
- **Advisor feed**: a stacked queue (max 3 concurrent lines, oldest dismissed first), anchored
  below the HUD top bar in both modes. Built from placeholder tokens/rects — no art dependency.
  See §3.
- **Chapter intro/outro modal**: full-screen, blocking, dismiss-to-continue, driven off
  `ChapterDef.introCopy`/`outroCopy` and `CampaignState.chapterStatus`. See §4.

Compact/regular differ only in tab-bar shape and panel presentation (bottom sheet vs. floating
window) — the same breakpoint switch `build-mode.ts` already uses via `src/platform/layout`.

## 3. Advisors

New pure module `src/ui/advisors.ts`: `deriveAdvisorLines(input: AdvisorInput): AdvisorLine[]`,
where `AdvisorInput` bundles the latest `DailyStatement`, `RivalIntelEntry[]`, `CampaignState`,
and recent `pendingTells()` frequency counts (passed in by the caller each render — the function
itself is pure, no bridge dependency, testable standalone). Three named advisors, each with its
own small rule table translating a threshold crossing into one sentence + a `showMe` target
(which Manage tab + optional row id to scroll to):

- **Diane (finance)** — e.g. a category's spoilage/shrink line exceeds a fraction of revenue →
  "Dairy is bleeding. You're marking down too much milk before it sells." `showMe` → Finance tab,
  dairy row.
- **Marcus (ops/staff)** — e.g. `queuePenaltyRising`/`queuePenaltyBalk` tell frequency crosses a
  threshold, or a lane has no assigned staff → "Line 2 has no one working it." `showMe` → Staff
  tab.
- **Chloe (rival scout)** — e.g. a rival's effective term moves meaningfully week over week (from
  `rivalIntel()`) → "Sav-A-Lott just cut prices again." `showMe` → Rivals tab, that rival's card.

Each rule fires at most once per its own cooldown window (a tick-count field per rule, reset on
fire) so the feed doesn't spam the same line every render — mirrors the existing tell-threshold
pattern from phase 2.2's `content/design/gentle-surface.json5`, but advisor cooldowns are a new
small constant table in `src/ui/advisors.ts` itself (no sim content dependency; advisors are pure
UI framing over already-hashed sim state, never sim state themselves).

## 4. Objective tracker & chapter cards

**Objective tab** (Manage mode): current chapter title, `ChapterDef.objective` rendered as a
progress bar (share threshold value vs. `trailingWindowDays`-window actual, sourced from
`CampaignState` plus a new `CampaignBridge#objectiveProgress(): { current: number; target: number
}` accessor — a thin wrapper over `CampaignSystem`'s already-computed trailing share, exposed for
the first time), and the chapter's `introCopy` line for reference.

**Chapter intro/outro modal**: shown when `mountCampaign`'s render loop observes
`CampaignState.chapterStatus` change to `'complete'` (outro: `outroCopy`, a "Continue" button
calling `CampaignBridge#advanceChapter()`) or when a fresh chapter starts (intro: `introCopy`, a
"Start" button that simply dismisses — no command, chapter is already active). Level win/lose
(`LevelStatus`) gets its own terminal modal (won: congratulatory copy + return-to-menu stub since
no level-select exists yet; lost: retry, restarting `CampaignBridge.start` with the same level id).

## 5. Manage-mode panels

Each is a `/screen`-scaffolded Preact component (compact + regular variants, token-only styles),
reading only `CampaignBridge` accessors — never `World`/system internals directly, per the
existing `src/ui` boundary.

- **Finance**: `financeStatements()`'s latest entry as a line list (Revenue/COGS/Labor/Rent/
  Utilities/Marketing/Shrink/Spoilage → EBITDA). Each row is a stat tile showing a 7-day trailing
  average alongside the latest value (min/max/avg over `statements()`'s recent window — no
  charting library this phase) per §12.4. Tapping a row expands to that category's `LedgerEntry`
  list from `financeLedger()`, filtered by category and the statement's tick range — the literal
  drilldown CLAUDE.md's "bare number is a bug" rule requires.
- **Pricing**: one row per catalog good — current price (`priceOf`-derived via a statement/ledger
  read, since `CampaignBridge` doesn't expose `EconomySystem` directly — add
  `CampaignBridge#priceOf(goodId): number` and `#referencePriceOf(goodId): number` thin wrappers),
  shown as "X% above/below reference" rather than a bare figure, a tap-to-edit stepper calling
  `setPrice`, a promotion toggle calling `startPromotion`, a marketing-spend slider calling
  `setMarketingSpend`.
- **Staff**: `staffRoster()` list — name (id-based placeholder label), skill, morale, assigned
  lane if any, each benchmarked against the roster's own average (not bare). "Hire" button calls
  `hireStaff` with a skill/morale pair randomized by the *UI's* own `Math.random()` (this is
  `src/ui`, not `src/sim` — the boundary rule is about the sim being deterministic, not the UI;
  the hired values themselves become part of the command log and are hashed once applied, same as
  any other player choice). Tap-to-assign to an open register calls `assignStaffToRegister`.
  Train button calls `trainStaff`.
- **Inventory**: `inventoryLevels()` — per-good stock vs. capacity (fraction, same math
  `shelfFullness()` already uses, generalized to not require a placed shelf instance), reorder
  point, and freshness, each shown against that good's `(s,S)` policy target from
  `content/inventory/policy.json` rather than as a bare number.
- **Rivals**: `rivalIntel()` — one card per rival: name, CL, current effective price/quality/
  service terms, with the player's own comparable KPI on the same card (e.g. "Your service: 0.82
  vs. Sav-A-Lott: 0.61") — §12.4's comparative framing applied to every stat, not just some.

All panels use `content/design/tokens.json` exclusively; a hardcoded hex fails
`tools/check-tokens.mjs` same as every other `src/ui` file.

## 6. Testing

- Unit tests per bridge method addition (mirrors `build-bridge.test.ts`'s existing per-method
  coverage), moved onto `CampaignBridge`.
- Component tests per panel (compact + regular render, button → bridge-call wiring), same pattern
  as `BuildModePanel.test.tsx`.
- `advisors.ts` gets its own pure unit tests — no bridge/DOM dependency, straightforward
  input-in/lines-out assertions per rule.
- **Gate-proof integration test** (`src/bridge/ui-buildout-gate.test.ts`, matching the "one
  deliberately adverse scenario exercising the whole phase's surface" pattern from phase 2.2 and
  every prior gate): drive a full chapter through `CampaignBridge` exercising every new command at
  least once (place a shelf, stock it, hire staff, assign to register, train, set a price, start a
  promotion, set marketing spend) and confirm every new accessor (`financeStatements`,
  `financeLedger`, `staffRoster`, `rivalIntel`, `inventoryLevels`, `objectiveProgress`) returns
  values consistent with the commands issued — not just non-throwing.
- Playwright E2E at both viewports: boot → Build mode place a shelf and stock it → toggle to
  Manage mode → open each of the five tabs and confirm real content renders (not just that the tab
  exists) → advance a chapter via the outro modal. Extends the existing `tests/e2e/build-mode.spec.ts`
  pattern into a new `tests/e2e/campaign-play.spec.ts`.
- Manual dev-server check before calling the phase done, per every prior phase's lesson: watch a
  tell bubble actually render on the real canvas while a Finance/Staff panel is open alongside it,
  confirm the advisor feed populates from a real triggered condition (not just its unit tests),
  and confirm no console errors over a multi-minute run.

## 7. Explicitly out of scope for 2.3

- Level-select / campaign menu screen (L1 is hardcoded as the boot target; L2/L3 selection is a
  natural follow-up, not blocking the phase gate's literal "completes L1" wording).
- Sandbox mode (`sandbox: true` flag, phase 2.4) — this phase's bridge merge is what makes 2.4
  cheap, but sandbox itself isn't built here.
- A real charting library for the finance trailing-average display — min/max/avg text this phase,
  a sparkline is a fast follow if it's cheap once a library is chosen, not required by the gate.
- The "Calm Status: %" HUD stat and in-HUD Community Love leaderboard ideas noted in the handoff
  from the art-direction review — real ideas, not decided, not part of this spec.
- Any Track B art/projection work — placeholder rectangles remain correct and sufficient here per
  this session's standing instruction.

## 8. Golden hashes

No sim code changes — every new bridge method wraps an existing `applyCommand`/accessor path
already exercised by other tests. Golden hashes should not move. If one does, that's a signal a
"thin wrapper" accidentally became a behavior change — stop and investigate per CLAUDE.md, don't
re-baseline reflexively.
