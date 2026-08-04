# Phase 2.0a — Household Segments & Personality-Vector Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every household a content-defined `Segment` with a §5.1 utility-weight vector and a consumption multiplier, so pantry depletion (and therefore shopping frequency) becomes segment-dependent.

**Architecture:** A new `src/sim/systems/market/` system holds the pure data model (`Segment`, `UtilityWeights`, `SegmentDef`) and its zod-validated content loader (`content/balance/segments.json5` → `DEFAULT_SEGMENT_CONFIG`), following the exact `economy/config.ts` / `goods/catalog.ts` pattern already in the repo. `shoppers/types.ts`'s `Household` gains a required `segment` field, the `addHousehold` command gains a required `segment` field, and `household.ts#advancePantryDay` multiplies `depletionPerDay` by the household's segment multiplier. No store choice, rival stores, or logit evaluation — this phase only threads the field through and proves the depletion-rate effect.

**Tech Stack:** TypeScript, zod, json5, Vitest.

## Global Constraints

- `src/sim/**` imports nothing from Phaser, the DOM, `window`, Capacitor, or Supabase (ESLint-enforced).
- No `Math.random()` / `Date.now()` in `src/sim`.
- New system → new directory under `src/sim/systems/` with `index.ts`, `types.ts`, `*.test.ts`.
- Magic numbers live in `content/balance/*.json5`, never inlined.
- All 7 `SEGMENTS` values required in the config, no duplicates, no unknown ids; every `UtilityWeights` field finite; `temperature` (τ) > 0; `consumptionMultiplier` > 0.
- `family` is the neutral segment: `consumptionMultiplier: 1.0`, documented inline in `segments.json5`, so the golden `shopper-trip` fixture can adopt it deliberately.
- If a golden hash changes, it is re-baselined in its own commit explaining why — never silently alongside this change.
- Conventional commits, one logical unit per commit.

---

## File Structure

**Create:**
- `content/balance/segments.json5` — one `SegmentDef` per segment, all 7 required.
- `src/sim/systems/market/types.ts` — `SEGMENTS`, `Segment`, `UtilityWeights`, `SegmentDef`.
- `src/sim/systems/market/config.ts` — `SegmentConfig`, `parseSegmentConfig`, `consumptionMultiplierFor`, `DEFAULT_SEGMENT_CONFIG`.
- `src/sim/systems/market/config.test.ts` — schema validation tests.
- `src/sim/systems/market/index.ts` — barrel export.

**Modify:**
- `src/sim/core/commands.ts` — `addHousehold` command gains `segment: Segment`; `hashCommand` hashes it.
- `src/sim/systems/shoppers/types.ts` — `Household` gains `segment: Segment`.
- `src/sim/systems/shoppers/household.ts` — `advancePantryDay` takes a `SegmentConfig` and applies the multiplier.
- `src/sim/systems/shoppers/household.test.ts` — pass `segment`/config through existing tests; add a segment-divergence test.
- `src/sim/systems/shoppers/system.ts` — `applyCommand` sets `segment`; `hash()` folds it in; day-advance passes `DEFAULT_SEGMENT_CONFIG`.
- `src/sim/systems/shoppers/system.test.ts` — every `addHousehold` push gains `segment: 'family'`.
- `src/sim/index.ts` — export the `market` system's public surface.
- `src/bridge/build-bridge.ts` — `addHousehold(householdId, segment)`.
- `src/bridge/build-bridge.test.ts` — both call sites pass a segment.
- `src/sim/systems/checkout/understaffing.test.ts` — `addHousehold` push gains `segment: 'family'`.
- `src/sim/systems/economy/loss-leader.test.ts` — `addHousehold` push gains `segment: 'family'`.
- `tests/golden/scenarios.ts` — `shopper-trip` scenario's `addHousehold` push gains `segment: 'family'`.

---

### Task 1: Market system data model — types, content, config, validation

