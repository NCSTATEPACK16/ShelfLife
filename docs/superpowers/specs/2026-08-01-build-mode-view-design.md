# Build Mode — View Layer Design

Completes PLAN.md §16 Phase 1.4 (Grid & build mode) — the sim half (`src/sim/systems/grid/`) is
already done (see `docs/superpowers/plans/2026-08-01-grid-build-mode.md`). This spec covers the
remaining half: rendering the grid, wiring touch input, and a build-mode UI panel, so the phase's
literal gate ("place/rotate/remove 50 fixtures on a phone with one thumb; undo all 50") is provable
end to end, not just at the sim layer.

## Goal

A player can, on a phone-sized viewport with one thumb: pick a fixture from a palette, tap a tile to
place it, tap an already-placed fixture to select it and rotate or remove it via a floating action
bar, and undo/redo via persistent buttons — all driven through the existing sim command/hash
machinery, with zero raw pointer-event code outside `src/platform/input` (ADR 0002).

## Architecture

```
World + GridSystem  (src/sim — done)
        ▲
        │  place/rotate/remove/undo/redo, snapshot()
        │
   BuildModeBridge   (src/bridge — new; the only thing that calls world.commands.push + world.step)
        ▲
        │  snapshot (placements + catalog)
   ┌────┴─────────────────────┐
   │                          │
BuildScene (src/view)   BuildModePanel (src/ui)
Phaser: draws grid +    Preact: palette tray, undo/redo,
fixtures from snapshot  floating action bar (rotate/remove)
   ▲
   │  tap intents (screen → world via iso.ts)
PointerSource (src/platform/input — existing, unmodified)
```

Neither `BuildScene` nor `BuildModePanel` ever calls `World` or `GridSystem` directly — both go
through `BuildModeBridge`, which is also the only place selection/armed-fixture UI state could leak
into sim state, and doesn't (that state lives in `src/ui` as a Preact signal, not in the bridge).

## Components

### 1. `src/bridge/build-bridge.ts`

```ts
export interface BuildModeSnapshot {
  readonly dimensions: GridDimensions;
  readonly catalog: readonly FixtureDef[];
  readonly placements: readonly Placement[];
}

export class BuildModeBridge {
  constructor(dimensions: GridDimensions);
  place(fixtureId: string, x: number, y: number, rotation: Rotation): void; // throws PlacementError
  rotate(instanceId: number, rotation: Rotation): void; // throws PlacementError
  remove(instanceId: number): void; // throws PlacementError
  undo(): boolean;
  redo(): boolean;
  snapshot(): BuildModeSnapshot;
}
```

Internally holds one `World` with one `GridSystem` registered, and calls
`world.commands.push({...}); world.step();` for each mutating method — same pattern
`system.test.ts` already exercises at the sim layer, just wrapped for a consumer that shouldn't
need to know about `World`/`Command` at all.

### 2. `src/view/iso.ts`

```ts
export const TILE_WIDTH = 128;
export const TILE_HEIGHT = 64;

export function worldToScreen(x: number, y: number, origin: { x: number; y: number }): { x: number; y: number };
export function screenToWorld(screenX: number, screenY: number, origin: { x: number; y: number }): { x: number; y: number };
```

Standard 2:1 dimetric conversion (matches the locked footprint already drawn cosmetically in
`main.ts`). `screenToWorld` returns fractional tile coordinates; callers `Math.floor` to get a tile
index. No camera pan/zoom this pass — `origin` is a fixed point (canvas center), reused by both
directions so they're exact inverses of each other (round-trip tested).

### 3. `src/view/BuildScene.ts`

A `Phaser.Scene`. `create()` builds a `Phaser.GameObjects.Graphics` layer redrawn on every bridge
mutation (bridge exposes a subscribe callback, or the scene polls `snapshot()` after every intent —
polling is simpler and sufficient at this scale). Draws:
- grid lines for `dimensions.width × dimensions.height`, iso-projected
- each placement as a colored rectangle sized to its rotated footprint, colored by a small
  `fixtureId → token color` lookup (imports `content/design/tokens.json`, no hex literals in the
  `.ts` file itself — satisfies `check:tokens`)
