# Phase 2.0b — Catchment graph & rival store data model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the sim a `RivalStore` content type and a `Position` + `travelCost` primitive on a coarse catchment grid, so a household's distance from the player's store — and from a rival's — is a real, deterministic, content-driven number, ahead of any store-choice decision that consumes it.

**Architecture:** Everything new lives in the existing `src/sim/systems/market/` directory created in 2.0a. `types.ts` gains `Position` and `RivalStore`; a new `catchment.ts` holds the pure `travelCost` function; `config.ts` gains `parseCatchmentConfig` / `parseRivalStore` / `DEFAULT_CATCHMENT_CONFIG` / `DEFAULT_RIVAL_STORES`, following the exact JSON5-import + zod-schema pattern `economy/config.ts` and 2.0a's segment config already use. `Household` gains a required `position`, and the `addHousehold` command gains a required `position` — the same mechanical treatment `segment` got in 2.0a, propagated to every call site by the compiler. Nothing calls `travelCost` from `ShoppersSystem`: there is still only one store to shop at, so this phase proves the function and the content are correct and stops there.

**Tech Stack:** TypeScript, Vitest, zod (v4), JSON5. No new dependencies.

## Global Constraints

- `src/sim/**` imports nothing from Phaser, the DOM, `window`, Capacitor, or Supabase (ESLint-enforced).
- No `Math.random()` / `Date.now()` anywhere in `src/sim`. `travelCost` is a pure function — no RNG, no sim-state dependency, same tier as `consumptionMultiplierFor`.
- Magic numbers live in `content/balance/*.json5` and `content/rivals/*.json5`, never inlined in code.
- All brand and product names are fictional. **Never** use a real retailer's name, logo, slogan, or colour pairing — not even as a placeholder.
- Every new rival is logged in `docs/legal/parody-review.md` **before** it is implemented. Sav-A-Lott is already logged as row 1 with status `planned` and a passing four-part name test; Task 2 flips it to `implemented`. No new row is needed.
- **Manhattan distance, not Euclidean.** `PLAN.md` §5.1 is explicit: "`travelCost` uses road-network distance on a coarse catchment graph, not Euclidean."
- If a golden hash changes, it is re-baselined in its own commit explaining why — never silently alongside a behaviour change. This phase **does** expect the `shopper-trip` hash to move (Task 7); every other scenario must be confirmed untouched first.
- Conventional commits, one logical unit per commit.
- Run `npm run verify` at the end of Task 7 to confirm the whole suite (typecheck, lint, `check:tokens`, `check:content`, unit, golden, build) is green.

---

## File Structure

**Create:**
- `src/sim/systems/market/catchment.ts` — the pure `travelCost` function. Its own file rather than a corner of `config.ts`, because `config.ts` is parsing/validation and this is sim maths; they change for different reasons.
- `src/sim/systems/market/catchment.test.ts` — schema tests for both new parsers plus `travelCost` unit tests.
- `content/balance/catchment.json5` — `playerStorePosition` and `distanceCostPerUnit`.
- `content/rivals/sav-a-lott.json5` — one `RivalStore` record. New directory: rivals are content records, not tuning constants, so they do not belong under `content/balance/`.

**Modify:**
- `src/sim/systems/market/types.ts` — add `Position` and `RivalStore`.
- `src/sim/systems/market/config.ts` — add the catchment + rival schemas, parsers, and defaults.
- `src/sim/systems/market/index.ts` — export the new types, parsers, defaults, and `travelCost`.
- `src/sim/index.ts:51-58` — re-export the same from the sim barrel (the bridge imports only through this barrel).
- `src/sim/systems/shoppers/types.ts:4-11` — `Household` gains `readonly position: Position`.
- `src/sim/systems/shoppers/household.test.ts` — every household literal gains a `position`; new gate test proving `travelCost` differs by position.
- `src/sim/core/commands.ts:47` (command union) and `:151-153` (`hashCommand`) — `addHousehold` gains `position`.
- `src/sim/systems/shoppers/system.ts:106` (`hash`) and `:149-156` (`applyCommand`) — set and hash `position`.
- `src/sim/systems/shoppers/system.test.ts:56,64,89,101,119,159` — every `addHousehold` push gains a `position`.
- `src/bridge/build-bridge.ts:11,102-104` — `addHousehold(householdId, segment, position)`.
- `src/bridge/build-bridge.test.ts:83,95` — both calls pass a position.
- `src/sim/systems/checkout/understaffing.test.ts:57` — `addHousehold` push gains a `position`.
- `src/sim/systems/economy/loss-leader.test.ts:64` — `addHousehold` push gains a `position`.
- `tests/golden/scenarios.ts:172` — the `shopper-trip` scenario's `addHousehold` push gains a `position`.
- `tests/golden/hashes.json` — re-baselined in Task 7, its own commit.
- `docs/legal/parody-review.md:43` — Sav-A-Lott status `planned` → `implemented`.
- `CHANGELOG.md` — phase 2.0b entry.

**Note on `check:content`:** `tools/check-gentle-surface.mjs` reads only `content/design/gentle-surface.json5`. Neither new content file affects it, and `quality`/`service`/`ambiance` here are §5.1 store-choice terms, not §5.3/§5.4 satisfaction/impulse terms, so they need no visual tell. `npm run verify` still runs `check:content` as usual.

---

### Task 1: `Position`, `travelCost`, and the catchment config