**Files:**
- Create: `src/sim/systems/market/types.ts`
- Create: `content/balance/segments.json5`
- Create: `src/sim/systems/market/config.ts`
- Create: `src/sim/systems/market/config.test.ts`
- Create: `src/sim/systems/market/index.ts`

**Interfaces:**
- Produces: `SEGMENTS: readonly Segment[]`, `type Segment`, `interface UtilityWeights`, `interface SegmentDef` (all from `types.ts`); `type SegmentConfig = ReadonlyMap<Segment, SegmentDef>`, `function parseSegmentConfig(raw: unknown): SegmentConfig`, `function consumptionMultiplierFor(config: SegmentConfig, segment: Segment): number`, `const DEFAULT_SEGMENT_CONFIG: SegmentConfig` (all from `config.ts`, re-exported via `index.ts`).

- [x] **Step 1: Write `types.ts`**

```ts
export const SEGMENTS = [
  'priceHunter', 'convenience', 'family', 'foodie', 'bulk', 'senior', 'student',
] as const;
export type Segment = (typeof SEGMENTS)[number];

export interface UtilityWeights {
  readonly priceFit: number;      // βp
  readonly assortmentFit: number; // βa
  readonly quality: number;       // βq
  readonly service: number;       // βv
  readonly ambiance: number;      // βm
  readonly loyalty: number;       // βl
  readonly brandAffinity: number; // βb
  readonly travelCost: number;    // βd
  readonly temperature: number;   // τ, > 0
}

export interface SegmentDef {
  readonly segment: Segment;
  readonly weights: UtilityWeights;
  /** Multiplies every good's depletionPerDay for a household of this segment. */
  readonly consumptionMultiplier: number;
}
```

- [x] **Step 2: Write `content/balance/segments.json5`**

```json5
// Phase 2.0a household segments (PLAN.md §5.1). Each entry defines a segment's
// store-choice utility weights (unused until the logit lands in a later 2.0
// sub-phase) and its consumption multiplier, which already drives pantry
// depletion rate / shopping frequency (§5.4).
//
// `family` is the neutral segment (consumptionMultiplier: 1.0) so the golden
// `shopper-trip` fixture can use it without perturbing its recorded hash.
[
  {
    segment: 'priceHunter',
    weights: {
      priceFit: 0.9, assortmentFit: 0.2, quality: 0.1, service: 0.1,
      ambiance: 0.1, loyalty: 0.2, brandAffinity: 0.1, travelCost: 0.4,
      temperature: 1.0,
    },
    consumptionMultiplier: 0.9,
  },
  {
    segment: 'convenience',
    weights: {
      priceFit: 0.2, assortmentFit: 0.3, quality: 0.2, service: 0.3,
      ambiance: 0.2, loyalty: 0.3, brandAffinity: 0.2, travelCost: 0.9,
      temperature: 1.0,
    },
    consumptionMultiplier: 1.1,
  },
  {
    segment: 'family',
    weights: {
      priceFit: 0.5, assortmentFit: 0.6, quality: 0.4, service: 0.4,
      ambiance: 0.3, loyalty: 0.4, brandAffinity: 0.3, travelCost: 0.5,
      temperature: 1.0,
    },
    consumptionMultiplier: 1.0, // neutral segment — see file header
  },
  {
    segment: 'foodie',
    weights: {
      priceFit: 0.1, assortmentFit: 0.7, quality: 0.9, service: 0.5,
      ambiance: 0.6, loyalty: 0.3, brandAffinity: 0.6, travelCost: 0.3,
      temperature: 1.0,
    },
    consumptionMultiplier: 0.8,
  },
  {
    segment: 'bulk',
    weights: {
      priceFit: 0.6, assortmentFit: 0.3, quality: 0.2, service: 0.2,
      ambiance: 0.1, loyalty: 0.3, brandAffinity: 0.2, travelCost: 0.6,
      temperature: 1.0,
    },
    consumptionMultiplier: 1.6,
  },
  {
    segment: 'senior',
    weights: {
      priceFit: 0.4, assortmentFit: 0.3, quality: 0.4, service: 0.6,
      ambiance: 0.4, loyalty: 0.6, brandAffinity: 0.4, travelCost: 0.7,
      temperature: 1.0,
    },
    consumptionMultiplier: 0.7,
  },
  {
    segment: 'student',
    weights: {
      priceFit: 0.8, assortmentFit: 0.2, quality: 0.1, service: 0.1,
      ambiance: 0.2, loyalty: 0.1, brandAffinity: 0.2, travelCost: 0.5,
      temperature: 1.0,
    },
    consumptionMultiplier: 0.6,
  },
]
```

