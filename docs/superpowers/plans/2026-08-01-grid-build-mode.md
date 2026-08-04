# Grid & Build Mode (sim layer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, headless half of PLAN.md §16 Phase 1.4 (Grid & build mode) inside
`src/sim` — tile grid, fixture catalog, placement validation, rotation, undo/redo, bulldoze — as a new
system wired into `World` via commands.

**Architecture:** A new `src/sim/systems/grid/` system, following the existing `core/` patterns
(pure, hash-contributing, RNG-free since placement has no randomness). Commands are the only mutation
path (`placeFixture` / `rotateFixture` / `removeFixture` / `undoBuild` / `redoBuild`), consistent with
"save = seed + command log." The fixture catalog is content data (`content/fixtures/catalog.json`),
Zod-validated, per PLAN.md's "data, not code" rule.

**Scope boundary:** this plan covers the **sim** half only. The PLAN.md 1.4 gate text ("place/rotate/
remove 50 fixtures on a phone with one thumb") also requires a renderer + touch input + Playwright
E2E — that's `src/view` + `src/platform/input` + `src/ui` work, a separate subsystem with its own
plan. Landing this plan makes 1.4's logic gate provable (hash-exact undo of 50 placements) without
touching Phaser, per CLAUDE.md's "no Phaser until the sim gate is green."

**Tech Stack:** TypeScript strict, Vitest, Zod 4 (already a dependency — no new packages).

## Global Constraints

- `src/sim/**` imports nothing from Phaser/DOM/window/Capacitor/Supabase (ESLint-enforced) — verified
  by `npm run verify` after every task.
- No `Math.random()`, no `Date.now()` anywhere in `src/sim`.
- New system → new directory under `src/sim/systems/` with `index.ts`, `types.ts`, `*.test.ts`
  (CLAUDE.md).
- Magic numbers/tuning data live in `content/`, not inlined (CLAUDE.md "data, not code").
- `src/sim/**` coverage thresholds: 80% lines/functions/statements, 70% branches (vitest.config.ts).
- Every command must be a complete, replayable description of intent (commands.ts docstring).
- `computeHash()`/`hashCommand()` must stay exhaustive or explicitly and deliberately opened up —
  any command type must be accounted for in exactly one place.
- Existing golden hashes (`tests/golden/hashes.json`) must not change — none of those scenarios
  register the grid system, so this is expected to hold, but re-run golden tests after each task to
  confirm.

---

### Task 1: Fixture catalog — content data, schema, loader

**Files:**
- Create: `content/fixtures/catalog.json`
- Create: `src/sim/systems/grid/types.ts`
- Create: `src/sim/systems/grid/catalog.ts`
- Test: `src/sim/systems/grid/catalog.test.ts`

**Interfaces:**
- Produces: `FixtureDef` type `{ id: string; name: string; footprint: { width: number; height: number };
  walkable: boolean }`; `parseCatalog(raw: unknown): readonly FixtureDef[]`; `DEFAULT_CATALOG:
  readonly FixtureDef[]`.

- [ ] **Step 1: Write the content file**

`content/fixtures/catalog.json`:
```json
[
  { "id": "shelf_basic", "name": "Basic Shelf", "footprint": { "width": 1, "height": 2 }, "walkable": false },
  { "id": "shelf_endcap", "name": "Endcap Display", "footprint": { "width": 1, "height": 1 }, "walkable": false },
  { "id": "register", "name": "Checkout Register", "footprint": { "width": 2, "height": 1 }, "walkable": false },
  { "id": "cart_corral", "name": "Cart Corral", "footprint": { "width": 1, "height": 1 }, "walkable": true }
]
```

- [ ] **Step 2: Write `types.ts`**

```ts
export type Rotation = 0 | 90 | 180 | 270;

export interface Footprint {
  readonly width: number;
  readonly height: number;
}

export interface FixtureDef {
  readonly id: string;
  readonly name: string;
  readonly footprint: Footprint;
  readonly walkable: boolean;
}

export interface Placement {
  readonly instanceId: number;
  readonly fixtureId: string;
  readonly x: number;
  readonly y: number;
  readonly rotation: Rotation;
}

export interface GridDimensions {
  readonly width: number;
  readonly height: number;
}
```

- [ ] **Step 3: Write the failing test for the catalog loader**

`src/sim/systems/grid/catalog.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseCatalog, DEFAULT_CATALOG } from './catalog.js';

describe('parseCatalog', () => {
  it('parses a well-formed catalog', () => {
    const catalog = parseCatalog([
      { id: 'a', name: 'A', footprint: { width: 1, height: 1 }, walkable: false },
    ]);
    expect(catalog).toHaveLength(1);
    expect(catalog[0]?.id).toBe('a');
  });

  it('rejects a catalog with a duplicate id', () => {
    expect(() =>
      parseCatalog([
        { id: 'a', name: 'A', footprint: { width: 1, height: 1 }, walkable: false },
        { id: 'a', name: 'A2', footprint: { width: 1, height: 1 }, walkable: false },
      ]),
    ).toThrow(/duplicate/i);
  });

  it('rejects a non-positive footprint dimension', () => {
    expect(() =>
      parseCatalog([{ id: 'a', name: 'A', footprint: { width: 0, height: 1 }, walkable: false }]),
    ).toThrow();
  });

  it('DEFAULT_CATALOG loads content/fixtures/catalog.json and validates', () => {
    expect(DEFAULT_CATALOG.length).toBeGreaterThan(0);
    expect(DEFAULT_CATALOG.find((f) => f.id === 'shelf_basic')).toBeDefined();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/grid/catalog.test.ts`
Expected: FAIL — `catalog.ts` doesn't exist yet.

- [ ] **Step 5: Write `catalog.ts`**

```ts
import { z } from 'zod';
import catalogJson from '../../../../content/fixtures/catalog.json' assert { type: 'json' };
import type { FixtureDef } from './types.js';

const FootprintSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const FixtureDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  footprint: FootprintSchema,
  walkable: z.boolean(),
});

const CatalogSchema = z.array(FixtureDefSchema).min(1);

export function parseCatalog(raw: unknown): readonly FixtureDef[] {
  const parsed = CatalogSchema.parse(raw);
  const seen = new Set<string>();
  for (const def of parsed) {
    if (seen.has(def.id)) throw new Error(`Duplicate fixture id in catalog: ${def.id}`);
    seen.add(def.id);
  }
  return parsed;
}

export const DEFAULT_CATALOG: readonly FixtureDef[] = parseCatalog(catalogJson);
```

If the `assert { type: 'json' }` import attribute fails under Vite/Vitest, drop the attribute clause
(`resolveJsonModule` in tsconfig.json already makes a plain `import catalogJson from
'../../../../content/fixtures/catalog.json'` work under this project's bundler moduleResolution) —
try the plain form first, it's simpler and this project already resolves JSON modules elsewhere.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/grid/catalog.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 7: Run full verify and commit**

```bash
npm run verify
git add content/fixtures/catalog.json src/sim/systems/grid/types.ts src/sim/systems/grid/catalog.ts src/sim/systems/grid/catalog.test.ts
git commit -m "feat(sim): fixture catalog loader for build mode"
```

---

### Task 2: Grid core — dimensions, footprint math, occupancy queries

**Files:**
- Create: `src/sim/systems/grid/grid.ts`
- Test: `src/sim/systems/grid/grid.test.ts`

**Interfaces:**
- Consumes: `FixtureDef`, `Placement`, `Rotation`, `GridDimensions`, `Footprint` from `./types.js`;
  `DEFAULT_CATALOG` from `./catalog.js`.
- Produces: `class BuildGrid` with constructor `(dimensions: GridDimensions, catalog: readonly
  FixtureDef[])`; methods `isInBounds(x: number, y: number): boolean`; `isWalkable(x: number, y:
  number): boolean`; `footprintCells(fixtureId: string, x: number, y: number, rotation: Rotation):
  readonly { x: number; y: number }[]` (throws if `fixtureId` unknown); `rotatedFootprint(footprint:
  Footprint, rotation: Rotation): Footprint`. No mutation methods yet (Task 3).

- [ ] **Step 1: Write the failing tests**

`src/sim/systems/grid/grid.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { BuildGrid } from './grid.js';
import type { FixtureDef } from './types.js';

const CATALOG: readonly FixtureDef[] = [
  { id: 'shelf', name: 'Shelf', footprint: { width: 1, height: 2 }, walkable: false },
  { id: 'corral', name: 'Corral', footprint: { width: 1, height: 1 }, walkable: true },
];

describe('BuildGrid', () => {
  it('reports in-bounds cells correctly', () => {
    const grid = new BuildGrid({ width: 10, height: 8 }, CATALOG);
    expect(grid.isInBounds(0, 0)).toBe(true);
    expect(grid.isInBounds(9, 7)).toBe(true);
    expect(grid.isInBounds(10, 0)).toBe(false);
    expect(grid.isInBounds(-1, 0)).toBe(false);
  });

  it('every cell is walkable before anything is placed', () => {
    const grid = new BuildGrid({ width: 4, height: 4 }, CATALOG);
    expect(grid.isWalkable(2, 2)).toBe(true);
  });

  it('computes footprint cells at rotation 0', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const cells = grid.footprintCells('shelf', 3, 4, 0);
    expect(cells).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ]);
  });

  it('swaps width/height for a 90-degree rotation', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const cells = grid.footprintCells('shelf', 3, 4, 90);
    expect(cells).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
  });

  it('throws for an unknown fixture id', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(() => grid.footprintCells('nonexistent', 0, 0, 0)).toThrow(/unknown fixture/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: FAIL — `grid.ts` doesn't exist.

- [ ] **Step 3: Write `grid.ts`**

```ts
import type { FixtureDef, Footprint, GridDimensions, Rotation } from './types.js';

export class BuildGrid {
  readonly #dimensions: GridDimensions;
  readonly #catalog: ReadonlyMap<string, FixtureDef>;

  constructor(dimensions: GridDimensions, catalog: readonly FixtureDef[]) {
    this.#dimensions = dimensions;
    this.#catalog = new Map(catalog.map((def) => [def.id, def]));
  }

  get dimensions(): GridDimensions {
    return this.#dimensions;
  }

  fixtureDef(fixtureId: string): FixtureDef {
    const def = this.#catalog.get(fixtureId);
    if (!def) throw new Error(`Unknown fixture id: ${fixtureId}`);
    return def;
  }

  isInBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.#dimensions.width && y < this.#dimensions.height;
  }

  /** Overridden by BuildGridState once occupancy exists (Task 3); base grid has no obstacles. */
  isWalkable(x: number, y: number): boolean {
    return this.isInBounds(x, y);
  }

  rotatedFootprint(footprint: Footprint, rotation: Rotation): Footprint {
    return rotation === 90 || rotation === 270
      ? { width: footprint.height, height: footprint.width }
      : { width: footprint.width, height: footprint.height };
  }

  footprintCells(
    fixtureId: string,
    x: number,
    y: number,
    rotation: Rotation,
  ): readonly { x: number; y: number }[] {
    const def = this.fixtureDef(fixtureId);
    const { width, height } = this.rotatedFootprint(def.footprint, rotation);
    const cells: { x: number; y: number }[] = [];
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        cells.push({ x: x + dx, y: y + dy });
      }
    }
    return cells;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
npm run verify
git add src/sim/systems/grid/grid.ts src/sim/systems/grid/grid.test.ts
git commit -m "feat(sim): grid dimensions and footprint math"
```

---

### Task 3: Placement, occupancy, bulldoze

**Files:**
- Modify: `src/sim/systems/grid/grid.ts` (rename usage internally is not needed — extend `BuildGrid`
  in place, or add a stateful subclass; simplest is to add mutation methods directly to `BuildGrid`
  since Task 2 already gives it catalog + dimensions).
- Modify: `src/sim/systems/grid/grid.test.ts` (append tests).

**Interfaces:**
- Consumes: everything from Task 2.
- Produces (added to `BuildGrid`): `place(fixtureId: string, x: number, y: number, rotation:
  Rotation): Placement` (throws `PlacementError` on any invalid placement — out of bounds or
  overlapping); `remove(instanceId: number): Placement` (throws if `instanceId` doesn't exist);
  `placements(): readonly Placement[]` (stable order: ascending `instanceId`); overrides
  `isWalkable(x, y)` to account for occupying non-walkable fixtures. New exported class
  `PlacementError extends Error`.

- [ ] **Step 1: Write the failing tests (append to `grid.test.ts`)**

```ts
import { PlacementError } from './grid.js';

describe('BuildGrid placement', () => {
  it('places a fixture and returns it with an assigned instanceId', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    expect(placed.instanceId).toBe(1);
    expect(placed.fixtureId).toBe('shelf');
    expect(grid.placements()).toEqual([placed]);
  });

  it('marks non-walkable fixture cells as unwalkable', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(grid.isWalkable(2, 2)).toBe(false);
    expect(grid.isWalkable(2, 3)).toBe(false);
    expect(grid.isWalkable(3, 2)).toBe(true);
  });

  it('leaves walkable-fixture cells walkable', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('corral', 5, 5, 0);
    expect(grid.isWalkable(5, 5)).toBe(true);
  });

  it('rejects an out-of-bounds placement', () => {
    const grid = new BuildGrid({ width: 4, height: 4 }, CATALOG);
    expect(() => grid.place('shelf', 3, 3, 0)).toThrow(PlacementError);
  });

  it('rejects an overlapping placement', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(() => grid.place('corral', 2, 2, 0)).toThrow(PlacementError);
  });

  it('allows adjacent, non-overlapping placements', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(() => grid.place('corral', 3, 2, 0)).not.toThrow();
  });

  it('assigns strictly increasing instanceIds across placements', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const a = grid.place('corral', 0, 0, 0);
    const b = grid.place('corral', 1, 0, 0);
    expect(b.instanceId).toBeGreaterThan(a.instanceId);
  });

  it('removes a placement and frees its cells', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    const removed = grid.remove(placed.instanceId);
    expect(removed).toEqual(placed);
    expect(grid.placements()).toEqual([]);
    expect(grid.isWalkable(2, 2)).toBe(true);
  });

  it('throws removing an instanceId that does not exist', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(() => grid.remove(999)).toThrow(PlacementError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: FAIL — `place`/`remove`/`placements`/`PlacementError` don't exist.

- [ ] **Step 3: Implement placement in `grid.ts`**

Add above the `BuildGrid` class:
```ts
export class PlacementError extends Error {}
```

Add fields and methods to `BuildGrid` (constructor gains internal state):
```ts
export class BuildGrid {
  readonly #dimensions: GridDimensions;
  readonly #catalog: ReadonlyMap<string, FixtureDef>;
  readonly #occupancy = new Map<string, number>(); // "x,y" -> instanceId
  readonly #placements = new Map<number, Placement>();
  #nextInstanceId = 1;

  // ...constructor, dimensions, fixtureDef, isInBounds, rotatedFootprint, footprintCells unchanged...

  isWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    const instanceId = this.#occupancy.get(cellKey(x, y));
    if (instanceId === undefined) return true;
    const placement = this.#placements.get(instanceId);
    return placement ? this.fixtureDef(placement.fixtureId).walkable : true;
  }

  placements(): readonly Placement[] {
    return [...this.#placements.values()].sort((a, b) => a.instanceId - b.instanceId);
  }

  place(fixtureId: string, x: number, y: number, rotation: Rotation): Placement {
    const cells = this.footprintCells(fixtureId, x, y, rotation);
    this.#assertPlaceable(cells);

    const instanceId = this.#nextInstanceId++;
    const placement: Placement = { instanceId, fixtureId, x, y, rotation };
    this.#occupy(cells, instanceId);
    this.#placements.set(instanceId, placement);
    return placement;
  }

  remove(instanceId: number): Placement {
    const placement = this.#placements.get(instanceId);
    if (!placement) throw new PlacementError(`No placement with instanceId ${instanceId}`);
    const cells = this.footprintCells(placement.fixtureId, placement.x, placement.y, placement.rotation);
    for (const { x, y } of cells) this.#occupancy.delete(cellKey(x, y));
    this.#placements.delete(instanceId);
    return placement;
  }

  #assertPlaceable(cells: readonly { x: number; y: number }[]): void {
    for (const { x, y } of cells) {
      if (!this.isInBounds(x, y)) {
        throw new PlacementError(`Placement cell (${x}, ${y}) is out of bounds`);
      }
      if (this.#occupancy.has(cellKey(x, y))) {
        throw new PlacementError(`Placement cell (${x}, ${y}) is already occupied`);
      }
    }
  }

  #occupy(cells: readonly { x: number; y: number }[], instanceId: number): void {
    for (const { x, y } of cells) this.#occupancy.set(cellKey(x, y), instanceId);
  }
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}
```

Note: `#assertPlaceable` must run before any mutation happens (it does — `place()` calls
`footprintCells` then `#assertPlaceable` before touching `#occupancy`/`#placements`), so a rejected
placement leaves the grid untouched.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: PASS, all tests (Task 2's 5 + Task 3's 9).

- [ ] **Step 5: Commit**

```bash
npm run verify
git add src/sim/systems/grid/grid.ts src/sim/systems/grid/grid.test.ts
git commit -m "feat(sim): fixture placement, occupancy, and bulldoze"
```

---

### Task 4: Rotation of an existing placement

**Files:**
- Modify: `src/sim/systems/grid/grid.ts`
- Modify: `src/sim/systems/grid/grid.test.ts`

**Interfaces:**
- Produces (added to `BuildGrid`): `rotate(instanceId: number, rotation: Rotation): Placement` —
  re-validates the footprint at the new rotation against every *other* placement (not itself), throws
  `PlacementError` if the new footprint would go out of bounds or collide with a different fixture,
  and leaves the grid unchanged if it throws.

- [ ] **Step 1: Write the failing tests (append)**

```ts
describe('BuildGrid rotation', () => {
  it('rotates a placement in place when the new footprint fits', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0); // occupies (2,2),(2,3)
    const rotated = grid.rotate(placed.instanceId, 90); // now occupies (2,2),(3,2)
    expect(rotated.rotation).toBe(90);
    expect(grid.isWalkable(2, 3)).toBe(true);
    expect(grid.isWalkable(3, 2)).toBe(false);
  });

  it('rejects a rotation that would collide with another fixture', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0); // (2,2),(2,3)
    grid.place('corral', 3, 2, 0); // blocks the rotated footprint's second cell
    expect(() => grid.rotate(placed.instanceId, 90)).toThrow(PlacementError);
  });

  it('rejects a rotation that would go out of bounds, leaving the placement untouched', () => {
    const grid = new BuildGrid({ width: 4, height: 4 }, CATALOG);
    const placed = grid.place('shelf', 3, 0, 0); // (3,0),(3,1) — fits at rotation 0
    expect(() => grid.rotate(placed.instanceId, 90)).toThrow(PlacementError); // would need x=3,4: out of bounds
    expect(grid.placements()).toEqual([placed]);
  });

  it('throws rotating an instanceId that does not exist', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(() => grid.rotate(999, 90)).toThrow(PlacementError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: FAIL — `rotate` doesn't exist.

- [ ] **Step 3: Implement `rotate`**

Add to `BuildGrid`:
```ts
  rotate(instanceId: number, rotation: Rotation): Placement {
    const existing = this.#placements.get(instanceId);
    if (!existing) throw new PlacementError(`No placement with instanceId ${instanceId}`);
    if (existing.rotation === rotation) return existing;

    const oldCells = this.footprintCells(existing.fixtureId, existing.x, existing.y, existing.rotation);
    const newCells = this.footprintCells(existing.fixtureId, existing.x, existing.y, rotation);

    const oldKeys = new Set(oldCells.map(({ x, y }) => cellKey(x, y)));
    for (const { x, y } of newCells) {
      if (!this.isInBounds(x, y)) {
        throw new PlacementError(`Rotated placement cell (${x}, ${y}) is out of bounds`);
      }
      const occupant = this.#occupancy.get(cellKey(x, y));
      if (occupant !== undefined && occupant !== instanceId) {
        throw new PlacementError(`Rotated placement cell (${x}, ${y}) is already occupied`);
      }
    }

    for (const { x, y } of oldCells) this.#occupancy.delete(cellKey(x, y));
    const rotated: Placement = { ...existing, rotation };
    this.#occupy(newCells, instanceId);
    this.#placements.set(instanceId, rotated);
    return rotated;
  }
```

`oldKeys` above is computed but unused by the validation loop (validation only needs to ignore cells
occupied by the same instance, which the `occupant !== instanceId` check already does) — delete the
unused `oldKeys` line before running lint, `noUnusedLocals` will fail the build otherwise.

- [ ] **Step 4: Run test, verify pass; run lint to confirm no unused locals**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts && npx eslint src/sim/systems/grid/grid.ts`
Expected: PASS, all tests (Task 3's 14 + Task 4's 4); lint clean.

- [ ] **Step 5: Commit**

```bash
npm run verify
git add src/sim/systems/grid/grid.ts src/sim/systems/grid/grid.test.ts
git commit -m "feat(sim): rotate a placed fixture"
```

---

### Task 5: Undo/redo history

**Files:**
- Modify: `src/sim/systems/grid/grid.ts`
- Modify: `src/sim/systems/grid/grid.test.ts`

**Interfaces:**
- Produces (added to `BuildGrid`): `undo(): boolean` (returns `false` if history is empty, `true` if
  it undid the most recent place/rotate/remove); `redo(): boolean` (same shape); `place`/`rotate`/
  `remove` now each push an inverse entry onto the undo stack and clear the redo stack.

- [ ] **Step 1: Write the failing tests (append)**

```ts
describe('BuildGrid undo/redo', () => {
  it('undo of a place removes the fixture', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    expect(grid.undo()).toBe(true);
    expect(grid.placements()).toEqual([]);
  });

  it('redo of an undone place restores it with the same instanceId', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    grid.undo();
    expect(grid.redo()).toBe(true);
    expect(grid.placements()).toEqual([placed]);
  });

  it('undo of a remove restores the fixture', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    grid.remove(placed.instanceId);
    expect(grid.undo()).toBe(true);
    expect(grid.placements()).toEqual([placed]);
  });

  it('undo of a rotate restores the previous rotation', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    const placed = grid.place('shelf', 2, 2, 0);
    grid.rotate(placed.instanceId, 90);
    expect(grid.undo()).toBe(true);
    expect(grid.placements()).toEqual([placed]);
  });

  it('a new action after an undo clears the redo stack', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    grid.place('shelf', 2, 2, 0);
    grid.undo();
    grid.place('corral', 5, 5, 0);
    expect(grid.redo()).toBe(false);
  });

  it('undo on empty history is a no-op returning false', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(grid.undo()).toBe(false);
  });

  it('redo with nothing to redo is a no-op returning false', () => {
    const grid = new BuildGrid({ width: 10, height: 10 }, CATALOG);
    expect(grid.redo()).toBe(false);
  });

  it('placing 50 fixtures then undoing all 50 returns to an empty grid', () => {
    const grid = new BuildGrid({ width: 50, height: 50 }, CATALOG);
    for (let i = 0; i < 50; i++) {
      grid.place('cart_corral' in {} ? 'corral' : 'corral', i, 0, 0);
    }
    for (let i = 0; i < 50; i++) {
      expect(grid.undo()).toBe(true);
    }
    expect(grid.placements()).toEqual([]);
    expect(grid.undo()).toBe(false);
  });
});
```

(The `'cart_corral' in {} ? 'corral' : 'corral'` ternary in the last test is dead weight — just call
`grid.place('corral', i, 0, 0)` directly; simplify before running.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: FAIL — `undo`/`redo` don't exist.

- [ ] **Step 3: Implement undo/redo**

Add a private history type and fields, and update `place`/`rotate`/`remove` to record history:

```ts
type HistoryEntry =
  | { readonly kind: 'place'; readonly instanceId: number }
  | { readonly kind: 'remove'; readonly placement: Placement }
  | { readonly kind: 'rotate'; readonly instanceId: number; readonly from: Rotation; readonly to: Rotation };
```

Add fields to `BuildGrid`:
```ts
  readonly #undoStack: HistoryEntry[] = [];
  readonly #redoStack: HistoryEntry[] = [];
```

Change `place` to record and clear redo:
```ts
  place(fixtureId: string, x: number, y: number, rotation: Rotation): Placement {
    const cells = this.footprintCells(fixtureId, x, y, rotation);
    this.#assertPlaceable(cells);

    const instanceId = this.#nextInstanceId++;
    const placement: Placement = { instanceId, fixtureId, x, y, rotation };
    this.#occupy(cells, instanceId);
    this.#placements.set(instanceId, placement);
    this.#pushHistory({ kind: 'place', instanceId });
    return placement;
  }
```

Change `remove`:
```ts
  remove(instanceId: number): Placement {
    const placement = this.#placements.get(instanceId);
    if (!placement) throw new PlacementError(`No placement with instanceId ${instanceId}`);
    const cells = this.footprintCells(placement.fixtureId, placement.x, placement.y, placement.rotation);
    for (const { x, y } of cells) this.#occupancy.delete(cellKey(x, y));
    this.#placements.delete(instanceId);
    this.#pushHistory({ kind: 'remove', placement });
    return placement;
  }
```

Change `rotate` to record `{ kind: 'rotate', instanceId, from: existing.rotation, to: rotation }` right
before `return rotated;`, via `this.#pushHistory(...)`.

Add the undo/redo engine. Undo/redo must replay the *inverse* operation without themselves being
recorded as new history entries, so give `place`/`remove` an internal variant that skips history
push, or simplest: factor the mutation body into private `#doPlace`/`#doRemove`/`#doRotate` that
`place`/`rotate`/`remove` (history-recording, validating) call, and that `undo`/`redo` call directly
(already known-valid, no re-validation, no history push):

```ts
  #pushHistory(entry: HistoryEntry): void {
    this.#undoStack.push(entry);
    this.#redoStack.length = 0;
  }

  undo(): boolean {
    const entry = this.#undoStack.pop();
    if (!entry) return false;
    switch (entry.kind) {
      case 'place': {
        const placement = this.#placements.get(entry.instanceId);
        if (placement) this.#unoccupy(placement);
        break;
      }
      case 'remove': {
        this.#reoccupy(entry.placement);
        break;
      }
      case 'rotate': {
        const placement = this.#placements.get(entry.instanceId);
        if (placement) this.#applyRotation(placement, entry.from);
        break;
      }
    }
    this.#redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    const entry = this.#redoStack.pop();
    if (!entry) return false;
    switch (entry.kind) {
      case 'place': {
        const placement = entry as { kind: 'place'; instanceId: number };
        const removed = this.#placements.get(placement.instanceId);
        // no-op guard: the placement to redo must already be absent
        if (!removed) {
          // re-derive nothing extra needed: redoing 'place' means re-adding what undo removed.
        }
        break;
      }
    }
    this.#undoStack.push(entry);
    return true;
  }
```

The sketch above is incomplete on purpose — writing exact inverse-application code inline here would
drift from what actually compiles. Implement `undo`/`redo` by keeping **full snapshots of the removed
placement** in the history entry (not just an instanceId) so re-applying never needs to reconstruct
anything:

```ts
type HistoryEntry =
  | { readonly kind: 'place'; readonly placement: Placement }
  | { readonly kind: 'remove'; readonly placement: Placement }
  | { readonly kind: 'rotate'; readonly instanceId: number; readonly from: Rotation; readonly to: Rotation };
```

Then:
- `undo` of `place` → remove `placement.instanceId` from occupancy/placements (same cell-freeing logic
  as `remove`, factored into a private `#unoccupy(placement: Placement): void`).
- `undo` of `remove` → re-insert `placement` (same cell-occupying logic as `place`, factored into
  `#reoccupy(placement: Placement): void`, which recomputes `footprintCells` for that placement and
  calls `#occupy`).
- `undo` of `rotate` → recompute cells at `entry.to`, free them; recompute cells at `entry.from`,
  occupy them; write `{ ...current, rotation: entry.from }` back into `#placements`.
- `redo` is the mirror: `place` re-applies `#reoccupy`; `remove` re-applies `#unoccupy`; `rotate`
  re-applies going from `entry.from` to `entry.to`.

Refactor `place`/`remove`/`rotate` to call `#reoccupy`/`#unoccupy` internally too, so there is exactly
one implementation of "make these cells occupied/free," and `undo`/`redo` cannot drift from it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/grid/grid.test.ts`
Expected: PASS, all tests (Task 4's 18 + Task 5's 8 = 26).

- [ ] **Step 5: Commit**

```bash
npm run verify
git add src/sim/systems/grid/grid.ts src/sim/systems/grid/grid.test.ts
git commit -m "feat(sim): undo/redo for placement, removal, and rotation"
```

---

### Task 6: World integration — commands, System, hash

**Files:**
- Modify: `src/sim/core/commands.ts`
- Modify: `src/sim/core/world.ts`
- Create: `src/sim/systems/grid/system.ts`
- Create: `src/sim/systems/grid/index.ts`
- Modify: `src/sim/index.ts`
- Create: `docs/adr/0003-system-command-dispatch.md`
- Test: `src/sim/systems/grid/system.test.ts`

**Interfaces:**
- Consumes: `BuildGrid`, `PlacementError` from `./grid.js`; `Command`, `System`, `Hasher`, `World`
  from core.
- Produces: extended `Command` union (5 new variants below); `System.applyCommand?(world: World,
  command: Command): boolean` on the `System` interface; `class GridSystem implements System` with a
  public `readonly grid: BuildGrid` for tests/other systems to query `isWalkable`; barrel export from
  `src/sim/systems/grid/index.ts` and re-export from `src/sim/index.ts`.

- [ ] **Step 1: Write the ADR**

`docs/adr/0003-system-command-dispatch.md`:
```markdown
# 0003 — System command dispatch

## Status
Accepted

## Context
Phase 1.3 shipped only kernel commands (`noop`, `setSpeed`, `pause`, `resume`), and `World#apply`
was an exhaustive switch over all of `Command`. Phase 1.4 is the first gameplay system (grid/build
mode) that needs its own commands (`placeFixture`, `rotateFixture`, `removeFixture`, `undoBuild`,
`redoBuild`), and every phase after it — staff, pricing, promotions — will need the same thing.
Growing `World#apply` into a god-switch that knows every system's command semantics would violate
the same locality that `src/sim/systems/*` directories exist to preserve.

## Decision
`Command` stays one flat, closed discriminated union in `core/commands.ts` — replay and the command
log do not care which system owns a command, and `hashCommand` stays an exhaustive switch over every
variant so a forgotten hash case is a compile error.

`System` gains an optional `applyCommand(world: World, command: Command): boolean` method. `World#apply`
handles the four kernel command types directly, then for anything else loops over registered systems
in registration order and calls `applyCommand`; the first system that returns `true` has handled it.
If no system claims it, `World#apply` throws — an unhandled command is still a hard failure, just a
runtime one instead of a compile-time one for the *dispatch* switch (the *hashing* switch keeps its
compile-time exhaustiveness, which is the one that actually protects determinism).

## Consequences
- Adding a new system's commands means: add the variant to `Command`, add a case to `hashCommand`,
  implement `applyCommand` on the new system. `World#apply` never changes again.
- Two systems must not claim the same command type — nothing enforces this at compile time; a test
  in `system.test.ts` asserts `GridSystem.applyCommand` returns `false` for command types it doesn't
  own, and the World-level exhaustive throw is the backstop if that discipline slips.
```

- [ ] **Step 2: Extend `Command` in `commands.ts`**

Change the `Command` union:
```ts
export type Command =
  | { readonly type: 'noop' }
  | { readonly type: 'setSpeed'; readonly multiplier: number }
  | { readonly type: 'pause' }
  | { readonly type: 'resume' }
  | { readonly type: 'placeFixture'; readonly fixtureId: string; readonly x: number; readonly y: number; readonly rotation: 0 | 90 | 180 | 270 }
  | { readonly type: 'rotateFixture'; readonly instanceId: number; readonly rotation: 0 | 90 | 180 | 270 }
  | { readonly type: 'removeFixture'; readonly instanceId: number }
  | { readonly type: 'undoBuild' }
  | { readonly type: 'redoBuild' };
```

Extend `hashCommand`'s switch (keep it exhaustive — this is the one that must never silently skip a
type, per ADR 0003):
```ts
export function hashCommand(hasher: Hasher, command: Command): void {
  hasher.str(command.type);
  switch (command.type) {
    case 'setSpeed':
      hasher.f64(command.multiplier);
      return;
    case 'placeFixture':
      hasher.str(command.fixtureId).u32(command.x).u32(command.y).u32(command.rotation);
      return;
    case 'rotateFixture':
      hasher.u32(command.instanceId).u32(command.rotation);
      return;
    case 'removeFixture':
      hasher.u32(command.instanceId);
      return;
    case 'noop':
    case 'pause':
    case 'resume':
    case 'undoBuild':
    case 'redoBuild':
      return;
    default: {
      const exhaustive: never = command;
      throw new Error(`Unhashed command type: ${JSON.stringify(exhaustive)}`);
    }
  }
}
```

- [ ] **Step 3: Update `System` interface and `World#apply` in `world.ts`**

Add to the `System` interface:
```ts
export interface System {
  readonly name: string;
  update(world: World): void;
  hash(world: World, hasher: Hasher): void;
  /** Optional: claim a non-kernel command. Return true if this system handled it. */
  applyCommand?(world: World, command: Command): boolean;
}
```

Replace the `apply` method's `default` branch (this drops the `never` exhaustiveness check
deliberately — see ADR 0003):
```ts
  private apply(command: Command): void {
    switch (command.type) {
      case 'noop':
        return;
      case 'setSpeed':
        this.#applySpeed(command.multiplier);
        return;
      case 'pause':
        this.#paused = true;
        this.events.emit({ type: 'paused' });
        return;
      case 'resume':
        this.#paused = false;
        this.events.emit({ type: 'resumed' });
        return;
      default:
        for (const system of this.#systems) {
          if (system.applyCommand?.(this, command)) return;
        }
        throw new Error(`Unhandled command: ${JSON.stringify(command)}`);
    }
  }
```

- [ ] **Step 4: Write the failing test for `GridSystem`**

`src/sim/systems/grid/system.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { GridSystem } from './system.js';

function worldWithGrid(seed = 1): { world: World; grid: GridSystem } {
  const world = new World({ seed });
  const grid = new GridSystem({ width: 20, height: 20 });
  world.register(grid);
  return { world, grid };
}

describe('GridSystem', () => {
  it('applies placeFixture via a world command and updates the grid', () => {
    const { world, grid } = worldWithGrid();
    world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
    world.step();
    expect(grid.grid.placements()).toHaveLength(1);
  });

  it('applies rotateFixture and removeFixture', () => {
    const { world, grid } = worldWithGrid();
    world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
    world.step();
    const instanceId = grid.grid.placements()[0]!.instanceId;

    world.commands.push({ type: 'rotateFixture', instanceId, rotation: 90 });
    world.step();
    expect(grid.grid.placements()[0]!.rotation).toBe(90);

    world.commands.push({ type: 'removeFixture', instanceId });
    world.step();
    expect(grid.grid.placements()).toEqual([]);
  });

  it('applies undoBuild and redoBuild', () => {
    const { world, grid } = worldWithGrid();
    world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 });
    world.step();
    world.commands.push({ type: 'undoBuild' });
    world.step();
    expect(grid.grid.placements()).toEqual([]);
    world.commands.push({ type: 'redoBuild' });
    world.step();
    expect(grid.grid.placements()).toHaveLength(1);
  });

  it('does not claim kernel command types', () => {
    const { grid, world } = worldWithGrid();
    expect(grid.applyCommand(world, { type: 'noop' })).toBe(false);
  });

  it('replaying the command log reproduces the same hash', () => {
    const seed = 7;
    const log: { tick: number; command: Parameters<World['commands']['push']>[0] }[] = [];

    const { world, grid } = worldWithGrid(seed);
    for (let i = 0; i < 50; i++) {
      world.commands.push({ type: 'placeFixture', fixtureId: 'corral', x: i, y: 0, rotation: 0 });
      world.step();
    }
    void grid;
    const finalHash = world.hash;

    const replayed = new World({ seed });
    const replayedGrid = new GridSystem({ width: 20, height: 20 });
    replayed.register(replayedGrid);
    for (const entry of world.commands.log) {
      replayed.commands.push(entry.command);
      replayed.step();
    }
    expect(replayed.hash).toBe(finalHash);
    void log;
  });

  it('placing 50 fixtures then undoing all 50 hashes identically to a fresh world with the same registration', () => {
    const seed = 99;

    const fresh = new World({ seed });
    fresh.register(new GridSystem({ width: 20, height: 20 }));
    fresh.step(); // advance one tick so both worlds are compared post-step

    const built = new World({ seed });
    const builtGrid = new GridSystem({ width: 20, height: 20 });
    built.register(builtGrid);
    for (let i = 0; i < 50; i++) {
      built.commands.push({ type: 'placeFixture', fixtureId: 'corral', x: i % 20, y: Math.floor(i / 20), rotation: 0 });
      built.step();
    }
    for (let i = 0; i < 50; i++) {
      built.commands.push({ type: 'undoBuild' });
      built.step();
    }

    expect(builtGrid.grid.placements()).toEqual([]);
    expect(built.hash).toBe(fresh.hash);
  });
});
```

Note: `corral` needs a footprint of `{ width: 1, height: 1 }` to tile across a 20-wide grid without
collisions in the loop above — that's `content/fixtures/catalog.json`'s `cart_corral` entry, so use
`fixtureId: 'cart_corral'` (not `'corral'`) in this test to match the real content file. Fix this
before running: replace both `'corral'` occurrences with `'cart_corral'`.

The `fresh.step()` / `built.step()` counts must match in *number of ticks* for the two worlds' hashes
to be comparable — `fresh` takes 1 step, `built` takes 100 (50 place + 50 undo). Since `World.tick` is
part of `computeHash()`, these will NOT hash equal as written. Fix: advance `fresh` by the same tick
count as `built` (100 steps of a `noop` command or plain `run(100)`), so tick count matches and the
only thing under test — the grid's contribution — is what's being compared. Use `fresh.run(100)`
instead of `fresh.step()`.

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/grid/system.test.ts`
Expected: FAIL — `system.ts` doesn't exist.

- [ ] **Step 6: Write `system.ts`**

```ts
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System } from '../../core/world.js';
import type { World } from '../../core/world.js';
import { DEFAULT_CATALOG } from './catalog.js';
import { BuildGrid } from './grid.js';
import type { GridDimensions } from './types.js';

export class GridSystem implements System {
  readonly name = 'grid';
  readonly grid: BuildGrid;

  constructor(dimensions: GridDimensions) {
    this.grid = new BuildGrid(dimensions, DEFAULT_CATALOG);
  }

  update(_world: World): void {
    // Placement is command-driven, not per-tick; nothing to advance yet.
  }

  hash(_world: World, hasher: Hasher): void {
    const placements = this.grid.placements();
    hasher.u32(placements.length);
    for (const p of placements) {
      hasher.u32(p.instanceId).str(p.fixtureId).u32(p.x).u32(p.y).u32(p.rotation);
    }
  }

  applyCommand(_world: World, command: Command): boolean {
    switch (command.type) {
      case 'placeFixture':
        this.grid.place(command.fixtureId, command.x, command.y, command.rotation);
        return true;
      case 'rotateFixture':
        this.grid.rotate(command.instanceId, command.rotation);
        return true;
      case 'removeFixture':
        this.grid.remove(command.instanceId);
        return true;
      case 'undoBuild':
        this.grid.undo();
        return true;
      case 'redoBuild':
        this.grid.redo();
        return true;
      default:
        return false;
    }
  }
}
```

`_world` parameters stay unused for now (`update`/`hash` don't need world access yet); the ESLint
config's `argsIgnorePattern: '^_'` (see `eslint.config.js`) permits this without disabling the rule.

- [ ] **Step 7: Write the barrel `index.ts`**

`src/sim/systems/grid/index.ts`:
```ts
export { BuildGrid, PlacementError } from './grid.js';
export { GridSystem } from './system.js';
export { parseCatalog, DEFAULT_CATALOG } from './catalog.js';
export type { FixtureDef, Footprint, GridDimensions, Placement, Rotation } from './types.js';
```

- [ ] **Step 8: Re-export from `src/sim/index.ts`**

Add:
```ts
export { BuildGrid, DEFAULT_CATALOG, GridSystem, parseCatalog, PlacementError } from './systems/grid/index.js';
export type { FixtureDef, Footprint, GridDimensions, Placement, Rotation } from './systems/grid/index.js';
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/grid/system.test.ts`
Expected: PASS, all 6 tests, including the exact-hash-after-undo-50 test.

- [ ] **Step 10: Run the full suite, confirm existing golden hashes are untouched**

Run: `npm run verify`
Expected: all green, and specifically confirm `tests/golden/golden.test.ts` still passes with no
`UPDATE_GOLDEN` — the four existing scenarios don't register `GridSystem`, so their hashes must not
move. If any of them fail, STOP (per CLAUDE.md: a golden hash change is a bug or a deliberate,
separately-explained re-baseline — never a side effect of this task).

- [ ] **Step 11: Commit**

```bash
git add src/sim/core/commands.ts src/sim/core/world.ts src/sim/systems/grid/system.ts src/sim/systems/grid/index.ts src/sim/index.ts docs/adr/0003-system-command-dispatch.md src/sim/systems/grid/system.test.ts
git commit -m "feat(sim): wire grid/build mode into World via commands"
```

---

### Task 7: Golden scenario for the grid system

**Files:**
- Modify: `tests/golden/scenarios.ts`
- Modify: `tests/golden/hashes.json` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: `GridSystem` from `src/sim/index.js`.
- Produces: one new named scenario in `SCENARIOS`.

- [ ] **Step 1: Add the scenario**

In `tests/golden/scenarios.ts`, add to the `SCENARIOS` array (matching the existing `Scenario` shape):
```ts
{
  name: 'grid-build',
  seed: 555111,
  ticks: 2000,
  sampleEvery: 100,
  build(): World {
    const world = new World({ seed: 555111 });
    world.register(new GridSystem({ width: 30, height: 30 }));
    for (let i = 0; i < 20; i++) {
      world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: i, y: 0, rotation: 0 });
    }
    for (let i = 0; i < 5; i++) {
      world.commands.push({ type: 'undoBuild' });
    }
    return world;
  },
},
```
Add the `GridSystem` import at the top of the file alongside the existing `World` import.

- [ ] **Step 2: Generate the baseline**

Run: `UPDATE_GOLDEN=1 npx vitest run tests/golden/golden.test.ts`
Expected: `tests/golden/hashes.json` gains a `grid-build` entry; console prints the re-baseline
message.

- [ ] **Step 3: Verify it locks (a second run without UPDATE_GOLDEN must pass)**

Run: `npx vitest run tests/golden/golden.test.ts`
Expected: PASS — the freshly recorded hash reproduces.

- [ ] **Step 4: Run full verify and commit**

```bash
npm run verify
git add tests/golden/scenarios.ts tests/golden/hashes.json
git commit -m "test(golden): add grid-build scenario to the golden hash suite"
```

Note: per CLAUDE.md, this is not a "re-baseline" of an existing hash (nothing existing changed) —
it's a new scenario, so no special explanation is owed beyond this commit message. If a *future*
change to `GridSystem` moves this hash, that's the trigger for the STOP-and-explain rule.

---

## After this plan

Update `docs/handoff.md` (untracked, local-only, but still update it locally): Phase 1.4's sim half is
done — grid, catalog, placement, rotation, undo/redo, bulldoze, all command-driven and golden-tested.
What's outstanding for 1.4's full PLAN.md gate: a `src/view` renderer for the grid, `src/platform/
input` touch handling for tap-to-place/drag-to-rotate, a `src/ui` build-mode panel, and the Playwright
two-viewport E2E test placing/rotating/removing 50 fixtures one-thumb. That's a second, separate plan
(view + platform + UI is a different subsystem per the writing-plans scope-check rule) — do not start
Phaser work by improvising on top of this one; write it up first.