**Files:**
- Modify: `src/sim/systems/market/types.ts`
- Modify: `src/sim/systems/market/config.ts`
- Create: `content/balance/catchment.json5`
- Create: `src/sim/systems/market/catchment.ts`
- Create: `src/sim/systems/market/catchment.test.ts`
- Modify: `src/sim/systems/market/index.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `Position` — `{ readonly x: number; readonly y: number }` (used by Tasks 2, 3, 4, 5, 6, 7).
  - `CatchmentConfig` — `{ readonly playerStorePosition: Position; readonly distanceCostPerUnit: number }`.
  - `parseCatchmentConfig(raw: unknown): CatchmentConfig`.
  - `DEFAULT_CATCHMENT_CONFIG: CatchmentConfig`.
  - `travelCost(a: Position, b: Position, config: CatchmentConfig): number` (used by Task 3's gate test).

- [ ] **Step 1: Add `Position` to `types.ts`**

In `src/sim/systems/market/types.ts`, add at the top of the file, above `export const SEGMENTS`:

```ts
/**
 * A coordinate on the coarse catchment grid (PLAN.md §5.1).
 *
 * Deliberately NOT `pathing`'s `Vec2`: that is a continuous in-store position on the
 * `BuildGrid` (phase 1.4). This is an abstract integer city-scale coordinate space with
 * no relationship to, and no interaction with, the store's interior grid.
 */
export interface Position {
  readonly x: number;
  readonly y: number;
}
```

- [ ] **Step 2: Write `content/balance/catchment.json5`**

Create `content/balance/catchment.json5`:

```json5
// Phase 2.0b catchment constants (PLAN.md §5.1). `travelCost` is Manhattan distance on a
// coarse integer city grid — road-network distance, not straight-line — scaled by
// `distanceCostPerUnit` into the same utility units as a segment's `travelCost` weight.
//
// The player's store is fixed at the origin. Multi-store is a v2 non-goal (§1.3), so a
// single fixed position is the honest model, not a placeholder for something general.
{
  playerStorePosition: { x: 0, y: 0 },
  distanceCostPerUnit: 0.05,
}
```

- [ ] **Step 3: Add the catchment schema, parser, and default to `config.ts`**

In `src/sim/systems/market/config.ts`, add a second raw import directly below the existing `segments.json5` import on line 3:

```ts
import catchmentRaw from '../../../../content/balance/catchment.json5?raw';
```

Then append to the end of the file:

```ts
const PositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

const CatchmentConfigSchema = z.object({
  playerStorePosition: PositionSchema,
  // Non-positive would make travelCost meaningless (0) or perverse (distance is rewarded).
  distanceCostPerUnit: z.number().positive(),
});

export type CatchmentConfig = z.infer<typeof CatchmentConfigSchema>;

export function parseCatchmentConfig(raw: unknown): CatchmentConfig {
  return CatchmentConfigSchema.parse(raw);
}

export const DEFAULT_CATCHMENT_CONFIG: CatchmentConfig = parseCatchmentConfig(
  JSON5.parse(catchmentRaw),
);
```

Note: `z.number().int()` already rejects `Infinity` and `NaN`, so no separate `.finite()` is needed.

- [ ] **Step 4: Write the failing tests**

Create `src/sim/systems/market/catchment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { travelCost } from './catchment.js';
import { DEFAULT_CATCHMENT_CONFIG, parseCatchmentConfig } from './config.js';

const CONFIG = { playerStorePosition: { x: 0, y: 0 }, distanceCostPerUnit: 0.5 };

describe('parseCatchmentConfig', () => {
  it('parses a valid config', () => {
    const config = parseCatchmentConfig(CONFIG);
    expect(config.distanceCostPerUnit).toBe(0.5);
    expect(config.playerStorePosition).toEqual({ x: 0, y: 0 });
  });

  it('rejects a non-positive distanceCostPerUnit', () => {
    expect(() => parseCatchmentConfig({ ...CONFIG, distanceCostPerUnit: 0 })).toThrow();
    expect(() => parseCatchmentConfig({ ...CONFIG, distanceCostPerUnit: -1 })).toThrow();
  });

  it('rejects a non-integer position coordinate', () => {
    expect(() =>
      parseCatchmentConfig({ ...CONFIG, playerStorePosition: { x: 0.5, y: 0 } }),
    ).toThrow();
  });

  it('rejects a non-finite position coordinate', () => {
    expect(() =>
      parseCatchmentConfig({
        ...CONFIG,
        playerStorePosition: { x: Number.POSITIVE_INFINITY, y: 0 },
      }),
    ).toThrow();
  });

  it('loads content/balance/catchment.json5 into DEFAULT_CATCHMENT_CONFIG', () => {
    expect(DEFAULT_CATCHMENT_CONFIG.playerStorePosition).toEqual({ x: 0, y: 0 });
    expect(DEFAULT_CATCHMENT_CONFIG.distanceCostPerUnit).toBeGreaterThan(0);
  });
});