- [x] **Step 3: Write `config.ts`**

```ts
import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../../content/balance/segments.json5?raw';
import { SEGMENTS, type Segment, type SegmentDef } from './types.js';

const UtilityWeightsSchema = z.object({
  priceFit: z.number().finite(),
  assortmentFit: z.number().finite(),
  quality: z.number().finite(),
  service: z.number().finite(),
  ambiance: z.number().finite(),
  loyalty: z.number().finite(),
  brandAffinity: z.number().finite(),
  travelCost: z.number().finite(),
  temperature: z.number().finite().positive(),
});

const SegmentDefSchema = z.object({
  segment: z.enum(SEGMENTS),
  weights: UtilityWeightsSchema,
  consumptionMultiplier: z.number().positive(),
});

const SegmentListSchema = z.array(SegmentDefSchema);

export type SegmentConfig = ReadonlyMap<Segment, SegmentDef>;

export function parseSegmentConfig(raw: unknown): SegmentConfig {
  const parsed = SegmentListSchema.parse(raw);
  const map = new Map<Segment, SegmentDef>();
  for (const def of parsed) {
    if (map.has(def.segment)) throw new Error(`Duplicate segment id in config: ${def.segment}`);
    map.set(def.segment, def);
  }
  for (const segment of SEGMENTS) {
    if (!map.has(segment)) throw new Error(`Missing segment in config: ${segment}`);
  }
  return map;
}

export function consumptionMultiplierFor(config: SegmentConfig, segment: Segment): number {
  return config.get(segment)!.consumptionMultiplier;
}

export const DEFAULT_SEGMENT_CONFIG: SegmentConfig = parseSegmentConfig(JSON5.parse(raw));
```

- [x] **Step 4: Write `config.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SEGMENT_CONFIG, parseSegmentConfig } from './config.js';
import { SEGMENTS } from './types.js';

const WEIGHTS = {
  priceFit: 0.5, assortmentFit: 0.5, quality: 0.5, service: 0.5,
  ambiance: 0.5, loyalty: 0.5, brandAffinity: 0.5, travelCost: 0.5,
  temperature: 1.0,
};

function validConfig(): unknown[] {
  return SEGMENTS.map((segment) => ({ segment, weights: WEIGHTS, consumptionMultiplier: 1.0 }));
}

describe('parseSegmentConfig', () => {
  it('parses a valid config with all 7 segments', () => {
    const config = parseSegmentConfig(validConfig());
    expect(config.size).toBe(7);
    expect(config.get('family')?.consumptionMultiplier).toBe(1.0);
  });

  it('rejects a config missing a segment', () => {
    const incomplete = validConfig().slice(0, 6);
    expect(() => parseSegmentConfig(incomplete)).toThrow(/Missing segment/);
  });

  it('rejects a duplicate segment id', () => {
    const dup = [...validConfig(), { segment: 'family', weights: WEIGHTS, consumptionMultiplier: 1.0 }];
    expect(() => parseSegmentConfig(dup)).toThrow(/Duplicate segment/);
  });

  it('rejects an unknown segment id', () => {
    const bogus = [...validConfig().slice(1), { segment: 'nonexistent', weights: WEIGHTS, consumptionMultiplier: 1.0 }];
    expect(() => parseSegmentConfig(bogus)).toThrow();
  });

  it('rejects a temperature <= 0', () => {
    const bad = validConfig();
    (bad[0] as { weights: typeof WEIGHTS }).weights = { ...WEIGHTS, temperature: 0 };
    expect(() => parseSegmentConfig(bad)).toThrow();
  });

  it('rejects a non-finite weight', () => {
    const bad = validConfig();
    (bad[0] as { weights: typeof WEIGHTS }).weights = { ...WEIGHTS, priceFit: Number.POSITIVE_INFINITY };
    expect(() => parseSegmentConfig(bad)).toThrow();
  });

  it('rejects a non-positive consumptionMultiplier', () => {
    const bad = validConfig();
    (bad[0] as { consumptionMultiplier: number }).consumptionMultiplier = 0;
    expect(() => parseSegmentConfig(bad)).toThrow();
  });

  it('loads content/balance/segments.json5 into DEFAULT_SEGMENT_CONFIG', () => {
    expect(DEFAULT_SEGMENT_CONFIG.size).toBe(7);
    expect(DEFAULT_SEGMENT_CONFIG.get('family')?.consumptionMultiplier).toBe(1.0);
  });
});
```