- the selected placement (if any) with a highlighted outline

Phaser's own input plugin is disabled for this scene (`input: false` in scene config, or simply
never calling `this.input.on(...)`) — `PointerSource` is attached to the same canvas element
separately, per ADR 0002.

### 4. `src/ui/BuildModePanel.tsx`

Preact component, rendered into `#ui-root` alongside the canvas (matches `main.ts`'s existing
`uiRoot` pattern). Two breakpoint layouts per `src/platform/layout`:
- **compact**: bottom sheet — a horizontal scroll row of fixture buttons, undo/redo pinned at the
  left end, min 44px hit targets (existing `MIN_HIT_TARGET_PX` token), respecting
  `HOME_INDICATOR_GUARD_PX` (nothing interactive in the bottom 34px).
- **regular**: a fixed side panel, same buttons in a vertical list.

State (Preact signals, local to this component/module — not in the bridge):
- `armedFixtureId: Signal<string | null>` — which palette button is "on" (tap-to-place).
- `selectedInstanceId: Signal<number | null>` — which placed fixture has its action bar showing.

Tapping a palette button sets `armedFixtureId` (and clears `selectedInstanceId`). Tapping a fixture
on the canvas sets `selectedInstanceId` (and clears `armedFixtureId`) and shows a floating action
bar (Rotate / Remove / Cancel) positioned near that fixture's screen coordinates (`worldToScreen`).
Tapping empty grid space while a fixture is armed calls `bridge.place(...)`; while nothing is armed
or selected, it's a no-op.

### 5. Input wiring (in `main.ts` or a new small `src/view/build-mode.ts` entry glue)

```ts
const input = new PointerSource(canvas, { toWorld: (screen) => screenToWorld(screen.x, screen.y, origin) });
input.subscribe((intent) => {
  if (intent.kind !== 'tap') return;
  // dispatch to armed/selected state + bridge, per the flow above
});
input.attach();
```

## Error handling

`BuildModeBridge` methods throw `PlacementError` (already defined in `src/sim`) for invalid
place/rotate. The UI wraps each call in try/catch and shows a brief inline message near the tapped
tile (e.g. "Can't place there") rather than letting it propagate — a rejected action never crashes
the scene or leaves armed/selected state inconsistent.

## Testing

- `src/bridge/build-bridge.test.ts` — vitest, pure logic (place/rotate/remove/undo/redo, snapshot
  shape, error propagation). No DOM needed.
- `src/view/iso.test.ts` — vitest, round-trip `worldToScreen`/`screenToWorld` for a grid of sample
  points, confirms the two are exact inverses.
- `src/ui/build-mode-panel.test.ts` — jsdom smoke test: panel renders, palette buttons present at
  both breakpoints, undo/redo disabled when stacks are empty.
- `tests/e2e/build-mode.spec.ts` — new Playwright suite, first real E2E in the project (Playwright
  installed as a new devDependency). Two viewports: 1440×900 (desktop) and 390×844 with touch
  emulation (mobile, per PLAN.md §11.4). Script: place 50 fixtures via palette-tap + canvas-tap,
  undo all 50, assert the grid is empty. Assertion mechanism: `BuildModePanel` renders a
  `data-testid="placement-count"` element showing `bridge.snapshot().placements.length` — the E2E
  test reads its text content rather than inspecting canvas pixels.
- Manual dev-server check at both viewport sizes before calling this done, per project convention
  for UI changes.

## Out of scope (explicitly deferred)

- Camera pan/zoom, multi-select, drag-to-move an existing fixture — none of these are needed for
  the 1.4 gate.
- A real placeholder-art pipeline (`assets/manifest.json`, `tools/gen-placeholders.ts`) — fixtures
  render as colored rectangles. Art arrives per PLAN.md §9.4/phase 5.0.
- Playwright CI wiring beyond a local `npm run test:e2e` script — hooking it into GitHub Actions is
  a follow-up once the suite exists and is stable locally.