describe('travelCost', () => {
  it('is zero at identical positions', () => {
    expect(travelCost({ x: 3, y: -2 }, { x: 3, y: -2 }, CONFIG)).toBe(0);
  });

  it('is symmetric', () => {
    const a = { x: 1, y: 7 };
    const b = { x: -4, y: 2 };
    expect(travelCost(a, b, CONFIG)).toBe(travelCost(b, a, CONFIG));
  });

  it('uses Manhattan distance, not Euclidean', () => {
    // (0,0) -> (3,4): Manhattan is 3 + 4 = 7. Euclidean would be 5. If this test ever
    // reads 5 * distanceCostPerUnit, someone has swapped in a straight-line distance and
    // broken §5.1's "road-network distance on a coarse catchment graph, not Euclidean".
    expect(travelCost({ x: 0, y: 0 }, { x: 3, y: 4 }, CONFIG)).toBeCloseTo(7 * 0.5);
    expect(travelCost({ x: 0, y: 0 }, { x: 3, y: 4 }, CONFIG)).not.toBeCloseTo(5 * 0.5);
  });

  it('handles negative coordinates', () => {
    expect(travelCost({ x: -3, y: -4 }, { x: 0, y: 0 }, CONFIG)).toBeCloseTo(7 * 0.5);
  });

  it('scales linearly with distanceCostPerUnit', () => {
    const near = travelCost({ x: 0, y: 0 }, { x: 2, y: 0 }, CONFIG);
    const doubled = travelCost({ x: 0, y: 0 }, { x: 2, y: 0 }, {
      ...CONFIG,
      distanceCostPerUnit: 1.0,
    });
    expect(doubled).toBeCloseTo(near * 2);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/sim/systems/market/catchment.test.ts`
Expected: FAIL — `./catchment.js` does not exist yet, so the import cannot resolve.

- [ ] **Step 6: Write `catchment.ts`**

Create `src/sim/systems/market/catchment.ts`:

```ts
import type { CatchmentConfig } from './config.js';
import type { Position } from './types.js';

/**
 * Travel cost between two points on the coarse catchment grid (PLAN.md §5.1).
 *
 * Manhattan, not Euclidean: §5.1 specifies road-network distance on a coarse catchment
 * graph. Manhattan distance is the direct reading of "roads, not straight lines" without
 * modelling actual road geometry.
 *
 * Pure — no RNG, no sim state, no clock. Same tier as `consumptionMultiplierFor`.
 */
export function travelCost(a: Position, b: Position, config: CatchmentConfig): number {
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * config.distanceCostPerUnit;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/sim/systems/market/catchment.test.ts`
Expected: PASS, all 10 tests.

- [ ] **Step 8: Export from the market barrel**

Replace the whole of `src/sim/systems/market/index.ts` with:

```ts
export { travelCost } from './catchment.js';
export {
  consumptionMultiplierFor,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_SEGMENT_CONFIG,
  parseCatchmentConfig,
  parseSegmentConfig,
} from './config.js';
export type { CatchmentConfig, SegmentConfig } from './config.js';
export { SEGMENTS } from './types.js';
export type { Position, Segment, SegmentDef, UtilityWeights } from './types.js';
```

- [ ] **Step 9: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/sim/systems/market/types.ts src/sim/systems/market/config.ts \
        src/sim/systems/market/catchment.ts src/sim/systems/market/catchment.test.ts \
        src/sim/systems/market/index.ts content/balance/catchment.json5
git commit -m "feat(market): catchment Position and Manhattan travelCost primitive"
```

---

### Task 2: `RivalStore` type, Sav-A-Lott content, and its schema

**Files:**
- Modify: `src/sim/systems/market/types.ts`
- Modify: `src/sim/systems/market/config.ts`
- Create: `content/rivals/sav-a-lott.json5`
- Modify: `src/sim/systems/market/catchment.test.ts`
- Modify: `src/sim/systems/market/index.ts`
- Modify: `docs/legal/parody-review.md:43`

**Interfaces:**
- Consumes: `Position` (Task 1).
- Produces:
  - `RivalStore` — `{ id, name, archetype, communityLove, position, identity, quality, service, ambiance }`.
  - `parseRivalStore(raw: unknown): RivalStore`.
  - `DEFAULT_RIVAL_STORES: readonly RivalStore[]`.

- [ ] **Step 1: Add `RivalStore` to `types.ts`**

In `src/sim/systems/market/types.ts`, add below the `Position` interface added in Task 1:

```ts
/**
 * A competing store in the catchment (PLAN.md §3, §5.1).
 *
 * `quality`/`service`/`ambiance` are the store-level terms `U(h,s)` multiplies against a
 * segment's `UtilityWeights`. They are authored and validated now; nothing evaluates
 * `U(h,s)` until the store-choice logit sub-phase.
 */
export interface RivalStore {
  readonly id: string;
  readonly name: string;
  /** Flavour text naming the satirised *category*, never a real chain. */
  readonly archetype: string;
  /** Community Love, PLAN.md §3 — 0–100. */
  readonly communityLove: number;
  readonly position: Position;
  /** Tag for the future `brandAffinity(h, s.identity)` term. */
  readonly identity: string;
  /** Store-level U(h,s) term, §5.1 — [0,1]. */
  readonly quality: number;
  /** Store-level U(h,s) term, §5.1 — [0,1]. */
  readonly service: number;
  /** Store-level U(h,s) term, §5.1 — [0,1]. */
  readonly ambiance: number;
}
```

- [ ] **Step 2: Write `content/rivals/sav-a-lott.json5`**

Create the directory `content/rivals/` and the file `content/rivals/sav-a-lott.json5`:

```json5
// Rival 1 — Sav-A-Lott (PLAN.md §3, L1 boss). Logged in docs/legal/parody-review.md row 1;
// the four-part name test passed there before this file was written.
//
// A satire of a *category* (the dying deep-discounter), never of any specific chain. No
// real name, logo, slogan, or trade-dress colour pairing appears here or anywhere else.
//
// quality/service/ambiance are new values — §3 only defines Community Love. They are
// authored low but non-zero to match the signature mechanic ("One register open, ever"):
// service is the weakest term by far, ambiance is near-abandoned, and quality is
// weak-to-middling rather than terrible — the store is failing, not dangerous.
{
  id: 'sav-a-lott',
  name: 'Sav-A-Lott',
  archetype: 'Dying deep-discounter',
  communityLove: 22,
  position: { x: 4, y: -3 },
  identity: 'deep-discount',
  quality: 0.35,
  service: 0.15,
  ambiance: 0.1,
}
```

- [ ] **Step 3: Add the rival schema, parser, and default to `config.ts`**

In `src/sim/systems/market/config.ts`, add a third raw import below the `catchment.json5` import from Task 1:

```ts
import savALottRaw from '../../../../content/rivals/sav-a-lott.json5?raw';
```

Then append to the end of the file:

```ts
const RivalStoreSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  archetype: z.string().min(1),
  communityLove: z.number().min(0).max(100),
  position: PositionSchema,
  identity: z.string().min(1),
  quality: z.number().min(0).max(1),
  service: z.number().min(0).max(1),
  ambiance: z.number().min(0).max(1),
});

export function parseRivalStore(raw: unknown): RivalStore {
  return RivalStoreSchema.parse(raw);
}

/**
 * Only Sav-A-Lott (§3's L1 boss) exists. The other nine rivals are added when their level
 * is built (§16 phase 5.1) — stubbing them now would be content that no test can justify.
 */
export const DEFAULT_RIVAL_STORES: readonly RivalStore[] = [
  parseRivalStore(JSON5.parse(savALottRaw)),
];
```

Also extend the existing type-only import on line 4 of `config.ts` to bring in `RivalStore`. It currently reads:

```ts
import { SEGMENTS, type Segment, type SegmentDef } from './types.js';
```

Change it to:

```ts
import { SEGMENTS, type RivalStore, type Segment, type SegmentDef } from './types.js';
```

- [ ] **Step 4: Write the failing tests**

Append to `src/sim/systems/market/catchment.test.ts`, and extend its import from `./config.js` to also pull in `DEFAULT_RIVAL_STORES` and `parseRivalStore`:

```ts
const RIVAL = {
  id: 'sav-a-lott',
  name: 'Sav-A-Lott',
  archetype: 'Dying deep-discounter',
  communityLove: 22,
  position: { x: 4, y: -3 },
  identity: 'deep-discount',
  quality: 0.35,
  service: 0.15,
  ambiance: 0.1,
};

describe('parseRivalStore', () => {
  it('parses a valid rival', () => {
    const rival = parseRivalStore(RIVAL);
    expect(rival.id).toBe('sav-a-lott');
    expect(rival.communityLove).toBe(22);
  });

  it('rejects communityLove outside [0, 100]', () => {
    expect(() => parseRivalStore({ ...RIVAL, communityLove: -1 })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, communityLove: 101 })).toThrow();
  });

  it('accepts communityLove exactly at both bounds', () => {
    expect(parseRivalStore({ ...RIVAL, communityLove: 0 }).communityLove).toBe(0);
    expect(parseRivalStore({ ...RIVAL, communityLove: 100 }).communityLove).toBe(100);
  });

  it('rejects quality, service, or ambiance outside [0, 1]', () => {
    expect(() => parseRivalStore({ ...RIVAL, quality: 1.1 })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, service: -0.1 })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, ambiance: 2 })).toThrow();
  });

  it('rejects a non-integer rival position', () => {
    expect(() => parseRivalStore({ ...RIVAL, position: { x: 1.5, y: 0 } })).toThrow();
  });

  it('rejects an empty required string', () => {
    expect(() => parseRivalStore({ ...RIVAL, id: '' })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, name: '' })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, archetype: '' })).toThrow();
    expect(() => parseRivalStore({ ...RIVAL, identity: '' })).toThrow();
  });

  it('rejects a rival missing a required field', () => {
    const { quality: _quality, ...incomplete } = RIVAL;
    expect(() => parseRivalStore(incomplete)).toThrow();
  });

  it('loads content/rivals/sav-a-lott.json5 with PLAN.md §3 table values', () => {
    expect(DEFAULT_RIVAL_STORES).toHaveLength(1);
    const savALott = DEFAULT_RIVAL_STORES[0]!;
    expect(savALott.id).toBe('sav-a-lott');
    expect(savALott.archetype).toBe('Dying deep-discounter');
    expect(savALott.communityLove).toBe(22);
  });

  it('places Sav-A-Lott somewhere other than the player store', () => {
    // A rival co-located with the player would make travelCost identical for every
    // household, quietly neutering the term the logit sub-phase is about to consume.
    expect(DEFAULT_RIVAL_STORES[0]!.position).not.toEqual(
      DEFAULT_CATCHMENT_CONFIG.playerStorePosition,
    );
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sim/systems/market/catchment.test.ts`
Expected: PASS — Steps 1–3 already wrote the implementation these tests need, so unlike Task 1 there is no separate red phase here. If anything fails, fix it before continuing.

- [ ] **Step 6: Export from the market barrel**

In `src/sim/systems/market/index.ts`, add `DEFAULT_RIVAL_STORES` and `parseRivalStore` to the value export from `./config.js` (keeping alphabetical order), and add `RivalStore` to the type export from `./types.js`. The file becomes:

```ts
export { travelCost } from './catchment.js';
export {
  consumptionMultiplierFor,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_RIVAL_STORES,
  DEFAULT_SEGMENT_CONFIG,
  parseCatchmentConfig,
  parseRivalStore,
  parseSegmentConfig,
} from './config.js';
export type { CatchmentConfig, SegmentConfig } from './config.js';
export { SEGMENTS } from './types.js';
export type { Position, RivalStore, Segment, SegmentDef, UtilityWeights } from './types.js';
```

- [ ] **Step 7: Flip the parody-review status**

In `docs/legal/parody-review.md`, row 1 of the Log table (line 43) currently ends with `| planned |`. Change only that row's Status cell to `implemented`:

```
| 1 | Sav-A-Lott | Dying deep-discounter | Skeleton staffing; one register open | Name, logo, palette, slogan, store layout | 1✓ 2✓ 3✓ 4✓ | implemented |
```

Leave every other row at `planned` — they have no content file yet.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/sim/systems/market/types.ts src/sim/systems/market/config.ts \
        src/sim/systems/market/catchment.test.ts src/sim/systems/market/index.ts \
        content/rivals/sav-a-lott.json5 docs/legal/parody-review.md
git commit -m "feat(market): RivalStore data model and Sav-A-Lott content"
```

---

### Task 3: `Household` carries a catchment position

**Files:**
- Modify: `src/sim/systems/shoppers/types.ts:4-11`
- Modify: `src/sim/systems/shoppers/household.test.ts`

**Interfaces:**
- Consumes: `Position` (Task 1), `travelCost` (Task 1), `DEFAULT_CATCHMENT_CONFIG` (Task 1).
- Produces: `Household.position: Position` (read by Tasks 5, 6, 7).

- [ ] **Step 1: Write the failing gate test**

In `src/sim/systems/shoppers/household.test.ts`, extend the existing import from `../market/index.js` (currently `import { DEFAULT_SEGMENT_CONFIG } from '../market/index.js';`) to:

```ts
import { DEFAULT_CATCHMENT_CONFIG, DEFAULT_SEGMENT_CONFIG, travelCost } from '../market/index.js';
```

Then add a new `describe` block at the end of the file:

```ts
describe('household catchment position', () => {
  it('gives two households at different positions different, deterministic travel costs', () => {
    const near = {
      id: 1,
      segment: 'family' as const,
      position: { x: 1, y: 0 },
      pantry: {},
      list: [],
    };
    const far = {
      id: 2,
      segment: 'family' as const,
      position: { x: 3, y: 4 },
      pantry: {},
      list: [],
    };
    const store = DEFAULT_CATCHMENT_CONFIG.playerStorePosition;
    const unit = DEFAULT_CATCHMENT_CONFIG.distanceCostPerUnit;

    const nearCost = travelCost(near.position, store, DEFAULT_CATCHMENT_CONFIG);
    const farCost = travelCost(far.position, store, DEFAULT_CATCHMENT_CONFIG);

    // Hand-computed Manhattan distance from the origin: 1 and 3 + 4 = 7.
    expect(nearCost).toBeCloseTo(1 * unit);
    expect(farCost).toBeCloseTo(7 * unit);
    expect(farCost).toBeGreaterThan(nearCost);
  });

  it('is deterministic — the same household position yields the same cost every call', () => {
    const position = { x: -2, y: 5 };
    const first = travelCost(position, DEFAULT_CATCHMENT_CONFIG.playerStorePosition, DEFAULT_CATCHMENT_CONFIG);
    const second = travelCost(position, DEFAULT_CATCHMENT_CONFIG.playerStorePosition, DEFAULT_CATCHMENT_CONFIG);
    expect(first).toBe(second);
  });
});
```

Also add `position` to every existing household literal in this file, since `Household.position` becomes required in Step 3 and these will otherwise fail to typecheck. There are four, in the `advancePantryDay` describe block:
- the `{ id: 1, segment: 'family', pantry: { milk: 0.1, bread: 1 }, list: [] }` literal → add `position: { x: 0, y: 0 }`
- the `{ id: 1, segment: 'family', pantry: { milk: 0.4, bread: 1 }, list: [] }` literal → add `position: { x: 0, y: 0 }`
- the `original` literal `{ id: 1, segment: 'family' as const, pantry: { milk: 0.4 }, list: [] }` → add `position: { x: 0, y: 0 }`
- the `const base = { pantry: { milk: 1 }, list: [] }` literal in the divergence test → add `position: { x: 0, y: 0 }`

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/household.test.ts`
Expected: FAIL — `travelCost` / `DEFAULT_CATCHMENT_CONFIG` resolve fine (Task 1 shipped them), but `position` is not yet a known property of `Household`, so the literals are excess-property errors under TS.

- [ ] **Step 3: Add `position` to `Household`**

In `src/sim/systems/shoppers/types.ts`, change the import on line 1 and the interface. The file's first 11 lines become:

```ts
import type { Position, Segment } from '../market/types.js';
import type { Vec2 } from '../pathing/types.js';

export interface Household {
  readonly id: number;
  readonly segment: Segment;
  /** Where this household lives on the coarse catchment grid — NOT an in-store position. */
  readonly position: Position;
  /** Stock level (0-1) per good id. A good absent from the map is treated as fully stocked (1). */
  readonly pantry: Readonly<Record<string, number>>;
  /** Good ids below their reorderThreshold, in catalog order — deterministic, no ties to break. */
  readonly list: readonly string[];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/household.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in `src/sim/systems/shoppers/system.ts` (its `applyCommand` builds a `Household` without a `position`). Everything else clean. Tasks 4–7 fix the rest; ignore errors outside the files this task touched.

- [ ] **Step 6: Commit**

```bash
git add src/sim/systems/shoppers/types.ts src/sim/systems/shoppers/household.test.ts
git commit -m "feat(sim): Household carries a catchment position"
```

---

### Task 4: `addHousehold` command carries a position

**Files:**
- Modify: `src/sim/core/commands.ts:47` (command union) and `:151-153` (`hashCommand`)

**Interfaces:**
- Consumes: `Position` (Task 1).
- Produces: the `Command` union's `addHousehold` variant gains a required `position: Position` (read by Tasks 5, 6, 7).

- [ ] **Step 1: Extend the command's type import**

In `src/sim/core/commands.ts`, line 17 currently reads:

```ts
import type { Segment } from '../systems/market/types.js';
```

Change it to:

```ts
import type { Position, Segment } from '../systems/market/types.js';
```

- [ ] **Step 2: Add `position` to the command union**

Change line 47 from:

```ts
  | { readonly type: 'addHousehold'; readonly householdId: number; readonly segment: Segment }
```

to:

```ts
  | {
      readonly type: 'addHousehold';
      readonly householdId: number;
      readonly segment: Segment;
      readonly position: Position;
    }
```

- [ ] **Step 3: Hash the new field**

In `hashCommand`, the `addHousehold` case (lines 151–153) currently reads:

```ts
    case 'addHousehold':
      hasher.u32(command.householdId).str(command.segment);
      return;
```

Change it to:

```ts
    case 'addHousehold':
      hasher
        .u32(command.householdId)
        .str(command.segment)
        .i32(command.position.x)
        .i32(command.position.y);
      return;
```

Use `i32`, not `u32`: catchment coordinates are signed and Sav-A-Lott already sits at a negative `y`.

- [ ] **Step 4: Confirm `commands.test.ts` needs no change**

Run: `grep -n "addHousehold" src/sim/core/commands.test.ts`
Expected: no output — this test file does not construct an `addHousehold` command, so nothing to update. If that ever changes and the grep does return a line, add `position: { x: 0, y: 0 }` to that literal.

- [ ] **Step 5: Typecheck to confirm every call site is flagged**

Run: `npx tsc --noEmit`
Expected: errors at each remaining call site that does not yet pass `position` — `system.ts`, `system.test.ts`, `build-bridge.ts`, `build-bridge.test.ts`, `understaffing.test.ts`, `loss-leader.test.ts`, `tests/golden/scenarios.ts`. Expected mid-plan; Tasks 5–7 fix them.

- [ ] **Step 6: Commit**

```bash
git add src/sim/core/commands.ts
git commit -m "feat(sim): addHousehold command requires a catchment position"
```

---

### Task 5: `ShoppersSystem` sets and hashes `position`

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts:106` (`hash`) and `:149-156` (`applyCommand`)
- Modify: `src/sim/systems/shoppers/system.test.ts:56,64,89,101,119,159`

**Interfaces:**
- Consumes: `Household.position` (Task 3), the command's `position` (Task 4).
- Produces: nothing new for later tasks.

**Why `hash()` and not just `hashCommand`:** `World#computeHash` (`src/sim/core/world.ts:172`) builds `world.hash` from the seed, tick, speed, paused flag, RNG draw count, and each **system's** `hash()` — it never calls `hashCommand`. `hashCommand` feeds the separate command-log hash used for replay verification. So Task 4 alone would **not** move the golden fixture; this task's `hash()` change is what does. (The spec's testing section attributes the golden move to `hashCommand`; that attribution is wrong, though its conclusion — the hash will move — is right.)

- [ ] **Step 1: Write the failing test**

In `src/sim/systems/shoppers/system.test.ts`, add inside `describe('ShoppersSystem — commands and wiring', ...)`, directly after the existing `'addHousehold stores the segment and applies its consumptionMultiplier on depletion'` test:

```ts
it('addHousehold stores the catchment position', () => {
  const { world, shoppers } = worldWithShoppers();
  world.commands.push({
    type: 'addHousehold',
    householdId: 1,
    segment: 'family',
    position: { x: 2, y: -5 },
  });
  world.step();
  expect(shoppers.household(1).position).toEqual({ x: 2, y: -5 });
});

it('folds household position into the world hash', () => {
  const a = worldWithShoppers();
  a.world.commands.push({
    type: 'addHousehold',
    householdId: 1,
    segment: 'family',
    position: { x: 1, y: 1 },
  });
  a.world.step();

  const b = worldWithShoppers();
  b.world.commands.push({
    type: 'addHousehold',
    householdId: 1,
    segment: 'family',
    position: { x: 9, y: 9 },
  });
  b.world.step();

  // Same seed, same tick, same everything except where the household lives.
  expect(a.world.hash).not.toBe(b.world.hash);
});
```

Then add `position: { x: 0, y: 0 }` to every existing `addHousehold` push in the file — lines 56, 64, 89, 101, 119, and 159, e.g.:

```ts
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
```

(Line 64's push uses `segment: 'convenience'` — keep that segment, just add the position.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: FAIL — `applyCommand` does not set `position` (so `household(1).position` is `undefined`), and the two worlds hash identically because `hash()` ignores position.

- [ ] **Step 3: Set `position` in `applyCommand`**

In `src/sim/systems/shoppers/system.ts`, the `addHousehold` case (lines 149–156) currently reads:

```ts
      case 'addHousehold':
        this.#households.set(command.householdId, {
          id: command.householdId,
          segment: command.segment,
          pantry: {},
          list: deriveShoppingList({}, this.#catalog),
        });
        return true;
```

Change it to:

```ts
      case 'addHousehold':
        this.#households.set(command.householdId, {
          id: command.householdId,
          segment: command.segment,
          position: command.position,
          pantry: {},
          list: deriveShoppingList({}, this.#catalog),
        });
        return true;
```

- [ ] **Step 4: Fold `position` into `hash()`**

In the same file, the household loop inside `hash()` currently reads (line 106):

```ts
      hasher.u32(id).str(household.segment);
```

Change it to:

```ts
      hasher.u32(id).str(household.segment).i32(household.position.x).i32(household.position.y);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "feat(sim): ShoppersSystem stores and hashes the household catchment position"
```

---

### Task 6: Bridge and remaining call sites pass a position

**Files:**
- Modify: `src/sim/index.ts:51-58`
- Modify: `src/bridge/build-bridge.ts:11,102-104`
- Modify: `src/bridge/build-bridge.test.ts:83,95`
- Modify: `src/sim/systems/checkout/understaffing.test.ts:57`
- Modify: `src/sim/systems/economy/loss-leader.test.ts:64`

**Interfaces:**
- Consumes: `Position` (Task 1), the command's `position` (Task 4).
- Produces: `BuildModeBridge#addHousehold(householdId: number, segment: Segment, position: Position): void`.

- [ ] **Step 1: Re-export the new market API from the sim barrel**

`src/bridge/` imports only through `src/sim/index.ts`, never deep into a system, so the new types have to reach the barrel first. In `src/sim/index.ts`, the market block (lines 51–58) currently reads:

```ts
export {
  consumptionMultiplierFor,
  DEFAULT_SEGMENT_CONFIG,
  parseSegmentConfig,
  SEGMENTS,
} from './systems/market/index.js';
export type { Segment, SegmentConfig, SegmentDef, UtilityWeights } from './systems/market/index.js';
```

Change it to:

```ts
export {
  consumptionMultiplierFor,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_RIVAL_STORES,
  DEFAULT_SEGMENT_CONFIG,
  parseCatchmentConfig,
  parseRivalStore,
  parseSegmentConfig,
  SEGMENTS,
  travelCost,
} from './systems/market/index.js';
export type {
  CatchmentConfig,
  Position,
  RivalStore,
  Segment,
  SegmentConfig,
  SegmentDef,
  UtilityWeights,
} from './systems/market/index.js';
```

- [ ] **Step 2: Update `BuildModeBridge#addHousehold`**

In `src/bridge/build-bridge.ts`, line 11 currently reads:

```ts
import type { Command, FixtureDef, GridDimensions, Placement, Rotation, Segment, ShopperState } from '../sim/index.js';
```

Change it to add `Position` (alphabetical, before `Rotation`):

```ts
import type { Command, FixtureDef, GridDimensions, Placement, Position, Rotation, Segment, ShopperState } from '../sim/index.js';
```

Then change the method at lines 102–104 from:

```ts
  addHousehold(householdId: number, segment: Segment): void {
    this.#step({ type: 'addHousehold', householdId, segment });
  }
```

to:

```ts
  addHousehold(householdId: number, segment: Segment, position: Position): void {
    this.#step({ type: 'addHousehold', householdId, segment, position });
  }
```

- [ ] **Step 3: Update both `build-bridge.test.ts` call sites**

Change both occurrences of `bridge.addHousehold(1, 'family');` (lines 83 and 95) to:

```ts
    bridge.addHousehold(1, 'family', { x: 0, y: 0 });
```

- [ ] **Step 4: Update `understaffing.test.ts`**

In `src/sim/systems/checkout/understaffing.test.ts:57`, change:

```ts
    world.commands.push({ type: 'addHousehold', householdId: i + 1, segment: 'family' });
```

to:

```ts
    world.commands.push({
      type: 'addHousehold',
      householdId: i + 1,
      segment: 'family',
      position: { x: 0, y: 0 },
    });
```

- [ ] **Step 5: Update `loss-leader.test.ts`**

Apply the identical change at `src/sim/systems/economy/loss-leader.test.ts:64`.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: the only remaining error is in `tests/golden/scenarios.ts` (fixed in Task 7). Everything else clean.

- [ ] **Step 7: Run the affected test files**

Run: `npx vitest run src/bridge/build-bridge.test.ts src/sim/systems/checkout/understaffing.test.ts src/sim/systems/economy/loss-leader.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/sim/index.ts src/bridge/build-bridge.ts src/bridge/build-bridge.test.ts \
        src/sim/systems/checkout/understaffing.test.ts src/sim/systems/economy/loss-leader.test.ts
git commit -m "feat(bridge): addHousehold requires a catchment position; update call sites"
```

---

### Task 7: Golden re-baseline, full verify, and phase close-out

**Files:**
- Modify: `tests/golden/scenarios.ts:172`
- Modify: `tests/golden/hashes.json` (re-baselined — its own commit)
- Modify: `CHANGELOG.md`
- Modify: `docs/handoff.md` (local-only, untracked — never committed)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — closing task.

- [ ] **Step 1: Update the `shopper-trip` scenario**

In `tests/golden/scenarios.ts:172`, change:

```ts
      world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family' });
```

to:

```ts
      world.commands.push({
        type: 'addHousehold',
        householdId: 1,
        segment: 'family',
        position: { x: 0, y: 0 },
      });
```

- [ ] **Step 2: Run the golden test and confirm only `shopper-trip` moved**

Run: `npx vitest run tests/golden/golden.test.ts 2>&1 | grep -E "×|✓|behaviour changed"`

Expected: exactly one failure, `shopper-trip: simulation behaviour changed`. This is expected — Task 5 added `household.position` to `ShoppersSystem#hash`, which is new bytes in the hash stream for any scenario containing a household.

If **any other** scenario also failed, STOP. That means something changed behaviour outside this phase's intent, and per `CLAUDE.md`'s golden-hash rule it must be root-caused before the baseline is touched.

- [ ] **Step 3: Confirm the tick count did not change**

Run: `npx vitest run tests/golden/golden.test.ts 2>&1 | grep -c "scenario tick count changed"`
Expected: `0`. A moved hash is expected; a changed tick count would mean the sim ran for a different length of time, which nothing in this phase should cause.

- [ ] **Step 4: Re-baseline and confirm green**

Run: `UPDATE_GOLDEN=1 npx vitest run tests/golden/golden.test.ts`
Then: `npx vitest run tests/golden/golden.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the diff's shape before committing it**

Run: `git diff --stat tests/golden/hashes.json` and `git diff tests/golden/hashes.json | grep -cE "^[+-].*\"(name|ticks)\""`

Expected: one file changed with an equal number of insertions and deletions, and `0` changed `name`/`ticks` lines — i.e. only one scenario's recorded hash array moved, and its length is unchanged.

- [ ] **Step 6: Commit the re-baseline in its own commit**

```bash
git add tests/golden/scenarios.ts tests/golden/hashes.json
git commit -m "test(golden): re-baseline shopper-trip — household position joins the world hash

ShoppersSystem#hash now folds in household.position (phase 2.0b), which is
new state in the hash stream for any scenario with a household. Nothing about
the simulation's behaviour changed: no code reads travelCost yet, and the
scenario's tick count is identical. Unlike 2.0a's segment work there is no
neutral position value that would have avoided this. Only shopper-trip moved;
the other nine scenarios were confirmed untouched first."
```

- [ ] **Step 7: Run the full verify suite**

Run: `npm run verify`
Expected: PASS — typecheck, lint, `check:tokens`, `check:content`, unit tests, golden tests, and the production build all green.

If it fails, fix the cause before proceeding. Do not commit the close-out below while `verify` is red.

- [ ] **Step 8: Confirm the phase gate**

Re-read the gate from the spec and confirm each clause against a real test, not from memory:
1. *Content validation fails on an invalid rival/catchment config, each failure mode proven* — `catchment.test.ts`: bad CL (both bounds), quality/service/ambiance out of `[0,1]`, non-integer position, non-positive `distanceCostPerUnit`, empty required strings, missing field.
2. *`sav-a-lott.json5` loads and validates against §3's table values* — `catchment.test.ts`'s `'loads content/rivals/sav-a-lott.json5 with PLAN.md §3 table values'` asserts `archetype` and `communityLove: 22`.
3. *Two households at different known distances produce different, deterministic `travelCost` values matching hand-computed Manhattan distance* — `household.test.ts`'s `'household catchment position'` block.

- [ ] **Step 9: Add the CHANGELOG entry**

In `CHANGELOG.md`, directly below the `#### Phase 2.0a — Household segments · **gate PASS**` block (at the end of the `### Milestone 2 — Depth` section), add:

```markdown
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
```

- [ ] **Step 10: Update the local handoff**

`docs/handoff.md` is gitignored and local-only — update it, never commit it. Replace the "Now" section's opening paragraph with a phase 2.0b summary: gate PASS, what landed, the golden re-baseline and why it was unavoidable this time, and that the next sub-phase is the store-choice logit — the first thing that actually reads `UtilityWeights`, `quality`/`service`/`ambiance`, and `travelCost`, all of which are now authored and inert.

- [ ] **Step 11: Commit the close-out**

```bash
git add CHANGELOG.md
git commit -m "docs: close out phase 2.0b — catchment graph and rival store data model"
```

---

## Gate

Content validation fails on an invalid rival or catchment config, with a schema test proving each failure mode: Community Love outside `[0,100]`, `quality`/`service`/`ambiance` outside `[0,1]`, a non-integer position, a non-positive `distanceCostPerUnit`, an empty required string, and a missing field. `content/rivals/sav-a-lott.json5` loads and validates against `PLAN.md` §3's table values (`Dying deep-discounter`, CL 22). Two households at different, known distances from `playerStorePosition` produce different, deterministic `travelCost` values matching a hand-computed Manhattan distance. `npm run verify` is green end to end. The `shopper-trip` re-baseline is isolated in its own commit with a stated reason, and no other scenario's hash or tick count moved.

---

## Self-Review Notes

- **Spec coverage:** `Position`/`RivalStore` types (Tasks 1–2), `catchment.json5` + `sav-a-lott.json5` (Tasks 1–2), `parseCatchmentConfig`/`parseRivalStore`/`DEFAULT_CATCHMENT_CONFIG`/`DEFAULT_RIVAL_STORES` (Tasks 1–2), `travelCost` as a pure Manhattan function (Task 1), `Household.position` (Task 3), `addHousehold` + `hashCommand` (Task 4), every listed call site (Tasks 5–7), golden re-baseline in its own commit (Task 7), gate re-checked (Task 7 Step 8).
- **One spec correction, carried in Task 5:** the spec's testing section says the golden hash moves because "`addHousehold`'s `hashCommand` includes it". `World#computeHash` (`world.ts:172`) never calls `hashCommand` — it hashes the seed, tick, speed, paused flag, RNG draw count, and each system's `hash()`. `hashCommand` feeds the separate command-log hash used for replay verification. The spec's *conclusion* is right (the hash will move, and no neutral position exists), but the mechanism is `ShoppersSystem#hash`, so Task 5 folds `position` in there explicitly rather than assuming Task 4 was sufficient. This is the same correction 2.0a's plan made for `segment`.
- **`i32`, not `u32`, for coordinates:** catchment positions are signed — Sav-A-Lott sits at `y: -3`. `Hasher` exposes `i32` (`hash.ts:38`); using it keeps the intent legible even though `u32`'s `>>> 0` would also be injective over the int32 range.
- **No new rival row in `parody-review.md`:** Sav-A-Lott was logged as row 1 with a passing four-part name test long before this phase, satisfying `CLAUDE.md`'s "log before implementing" rule. Task 2 only flips its status `planned` → `implemented`, matching the documented `planned → reviewed → implemented` lifecycle.
- **`content/rivals/` is a new directory,** not `content/balance/`: a rival is a content record, not a tuning constant. Every existing `?raw` import happens to point at `content/balance/`, but Vite's `?raw` works for any path, so no build config changes.
- **`check:content` is unaffected:** `tools/check-gentle-surface.mjs` reads only `content/design/gentle-surface.json5`. `quality`/`service`/`ambiance` are §5.1 store-choice terms, not §5.3/§5.4 satisfaction or impulse terms, so the "every term needs a visual tell" rule does not reach them — the same reason 2.0a's `UtilityWeights` needed none.
- **Task 2 has no red phase,** unlike every other task: its schema and content are written in Steps 1–3 before the tests in Step 4, because a zod schema and the JSON5 record it validates are a single indivisible unit — a "failing test" for a schema that does not exist yet only proves the import resolves. The tests still gate the commit; they just do not get a separate red run. This is called out in Step 5 so an implementer following TDD strictly is not confused by the missing failure.