- [x] **Step 5: Write `index.ts` barrel**

```ts
export { consumptionMultiplierFor, DEFAULT_SEGMENT_CONFIG, parseSegmentConfig } from './config.js';
export type { SegmentConfig } from './config.js';
export { SEGMENTS } from './types.js';
export type { Segment, SegmentDef, UtilityWeights } from './types.js';
```

- [x] **Step 6: Run the new tests**

Run: `npx vitest run src/sim/systems/market/config.test.ts`
Expected: PASS (8 tests)

- [x] **Step 7: Commit**

```bash
git add content/balance/segments.json5 src/sim/systems/market/
git commit -m "feat(market): add household segment data model and content"
```

---

### Task 2: Segment on `Household` and the `addHousehold` command

**Files:**
- Modify: `src/sim/systems/shoppers/types.ts`
- Modify: `src/sim/core/commands.ts`

**Interfaces:**
- Consumes: `Segment` from `../market/types.js` (Task 1).
- Produces: `Household.segment: Segment`; `Command`'s `addHousehold` variant carries `segment: Segment`; `hashCommand` folds it in.

- [x] **Step 1: Add `segment` to `Household`**

In `src/sim/systems/shoppers/types.ts`, add the import and field:

```ts
import type { Segment } from '../market/types.js';
import type { Vec2 } from '../pathing/types.js';

export interface Household {
  readonly id: number;
  readonly segment: Segment;
  /** Stock level (0-1) per good id. A good absent from the map is treated as fully stocked (1). */
  readonly pantry: Readonly<Record<string, number>>;
  /** Good ids below their reorderThreshold, in catalog order — deterministic, no ties to break. */
  readonly list: readonly string[];
}
```

- [x] **Step 2: Add `segment` to the `addHousehold` command**

In `src/sim/core/commands.ts`, add the import near the top and update the union member:

```ts
import type { Segment } from '../systems/market/types.js';
```

Change:

```ts
  | { readonly type: 'addHousehold'; readonly householdId: number }
```

to:

```ts
  | { readonly type: 'addHousehold'; readonly householdId: number; readonly segment: Segment }
```

- [x] **Step 3: Hash the new field**

In `hashCommand`'s `'addHousehold'` case, change:

```ts
    case 'addHousehold':
      hasher.u32(command.householdId);
      return;
```

to:

```ts
    case 'addHousehold':
      hasher.u32(command.householdId).str(command.segment);
      return;
```

- [x] **Step 4: Confirm the compiler catches every stale call site**

Run: `npx tsc --noEmit`
Expected: FAIL — errors at every `{ type: 'addHousehold', householdId: ... }` literal missing `segment` (this is the checklist for Tasks 4–5; do not fix them here).

- [x] **Step 5: Commit**

```bash
git add src/sim/systems/shoppers/types.ts src/sim/core/commands.ts
git commit -m "feat(shoppers): require a segment on Household and addHousehold"
```

---

### Task 3: Segment-dependent pantry depletion

**Files:**
- Modify: `src/sim/systems/shoppers/household.ts`
- Modify: `src/sim/systems/shoppers/household.test.ts`

**Interfaces:**
- Consumes: `Household.segment` (Task 2); `SegmentConfig`, `consumptionMultiplierFor`, `DEFAULT_SEGMENT_CONFIG` from `../market/config.js` (Task 1).
- Produces: `advancePantryDay(household, catalog, segmentConfig): Household` — new third parameter, no default (every call site must pass one explicitly, matching the "required" decision already made for `addHousehold`).

- [x] **Step 1: Write the failing test — segment divergence**

Append to `src/sim/systems/shoppers/household.test.ts` (add the import first):

```ts
import { DEFAULT_SEGMENT_CONFIG } from '../market/config.js';
```

```ts
describe('advancePantryDay — segment consumption multiplier', () => {
  it('deplete at provably different, deterministic rates for different segments', () => {
    const familyHousehold = advancePantryDay(
      { id: 1, segment: 'family', pantry: { milk: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    const bulkHousehold = advancePantryDay(
      { id: 2, segment: 'bulk', pantry: { milk: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    // family's consumptionMultiplier is 1.0 (neutral); bulk's is 1.6 (content/balance/segments.json5).
    expect(bulkHousehold.pantry.milk).toBeLessThan(familyHousehold.pantry.milk);
    expect(familyHousehold.pantry.milk).toBeCloseTo(0.85); // 1 - 0.15 * 1.0
    expect(bulkHousehold.pantry.milk).toBeCloseTo(0.76); // 1 - 0.15 * 1.6
  });
});
```

- [x] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/sim/systems/shoppers/household.test.ts`
Expected: FAIL — `advancePantryDay` doesn't accept a third argument yet / `Household` literals missing `segment` in the new test compile-fail, and the existing tests also now fail to typecheck (see Step 3).

- [x] **Step 3: Update `household.ts`**

```ts
import type { GoodDef } from '../goods/types.js';
import { consumptionMultiplierFor, type SegmentConfig } from '../market/config.js';
import type { Household } from './types.js';

/** Goods below their `reorderThreshold`, in catalog order (deterministic — no ties to break). */
export function deriveShoppingList(
  pantry: Readonly<Record<string, number>>,
  catalog: readonly GoodDef[],
): readonly string[] {
  const list: string[] = [];
  for (const good of catalog) {
    const stock = pantry[good.id] ?? 1;
    if (stock < good.reorderThreshold) list.push(good.id);
  }
  return list;
}

/** Depletes every good in `household.pantry` by one day, scaled by the household's segment
 *  consumption multiplier (§5.4), then recomputes the shopping list. */
export function advancePantryDay(
  household: Household,
  catalog: readonly GoodDef[],
  segmentConfig: SegmentConfig,
): Household {
  const multiplier = consumptionMultiplierFor(segmentConfig, household.segment);
  const pantry: Record<string, number> = {};
  for (const good of catalog) {
    const stock = household.pantry[good.id] ?? 1;
    pantry[good.id] = Math.max(0, stock - good.depletionPerDay * multiplier);
  }
  return { ...household, pantry, list: deriveShoppingList(pantry, catalog) };
}
```

- [x] **Step 4: Fix the existing `household.test.ts` cases to compile and pass**

Update every existing `Household` literal to add `segment: 'family'`, and every `advancePantryDay(...)` call to pass `DEFAULT_SEGMENT_CONFIG` as the third argument. For example:

```ts
describe('advancePantryDay', () => {
  it('depletes every good by its depletionPerDay, clamped to zero', () => {
    const household = advancePantryDay(
      { id: 1, segment: 'family', pantry: { milk: 0.1, bread: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    expect(household.pantry.milk).toBeCloseTo(0); // 0.1 - 0.15 clamps to 0
    expect(household.pantry.bread).toBeCloseTo(0.8);
  });

  it('recomputes the shopping list after depleting', () => {
    const household = advancePantryDay(
      { id: 1, segment: 'family', pantry: { milk: 0.4, bread: 1 }, list: [] },
      CATALOG,
      DEFAULT_SEGMENT_CONFIG,
    );
    expect(household.pantry.milk).toBeCloseTo(0.25);
    expect(household.list).toEqual(['milk']);
  });

  it('does not mutate the input household', () => {
    const original = { id: 1, segment: 'family' as const, pantry: { milk: 0.4 }, list: [] };
    advancePantryDay(original, CATALOG, DEFAULT_SEGMENT_CONFIG);
    expect(original.pantry.milk).toBe(0.4);
  });
});
```

(`deriveShoppingList`'s own `describe` block is untouched — it never takes a `Household`.)

- [x] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/sim/systems/shoppers/household.test.ts`
Expected: PASS (7 tests: 3 `deriveShoppingList` + 3 existing `advancePantryDay` + 1 new divergence test)

- [x] **Step 6: Commit**

```bash
git add src/sim/systems/shoppers/household.ts src/sim/systems/shoppers/household.test.ts
git commit -m "feat(shoppers): scale pantry depletion by segment consumption multiplier"
```

---

### Task 4: Wire `segment` through `ShoppersSystem`

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts`
- Modify: `src/sim/systems/shoppers/system.test.ts`

**Interfaces:**
- Consumes: `advancePantryDay(household, catalog, segmentConfig)` (Task 3); `DEFAULT_SEGMENT_CONFIG` from `../market/config.js` (Task 1); `command.segment` on `addHousehold` (Task 2).
- Produces: `ShoppersSystem#applyCommand` populates `Household.segment`; `ShoppersSystem#hash` folds `segment` into the world hash (this is the deliberate, expected golden-hash-mover — Task 6 re-baselines it).

- [x] **Step 1: Update the import block**

In `src/sim/systems/shoppers/system.ts`, add:

```ts
import { DEFAULT_SEGMENT_CONFIG } from '../market/config.js';
```

- [x] **Step 2: Pass the segment config into the day-advance loop**

In `update()`, change:

```ts
    if (world.tick % TICKS_PER_SIM_DAY === 0) {
      for (const [id, household] of this.#households) {
        this.#households.set(id, advancePantryDay(household, this.#catalog));
      }
    }
```

to:

```ts
    if (world.tick % TICKS_PER_SIM_DAY === 0) {
      for (const [id, household] of this.#households) {
        this.#households.set(id, advancePantryDay(household, this.#catalog, DEFAULT_SEGMENT_CONFIG));
      }
    }
```

- [x] **Step 3: Set `segment` in `applyCommand`'s `addHousehold` case**

Change:

```ts
      case 'addHousehold':
        this.#households.set(command.householdId, {
          id: command.householdId,
          pantry: {},
          list: deriveShoppingList({}, this.#catalog),
        });
        return true;
```

to:

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

- [x] **Step 4: Fold `segment` into the world hash**

`segment` affects future behaviour (depletion rate), so `computeHash`'s doc comment ("every value that can affect future behaviour must be included") requires it in `hash()`. Change:

```ts
      const household = this.#households.get(id)!;
      hasher.u32(id);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
```

to:

```ts
      const household = this.#households.get(id)!;
      hasher.u32(id).str(household.segment);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
```

- [x] **Step 5: Update every `addHousehold` push in `system.test.ts`**

There are 5 occurrences of `world.commands.push({ type: 'addHousehold', householdId: 1 });` (or with a preceding `stockFixture` push) — add `segment: 'family'` to each:

```ts
world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family' });
```

Apply this to every one of the 5 call sites in `src/sim/systems/shoppers/system.test.ts` (lines currently at 56, 82, 94, 112, 152 — re-locate by searching `addHousehold` since earlier edits may shift lines).

- [x] **Step 6: Run the shoppers system tests**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS (7 tests, including the replay-reproduces-hash test and the full-trip gate test)

- [x] **Step 7: Commit**

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "feat(shoppers): wire household segment through ShoppersSystem"
```

---

### Task 5: Update remaining call sites and the public sim API

**Files:**
- Modify: `src/sim/index.ts`
- Modify: `src/bridge/build-bridge.ts`
- Modify: `src/bridge/build-bridge.test.ts`
- Modify: `src/sim/systems/checkout/understaffing.test.ts`
- Modify: `src/sim/systems/economy/loss-leader.test.ts`

**Interfaces:**
- Consumes: `Segment`, `SEGMENTS`, `SegmentDef`, `UtilityWeights`, `SegmentConfig`, `DEFAULT_SEGMENT_CONFIG`, `parseSegmentConfig`, `consumptionMultiplierFor` from `./systems/market/index.js` (Task 1).
- Produces: `BuildModeBridge#addHousehold(householdId: number, segment: Segment): void`.

- [x] **Step 1: Export the market system from `src/sim/index.ts`**

Add, after the `goods` export block:

```ts
export {
  consumptionMultiplierFor,
  DEFAULT_SEGMENT_CONFIG,
  parseSegmentConfig,
  SEGMENTS,
} from './systems/market/index.js';
export type { Segment, SegmentConfig, SegmentDef, UtilityWeights } from './systems/market/index.js';
```

- [x] **Step 2: Update `BuildModeBridge#addHousehold`**

In `src/bridge/build-bridge.ts`, add `Segment` to the type-only import from `../sim/index.js`:

```ts
import type { Command, FixtureDef, GridDimensions, Placement, Rotation, Segment, ShopperState } from '../sim/index.js';
```

Change:

```ts
  addHousehold(householdId: number): void {
    this.#step({ type: 'addHousehold', householdId });
  }
```

to:

```ts
  addHousehold(householdId: number, segment: Segment): void {
    this.#step({ type: 'addHousehold', householdId, segment });
  }
```

- [x] **Step 3: Update `build-bridge.test.ts` call sites**

Both `bridge.addHousehold(1);` calls (around lines 83 and 95) become:

```ts
bridge.addHousehold(1, 'family');
```

- [x] **Step 4: Update `understaffing.test.ts`**

Change:

```ts
  for (let i = 0; i < SHOPPER_COUNT; i++) {
    world.commands.push({ type: 'addHousehold', householdId: i + 1 });
  }
```

to:

```ts
  for (let i = 0; i < SHOPPER_COUNT; i++) {
    world.commands.push({ type: 'addHousehold', householdId: i + 1, segment: 'family' });
  }
```

- [x] **Step 5: Update `loss-leader.test.ts`**

Same change, same loop shape:

```ts
  for (let i = 0; i < SHOPPER_COUNT; i++) {
    world.commands.push({ type: 'addHousehold', householdId: i + 1, segment: 'family' });
  }
```

- [x] **Step 6: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS — no remaining `addHousehold` literals missing `segment` (`tests/golden/scenarios.ts` is deliberately left for Task 6, which handles the golden re-baseline as its own unit).

- [x] **Step 7: Run the affected test files**

Run: `npx vitest run src/bridge/build-bridge.test.ts src/sim/systems/checkout/understaffing.test.ts src/sim/systems/economy/loss-leader.test.ts`
Expected: PASS

- [x] **Step 8: Commit**

```bash
git add src/sim/index.ts src/bridge/build-bridge.ts src/bridge/build-bridge.test.ts src/sim/systems/checkout/understaffing.test.ts src/sim/systems/economy/loss-leader.test.ts
git commit -m "feat(bridge): thread household segment through the public sim API"
```

---

### Task 6: Golden fixture update and re-baseline (its own commit, per CLAUDE.md)

**Files:**
- Modify: `tests/golden/scenarios.ts`
- Modify: golden hash fixture file(s) under `tests/golden/` that store the recorded `shopper-trip` hash sequence (locate via the golden test runner — search for where `SCENARIOS` hashes are asserted/stored).

**Interfaces:**
- Consumes: `addHousehold` now requiring `segment` (Task 2); `ShoppersSystem#hash` now folding `segment` in (Task 4) — this is what actually moves the `shopper-trip` hash, not just the added command field (commands themselves aren't hashed into `world.hash`; only system state is, via `computeHash`).

- [x] **Step 1: Update the `shopper-trip` scenario's `addHousehold` push**

In `tests/golden/scenarios.ts`, change:

```ts
      world.commands.push({ type: 'addHousehold', householdId: 1 });
```

(inside the `shopper-trip` scenario's `build()`) to:

```ts
      world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family' });
```

- [x] **Step 2: Run the golden test and observe the outcome**

Run: `npx vitest run tests/golden`
Expected: The `shopper-trip` scenario's hash sequence differs from the recorded baseline — `ShoppersSystem#hash` now folds in `household.segment` (Task 4, Step 4), which is new information in the hash regardless of `family`'s neutral multiplier. Every other scenario (`empty-world`, `single-system`, `three-systems`, `speed-and-pause`, `grid-build`, `grid-and-pathing`, `pricing-and-promotions`) must be unaffected — they don't touch `ShoppersSystem`.

- [x] **Step 3: Re-baseline only if the diff is exactly the expected `shopper-trip` change**

If `shopper-trip` is the only scenario whose hashes moved, this is the deliberate, expected consequence of Task 4's `hash()` change (segment is new state that can affect future behavior, per `computeHash`'s contract) — not a bug. Update the recorded baseline for `shopper-trip` only, following whatever mechanism the golden test uses to record/compare baselines (e.g. a snapshot file, a `--update` flag, or an inline expected-hash array — inspect the golden test file adjacent to `scenarios.ts` to find it).

If any *other* scenario's hash also moved, STOP — that is a real bug, not this task's expected change, and must be root-caused before touching the baseline (CLAUDE.md's golden-hash rule).

- [x] **Step 4: Run the golden test again to confirm it's green**

Run: `npx vitest run tests/golden`
Expected: PASS

- [x] **Step 5: Commit the re-baseline separately, explaining why**

```bash
git add tests/golden/scenarios.ts <golden baseline file(s)>
git commit -m "test(golden): re-baseline shopper-trip for segment in Household hash

Household now carries a required segment (phase 2.0a), and ShoppersSystem#hash
folds it in since it affects future depletion behavior. This moves the
shopper-trip scenario's recorded hash sequence; no other scenario is affected."
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [x] **Step 1: Run the full verify suite**

Run: `npm run verify`
Expected: PASS — lint (sim/platform boundary rules included), typecheck, full unit + golden test suite all green.

- [x] **Step 2: Confirm the phase 2.0a gate**

Manually re-read the gate from the spec: "Content validation fails on an incomplete/invalid segment config (schema test proves each failure mode). Two households with different segments, same catalog, deplete pantries at provably different, deterministic rates." Both are covered by Task 1 Step 4 (`config.test.ts`) and Task 3 Step 1 (`household.test.ts`'s divergence test) respectively — no further action needed, this step is a final read-through check.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), `Household`/`addHousehold` changes (Task 2), depletion multiplier (Task 3), `market/config.test.ts` + `household.test.ts` divergence test (Tasks 1 & 3), all existing `addHousehold` call sites updated (Tasks 4–6), golden re-baseline handled as its own commit (Task 6), gate re-checked (Task 7).
- **No unknown segment id** is enforced by `z.enum(SEGMENTS)` in the schema itself (Task 1) rather than a separate check — `parseSegmentConfig` only needs its own duplicate-id and missing-id checks on top of that.
- **Golden hash mechanics:** confirmed via `src/sim/core/world.ts#computeHash` that `world.hash` is built from each system's `hash()` method, not from `hashCommand` — so the golden hash move comes from Task 4's `ShoppersSystem#hash` change, not merely from adding `segment` to the command type. Task 6's step 2 documents this explicitly so the implementer isn't surprised by *why* the hash moved.
