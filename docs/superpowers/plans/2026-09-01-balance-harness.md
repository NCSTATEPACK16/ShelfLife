# Balance Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `tools/sim-harness/` — a headless CLI that runs `src/sim` with six canned
strategies against the currently-authored rival roster and reports win rate, days-to-win, and
EBITDA distribution, plus a gate script that checks PLAN.md's phase 2.0 acceptance rule and
monotonic-CL requirement.

**Architecture:** A pure consumer of `src/sim/index.ts`'s public API, built the same way
`tests/golden/scenarios.ts` already builds a full multi-system world — no new sim mechanic, no
new command. One prerequisite bug fix in already-shipped rival-reactivity code lands first. The
CLI itself can't run via bare `node` (every existing `config.ts` imports its JSON5 content via
Vite's `?raw` suffix, which plain Node doesn't understand — verified empirically during
brainstorming), so it ships as a small Vite SSR bundle that plain `node` then executes.

**Tech Stack:** TypeScript, Zod (config validation), JSON5 (content), Vite (SSR bundling for the
two CLI entry points only — no new runtime dependency). No test framework beyond the project's
existing Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-balance-harness-design.md`

## Global Constraints

- `src/sim/**` imports nothing from Phaser, DOM, `window`, Capacitor, or Supabase — unaffected by
  this plan; `tools/sim-harness/` lives outside `src/sim` and only consumes its public barrel
  (`src/sim/index.ts`).
- No `Math.random()`/`Date.now()` anywhere the harness needs determinism: all harness-side
  randomness (household/catchment generation, the `random` strategy's dice rolls) draws from the
  world's own seeded `'harness'` RNG stream (added in Task 2), never `Math.random()`.
- Magic numbers live in `content/balance/*.json5`, never inlined: the price-reactivity fix's
  `undercutFraction` goes in `content/balance/rivals.json5`; every harness/strategy tuning
  constant goes in the new `content/balance/harness.json5`.
- `tools/sim-harness/` stays dependency-free — no new npm package. It uses only what's already a
  devDependency (`typescript`, `vite`) or dependency (`zod`, `json5`) of this project.
- If a golden hash changes (Task 1's fix may move `rival-reaction`'s), confirm the other
  scenarios are byte-identical first, then re-baseline in its own commit that says why — never as
  a side effect of another change.
- Commit per task, conventional commits, in the order below.

---

### Task 1: Prerequisite fix — `reactWeekly` price-reactivity

**Files:**
- Modify: `src/sim/systems/rivals/reactivity.ts`
- Modify: `src/sim/systems/rivals/reactivity.test.ts`
- Modify: `src/sim/systems/rivals/config.ts`
- Modify: `content/balance/rivals.json5`
- Modify (conditionally, only if the golden hash moves): `tests/golden/hashes.json`

**Interfaces:**
- Produces: `RivalsConfig.undercutFraction: number` (new field), consumed by `reactWeekly` only.
  `reactWeekly`'s signature is unchanged: `(current: RivalStore, share: RivalShare,
  playerPriceLevel: number, config: RivalsConfig) => RivalStore`.

- [x] **Step 1: Strengthen the failing test**

Open `src/sim/systems/rivals/reactivity.test.ts`. Replace the first test's assertion — it
currently only proves the price never *rises*, which the bug already satisfies by never moving
at all. Change it to prove the price *actually moves* in the case the bug fails (Sav-A-Lott,
`base.priceIndex === 0.82`, already cheaper than the player at `1.0`):

```ts
import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import { reactWeekly } from './reactivity.js';

const base = parseRivalStore(JSON5.parse(savALott));

describe('reactWeekly', () => {
  it('strictly cuts price when losing share, even when already cheaper than the player', () => {
    const losing = { playerShare: 0.8, ownShare: 0.2 };
    const next = reactWeekly(base, losing, 1.0, DEFAULT_RIVALS_CONFIG);
    expect(next.priceIndex).toBeLessThan(base.priceIndex);
    expect(next.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
  });
  it('lifts ambiance when the player is taking share', () => {
    const losing = { playerShare: 0.9, ownShare: 0.1 };
    expect(reactWeekly(base, losing, 1.0, DEFAULT_RIVALS_CONFIG).ambiance).toBeGreaterThanOrEqual(
      base.ambiance,
    );
  });
  it('keeps all terms in domain across extreme inputs', () => {
    for (const s of [
      { playerShare: 1, ownShare: 0 },
      { playerShare: 0, ownShare: 1 },
    ]) {
      const n = reactWeekly(base, s, 2, DEFAULT_RIVALS_CONFIG);
      for (const t of [n.quality, n.service, n.ambiance]) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(1);
      }
      expect(n.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
    }
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/sim/systems/rivals/reactivity.test.ts`
Expected: FAIL on the first test — `next.priceIndex` equals `base.priceIndex` (0.82), not less
than it, because the current code's target clamps to `current.priceIndex` whenever the rival is
already at or below the player's price.

- [x] **Step 3: Add the config field**

In `content/balance/rivals.json5`, add `undercutFraction` after `reactionRate`:

```json5
  reactionRate: 0.05,         // base step size before personality scaling
  undercutFraction: 0.35,     // at priceAggression=1, the reaction target sits this far below
                              // the player's price; scaled down for less aggressive rivals
```

In `src/sim/systems/rivals/config.ts`, add the matching schema field right after
`reactionRate: nonNegativeFinite,`:

```ts
const RivalsConfigSchema = z.object({
  weeklyWindowDays: z.number().int().positive(),
  minPriceIndex: z.number().positive().max(1),
  reactionRate: nonNegativeFinite,
  undercutFraction: z.number().positive().max(1),
  derive: z.object({
```

- [x] **Step 4: Fix `reactWeekly`**

Replace `src/sim/systems/rivals/reactivity.ts` in full:

```ts
import type { RivalStore } from '../market/types.js';
import type { RivalsConfig } from './config.js';
import type { RivalShare } from './types.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Pure, RNG-free weekly reaction (PLAN.md §5.8, "checked weekly, not daily"). Only reacts
 * while the rival is losing share to the player — a rival holding or gaining share has no
 * pressure to move. `priceAggression × reactivity` pulls `priceIndex` toward undercutting
 * `playerPriceLevel` — never toward the rival's own current price, which was the bug: a rival
 * already cheaper than the player had nothing to move toward and stayed frozen regardless of
 * `priceAggression`. `qualityInvestment` splits the price reaction between price and quality;
 * `marketingSpend` drives the ambiance response, on the base (non-price-scaled) magnitude, same
 * as before this fix. `service` is untouched here — that's a signature's domain (e.g.
 * `oneRegister`), not the general reactive tick.
 */
export function reactWeekly(
  current: RivalStore,
  share: RivalShare,
  playerPriceLevel: number,
  config: RivalsConfig,
): RivalStore {
  const p = current.personality;
  if (!p) return current;

  const shareDeficit = clamp01(share.playerShare - share.ownShare);
  if (shareDeficit === 0) return current;

  const magnitude = p.reactivity * config.reactionRate * shareDeficit;
  const priceMagnitude = p.priceAggression * magnitude;
  const priceTarget = playerPriceLevel * (1 - config.undercutFraction * p.priceAggression);
  const priceIndex = Math.max(
    config.minPriceIndex,
    current.priceIndex + (priceTarget - current.priceIndex) * priceMagnitude * (1 - p.qualityInvestment),
  );
  const quality = clamp01(current.quality + p.qualityInvestment * magnitude);
  const ambiance = clamp01(current.ambiance + p.marketingSpend * magnitude);

  return { ...current, priceIndex, quality, ambiance };
}
```

- [x] **Step 5: Run the rivals test suite, confirm it passes**

Run: `npx vitest run src/sim/systems/rivals`
Expected: PASS, all files.

- [x] **Step 6: Run the full unit suite and golden tests**

Run: `npx vitest run`
Expected: everything passes except possibly `tests/golden/golden.test.ts`'s `rival-reaction`
scenario (it runs all three rivals together for 21 sim-days, so a price-reactivity change is
likely to move its hash). If **only** `rival-reaction` differs and every other scenario is
byte-identical, proceed to Step 7. If any other scenario's hash also changed, stop and investigate
before re-baselining anything — that would mean the fix leaked somewhere unexpected.

- [x] **Step 7 (conditional): Re-baseline `rival-reaction`**

Only if Step 6 showed `rival-reaction`'s hash changed and nothing else's did. Run:
`npx vitest run tests/golden/golden.test.ts -u` (or the project's equivalent snapshot-update
flag — check `tests/golden/golden.test.ts` for how it writes `tests/golden/hashes.json`; if it
doesn't support `-u`, update the `rival-reaction` entry in `tests/golden/hashes.json` by hand from
the failing test's actual-output diff). Re-run `npx vitest run tests/golden/golden.test.ts` to
confirm only `rival-reaction` changed and everything is green.

- [x] **Step 8: Commit**

If Step 7 was needed, this is two commits (the fix, then the re-baseline, per `CLAUDE.md` — never
bundle a re-baseline into another change's commit). Otherwise one commit.

```bash
git add src/sim/systems/rivals/reactivity.ts src/sim/systems/rivals/reactivity.test.ts \
        src/sim/systems/rivals/config.ts content/balance/rivals.json5
git commit -m "fix(rivals): reactWeekly price step now actually undercuts the player

Previously the price target clamped to min(current, playerPriceLevel), which is a
no-op whenever a rival is already priced at or below the player — true for all
three authored rivals at their derived starting terms. priceAggression was also
never read in the price step at all, contradicting the design spec's own
line 200. Fixed: the target is now playerPriceLevel undercut by an
aggression-scaled fraction, and priceAggression scales the price step's
magnitude. Quality/ambiance reactions are unchanged."
```

If a re-baseline was needed:

```bash
git add tests/golden/hashes.json
git commit -m "test(golden): re-baseline rival-reaction after price-reactivity fix

rival-reaction runs all three rivals for 21 sim-days; the reactWeekly fix in the
previous commit changes their price trajectories under share loss, which is the
intended behavior change, not a regression. The other eight scenarios were
confirmed byte-identical before this re-baseline."
```

---

### Task 2: `'harness'` RNG stream

**Files:**
- Modify: `src/sim/core/rng.ts`
- Modify: `src/sim/core/rng.test.ts`

**Interfaces:**
- Produces: `'harness'` added to `STREAM_NAMES` / `StreamName`. Every existing stream's derived
  seed is unaffected (each is independently derived from `(worldSeed, streamName)`, so adding one
  more name never perturbs the others' output — the property `STREAM_NAMES`'s own comment
  describes).

- [x] **Step 1: Write the failing test**

Add to `src/sim/core/rng.test.ts` (find the existing `describe('StreamSet', ...)` or
`describe('STREAM_NAMES', ...)` block and add a test there; if neither exists, add a new
top-level `describe` block):

```ts
describe('harness stream', () => {
  it('is a distinct stream that does not perturb the others', () => {
    const before = new StreamSet(12345);
    const spawnBefore = before.get('spawn').nextUint32();

    const after = new StreamSet(12345);
    after.get('harness').nextUint32(); // draw from the new stream first
    const spawnAfter = after.get('spawn').nextUint32();

    expect(spawnAfter).toBe(spawnBefore);
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/sim/core/rng.test.ts`
Expected: FAIL — `StreamSet.get('harness')` throws `Unknown RNG stream: harness`, since
`'harness'` isn't yet in `STREAM_NAMES`.

- [x] **Step 3: Add the stream name**

In `src/sim/core/rng.ts`, add `'harness'` to `STREAM_NAMES`:

```ts
export const STREAM_NAMES = [
  'spawn',
  'impulse',
  'spoilage',
  'events',
  'rivalNoise',
  'shrinkage',
  'checkout',
  'staff',
  'harness',
] as const;
```

- [x] **Step 4: Run it, confirm it passes**

Run: `npx vitest run src/sim/core/rng.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/sim/core/rng.ts src/sim/core/rng.test.ts
git commit -m "feat(sim): add 'harness' RNG stream for the balance harness

Used for household/catchment generation and the harness's random strategy —
external-to-the-sim randomness that still needs to be seed-reproducible, kept
in its own stream so it never perturbs any existing system's draws."
```

---

### Task 3: `content/balance/harness.json5` + `tools/sim-harness/config.ts`

**Files:**
- Create: `content/balance/harness.json5`
- Create: `tools/sim-harness/config.ts`
- Create: `tools/sim-harness/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HarnessConfig {
    readonly world: {
      readonly householdCount: number;
      readonly segmentMix: Readonly<Record<string, number>>;
      readonly catchmentMarginCells: number;
    };
    readonly winCondition: {
      readonly trailingWindowDays: number;
      readonly shareThreshold: number;
    };
    readonly strategies: {
      readonly random: { readonly actionChance: number };
      readonly priceWar: {
        readonly cutFraction: number;
        readonly promotionCadenceDays: number;
        readonly promotionDiscountFraction: number;
        readonly promotionDurationDays: number;
      };
      readonly premium: { readonly markupFraction: number };
      readonly service: {
        readonly staffTarget: number;
        readonly hireSkill: number;
        readonly hireMorale: number;
        readonly trainCadenceDays: number;
      };
    };
  }
  export function parseHarnessConfig(raw: unknown): HarnessConfig;
  export const DEFAULT_HARNESS_CONFIG: HarnessConfig;
  ```
  Consumed by every later task in this plan.

- [x] **Step 1: Write the content file**

Create `content/balance/harness.json5`:

```json5
// Balance harness constants (PLAN.md §11.3). Not real level content — the harness owns its
// own starting-store and household-generation defaults until phase 2.1 builds the real level
// schema. See docs/superpowers/specs/2026-09-01-balance-harness-design.md §3-4.
{
  world: {
    householdCount: 24,
    // Proportional weights, not required to sum to 1 — normalized at generation time.
    // Uniform is the right neutral default for a *balance* harness; skewed mixes are a lever
    // for the difficulty-curve pass (phase 5.4), not this sub-project.
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
    random: {
      actionChance: 0.15,
    },
    priceWar: {
      cutFraction: 0.15,
      promotionCadenceDays: 5,
      promotionDiscountFraction: 0.3,
      promotionDurationDays: 3,
    },
    premium: {
      markupFraction: 0.2,
    },
    service: {
      staffTarget: 3,
      hireSkill: 0.85,
      hireMorale: 0.85,
      trainCadenceDays: 14,
    },
  },
}
```

- [x] **Step 2: Write the failing test**

Create `tools/sim-harness/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_HARNESS_CONFIG, parseHarnessConfig } from './config.js';

describe('harness config', () => {
  it('loads defaults with a positive household count and a share threshold in [0,1]', () => {
    expect(DEFAULT_HARNESS_CONFIG.world.householdCount).toBeGreaterThan(0);
    expect(DEFAULT_HARNESS_CONFIG.winCondition.shareThreshold).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_HARNESS_CONFIG.winCondition.shareThreshold).toBeLessThanOrEqual(1);
  });
  it('rejects a non-positive household count', () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_HARNESS_CONFIG));
    raw.world.householdCount = 0;
    expect(() => parseHarnessConfig(raw)).toThrow();
  });
});
```

- [x] **Step 3: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/config.test.ts`
Expected: FAIL — `./config.js` does not exist yet.

- [x] **Step 4: Write `tools/sim-harness/config.ts`**

```ts
import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../content/balance/harness.json5?raw';

const unit = z.number().min(0).max(1);

const HarnessConfigSchema = z.object({
  world: z.object({
    householdCount: z.number().int().positive(),
    segmentMix: z.record(z.string(), z.number().nonnegative()),
    catchmentMarginCells: z.number().int().nonnegative(),
  }),
  winCondition: z.object({
    trailingWindowDays: z.number().int().positive(),
    shareThreshold: unit,
  }),
  strategies: z.object({
    random: z.object({
      actionChance: unit,
    }),
    priceWar: z.object({
      cutFraction: unit,
      promotionCadenceDays: z.number().int().positive(),
      promotionDiscountFraction: unit,
      promotionDurationDays: z.number().int().positive(),
    }),
    premium: z.object({
      markupFraction: z.number().nonnegative(),
    }),
    service: z.object({
      staffTarget: z.number().int().positive(),
      hireSkill: unit,
      hireMorale: unit,
      trainCadenceDays: z.number().int().positive(),
    }),
  }),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;

export function parseHarnessConfig(rawValue: unknown): HarnessConfig {
  return HarnessConfigSchema.parse(rawValue);
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = parseHarnessConfig(JSON5.parse(raw));
```

- [x] **Step 5: Run it, confirm it passes**

Run: `npx vitest run tools/sim-harness/config.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add content/balance/harness.json5 tools/sim-harness/config.ts tools/sim-harness/config.test.ts
git commit -m "feat(harness): add harness.json5 config and its Zod schema

Every harness/strategy tuning constant lives here, never inlined, matching the
project's content/balance/*.json5 convention."
```

---

### Task 4: `tools/sim-harness/world.ts` — baseline store, rival roster, households

**Files:**
- Create: `tools/sim-harness/world.ts`
- Create: `tools/sim-harness/world.test.ts`

**Interfaces:**
- Consumes: `HarnessConfig`, `DEFAULT_HARNESS_CONFIG` (Task 3).
- Produces:
  ```ts
  export const HARNESS_GRID_DIMENSIONS: { width: number; height: number };
  export const BASELINE_SHELF_INSTANCE_IDS: readonly [number, number]; // [milk shelf, bread shelf]
  export const BASELINE_REGISTER_INSTANCE_ID: number;
  export const BASELINE_SELF_CHECKOUT_INSTANCE_ID: number;
  export const BASELINE_STAFF_ID: number;
  export const NEXT_INSTANCE_ID_AFTER_BASELINE: number;
  export const BASELINE_STOCKED_GOOD_IDS: readonly ['milk', 'bread'];
  export const MAX_LEVEL: number; // DEFAULT_RIVAL_STORES.length

  export interface GeneratedHousehold {
    readonly householdId: number;
    readonly segment: Segment;
    readonly position: Position;
  }
  export function generateHouseholds(
    rng: Stream,
    config: HarnessConfig,
    rivalRoster: readonly RivalStore[],
  ): readonly GeneratedHousehold[];

  export interface HarnessWorld {
    readonly world: World;
    readonly economy: EconomySystem;
    readonly checkout: CheckoutSystem;
    readonly market: MarketSystem;
    readonly targetStoreIndex: number; // storeIndex of the level's target rival
  }
  export function buildHarnessWorld(
    level: number,
    seed: number,
    config?: HarnessConfig,
  ): HarnessWorld;
  ```
  Consumed by every strategy (Tasks 5-8) and by `run.ts` (Task 9).

- [x] **Step 1: Write the failing tests**

Create `tools/sim-harness/world.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVAL_STORES, Stream } from '../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from './config.js';
import { buildHarnessWorld, generateHouseholds, MAX_LEVEL } from './world.js';

describe('buildHarnessWorld', () => {
  it('gives level N exactly the first N rivals by CL rank, target = level', () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const { market, targetStoreIndex } = buildHarnessWorld(level, 1);
      expect(targetStoreIndex).toBe(level);
      // storeIndexOf uses the rival's id; the Nth rival (0-based level-1) must resolve.
      const expectedId = DEFAULT_RIVAL_STORES[level - 1]!.id;
      expect(market.storeIndexOf(expectedId)).toBe(level);
      expect(() => market.storeIndexOf(DEFAULT_RIVAL_STORES[level]?.id ?? 'no-such-store')).toThrow();
    }
  });

  it('rejects a level outside [1, MAX_LEVEL]', () => {
    expect(() => buildHarnessWorld(0, 1)).toThrow();
    expect(() => buildHarnessWorld(MAX_LEVEL + 1, 1)).toThrow();
  });
});

describe('generateHouseholds', () => {
  it('is deterministic for the same seed', () => {
    const a = generateHouseholds(new Stream(42), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    const b = generateHouseholds(new Stream(42), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = generateHouseholds(new Stream(1), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    const b = generateHouseholds(new Stream(2), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    expect(a).not.toEqual(b);
  });

  it('produces exactly householdCount households with unique ascending ids', () => {
    const households = generateHouseholds(new Stream(7), DEFAULT_HARNESS_CONFIG, DEFAULT_RIVAL_STORES);
    expect(households).toHaveLength(DEFAULT_HARNESS_CONFIG.world.householdCount);
    expect(households.map((h) => h.householdId)).toEqual(
      Array.from({ length: households.length }, (_, i) => i + 1),
    );
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/world.test.ts`
Expected: FAIL — `./world.js` does not exist yet.

- [x] **Step 3: Write `tools/sim-harness/world.ts`**

```ts
import {
  CheckoutSystem,
  DEFAULT_CATCHMENT_CONFIG,
  DEFAULT_RIVAL_STORES,
  EconomySystem,
  GridSystem,
  InventorySystem,
  LoyaltySystem,
  MarketSystem,
  PathingSystem,
  ReputationSystem,
  RivalsSystem,
  ShoppersSystem,
  World,
} from '../../src/sim/index.js';
import type { RivalStore, Segment, Position, Stream } from '../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from './config.js';

export const HARNESS_GRID_DIMENSIONS = { width: 24, height: 24 };

/** Instance ids of the baseline setup, in placement order — every strategy relies on these
 *  being exactly this, since BuildGrid's instance-id counter is a deterministic 1-based
 *  counter that never reuses ids, even across removes. */
export const BASELINE_SHELF_INSTANCE_IDS: readonly [number, number] = [1, 2];
export const BASELINE_REGISTER_INSTANCE_ID = 3;
export const BASELINE_SELF_CHECKOUT_INSTANCE_ID = 4;
export const BASELINE_STAFF_ID = 1;
export const NEXT_INSTANCE_ID_AFTER_BASELINE = 5;
export const BASELINE_STOCKED_GOOD_IDS: readonly ['milk', 'bread'] = ['milk', 'bread'];

export const MAX_LEVEL = DEFAULT_RIVAL_STORES.length;

export interface GeneratedHousehold {
  readonly householdId: number;
  readonly segment: Segment;
  readonly position: Position;
}

/** Deterministic from `rng` alone — same stream state in, same households out. */
export function generateHouseholds(
  rng: Stream,
  config: HarnessConfig,
  rivalRoster: readonly RivalStore[],
): readonly GeneratedHousehold[] {
  const player = DEFAULT_CATCHMENT_CONFIG.playerStorePosition;
  const xs = [player.x, ...rivalRoster.map((r) => r.position.x)];
  const ys = [player.y, ...rivalRoster.map((r) => r.position.y)];
  const margin = config.world.catchmentMarginCells;
  const minX = Math.min(...xs) - margin;
  const maxX = Math.max(...xs) + margin;
  const minY = Math.min(...ys) - margin;
  const maxY = Math.max(...ys) + margin;

  const segmentWeights = Object.entries(config.world.segmentMix) as [Segment, number][];
  const totalWeight = segmentWeights.reduce((sum, [, weight]) => sum + weight, 0);

  const pickSegment = (): Segment => {
    let roll = rng.nextFloat() * totalWeight;
    for (const [segment, weight] of segmentWeights) {
      roll -= weight;
      if (roll <= 0) return segment;
    }
    return segmentWeights[segmentWeights.length - 1]![0];
  };

  const households: GeneratedHousehold[] = [];
  for (let i = 0; i < config.world.householdCount; i++) {
    households.push({
      householdId: i + 1,
      segment: pickSegment(),
      position: { x: rng.nextInt(minX, maxX), y: rng.nextInt(minY, maxY) },
    });
  }
  return households;
}

export interface HarnessWorld {
  readonly world: World;
  readonly economy: EconomySystem;
  readonly checkout: CheckoutSystem;
  readonly market: MarketSystem;
  /** storeIndex (per MarketSystem/RivalsSystem convention: 0 = player, n = the nth rival) of
   *  this level's featured/target rival — always equal to `level`. */
  readonly targetStoreIndex: number;
}

/**
 * Builds the harness's own canonical starting store: identical fixtures/goods/staff for every
 * strategy at a given level, so comparisons are fair. Not real level content (phase 2.1's job) —
 * see docs/superpowers/specs/2026-09-01-balance-harness-design.md §3.2.
 */
export function buildHarnessWorld(
  level: number,
  seed: number,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): HarnessWorld {
  if (level < 1 || level > MAX_LEVEL) {
    throw new RangeError(`level must be between 1 and ${MAX_LEVEL}, got ${level}`);
  }
  const rivalRoster = DEFAULT_RIVAL_STORES.slice(0, level);

  const world = new World({ seed });
  const grid = new GridSystem(HARNESS_GRID_DIMENSIONS);
  world.register(grid);
  const pathing = new PathingSystem(grid.grid);
  world.register(pathing);
  const inventory = new InventorySystem();
  world.register(inventory);
  const checkout = new CheckoutSystem(grid.grid, pathing);
  world.register(checkout);
  const economy = new EconomySystem(checkout, inventory);
  world.register(economy);

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

  world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 10, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 13, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 15, y: 15, rotation: 0 });
  world.commands.push({ type: 'placeFixture', fixtureId: 'self_checkout', x: 18, y: 18, rotation: 0 });
  world.commands.push({ type: 'stockFixture', instanceId: BASELINE_SHELF_INSTANCE_IDS[0], goodId: 'milk' });
  world.commands.push({ type: 'stockFixture', instanceId: BASELINE_SHELF_INSTANCE_IDS[1], goodId: 'bread' });
  world.commands.push({ type: 'hireStaff', staffId: BASELINE_STAFF_ID, skill: 0.7, morale: 0.7 });
  world.commands.push({
    type: 'assignStaffToRegister',
    staffId: BASELINE_STAFF_ID,
    instanceId: BASELINE_REGISTER_INSTANCE_ID,
  });

  const households = generateHouseholds(world.rng.get('harness'), config, rivalRoster);
  for (const h of households) {
    world.commands.push({ type: 'addHousehold', householdId: h.householdId, segment: h.segment, position: h.position });
  }

  return { world, economy, checkout, market, targetStoreIndex: level };
}
```

- [x] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tools/sim-harness/world.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add tools/sim-harness/world.ts tools/sim-harness/world.test.ts
git commit -m "feat(harness): baseline store, cumulative rival roster, household generation"
```

---

### Task 5: Strategy interface, `do-nothing`, `random`

**Files:**
- Create: `tools/sim-harness/strategies/types.ts`
- Create: `tools/sim-harness/strategies/do-nothing.ts`
- Create: `tools/sim-harness/strategies/random.ts`
- Create: `tools/sim-harness/strategies/do-nothing.test.ts`
- Create: `tools/sim-harness/strategies/random.test.ts`

**Interfaces:**
- Consumes: `HarnessConfig` (Task 3), `BASELINE_STAFF_ID`/`BASELINE_STOCKED_GOOD_IDS` (Task 4),
  `Stream`/`Command`/`EconomySystem`/`CheckoutSystem`/`World` (`src/sim/index.js`).
- Produces:
  ```ts
  export const STRATEGY_NAMES: readonly ['do-nothing', 'random', 'price-war', 'premium', 'service', 'layout-optimizer'];
  export type StrategyName = (typeof STRATEGY_NAMES)[number];
  export interface StrategyContext {
    readonly world: World;
    readonly day: number;
    readonly economy: EconomySystem;
    readonly checkout: CheckoutSystem;
    readonly rng: Stream;
    readonly config: HarnessConfig;
  }
  export interface Strategy {
    readonly name: StrategyName;
    decide(ctx: StrategyContext): readonly Command[];
  }
  export const doNothingStrategy: Strategy;
  export const randomStrategy: Strategy;
  ```
  Consumed by `strategies/index.ts` (Task 8) and `run.ts` (Task 9).

**Note on scope vs. the spec:** the design spec's §4.2 table lists a "fixture tweak" as one of
`random`'s four action kinds. `GridSystem.applyCommand` calls `BuildGrid#place`/`#rotate`, which
**throw `PlacementError` on any invalid cell** (out of bounds or occupied) — uncaught, this
crashes `world.step()` mid-run. Proving a fixture mutation is *always* collision-safe across every
possible random rotation/placement is exactly the kind of geometry a 500-run sweep shouldn't bet
on. `random` here uses three action kinds instead — price delta, promotion, staff training — none
of which can ever throw. This is a deliberate, documented deviation from the spec table, not an
oversight.

- [x] **Step 1: Write `strategies/types.ts`** (no test needed — it's pure type/interface
  declarations plus two trivial constant objects with nothing to assert beyond what TypeScript
  itself checks at compile time)

```ts
import type { CheckoutSystem, Command, EconomySystem, Stream, World } from '../../../src/sim/index.js';
import type { HarnessConfig } from '../config.js';

export const STRATEGY_NAMES = [
  'do-nothing',
  'random',
  'price-war',
  'premium',
  'service',
  'layout-optimizer',
] as const;

export type StrategyName = (typeof STRATEGY_NAMES)[number];

export interface StrategyContext {
  readonly world: World;
  /** 0-based sim day. */
  readonly day: number;
  readonly economy: EconomySystem;
  readonly checkout: CheckoutSystem;
  readonly rng: Stream;
  readonly config: HarnessConfig;
}

export interface Strategy {
  readonly name: StrategyName;
  /** Called once per sim day (the NIGHT decision point, PLAN.md §4). */
  decide(ctx: StrategyContext): readonly Command[];
}
```

- [x] **Step 2: Write the failing test for `do-nothing`**

Create `tools/sim-harness/strategies/do-nothing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { doNothingStrategy } from './do-nothing.js';

describe('doNothingStrategy', () => {
  it('never emits a command', () => {
    // @ts-expect-error — do-nothing never reads ctx, so an empty object is fine here.
    expect(doNothingStrategy.decide({})).toEqual([]);
  });
});
```

- [x] **Step 3: Run it, confirm it fails, then implement**

Run: `npx vitest run tools/sim-harness/strategies/do-nothing.test.ts` — FAIL, `./do-nothing.js`
missing.

Create `tools/sim-harness/strategies/do-nothing.ts`:

```ts
import type { Strategy } from './types.js';

export const doNothingStrategy: Strategy = {
  name: 'do-nothing',
  decide: () => [],
};
```

Run again: PASS.

- [x] **Step 4: Write the failing test for `random`**

Create `tools/sim-harness/strategies/random.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_STAFF_ID, BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import { randomStrategy } from './random.js';

function fakeEconomy() {
  return { referencePriceOf: (goodId: string) => (goodId === 'milk' ? 3.49 : 2.99) } as any;
}

describe('randomStrategy', () => {
  it('never emits a command with actionChance 0', () => {
    const config = {
      ...DEFAULT_HARNESS_CONFIG,
      strategies: { ...DEFAULT_HARNESS_CONFIG.strategies, random: { actionChance: 0 } },
    };
    const commands = randomStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config,
      economy: fakeEconomy(),
    } as any);
    expect(commands).toEqual([]);
  });

  it('always emits exactly one command with actionChance 1, targeting a baseline-stocked good or staff', () => {
    const config = {
      ...DEFAULT_HARNESS_CONFIG,
      strategies: { ...DEFAULT_HARNESS_CONFIG.strategies, random: { actionChance: 1 } },
    };
    const commands = randomStrategy.decide({
      day: 3,
      rng: new Stream(7),
      config,
      economy: fakeEconomy(),
    } as any);
    expect(commands).toHaveLength(1);
    const command = commands[0]!;
    if (command.type === 'setPrice' || command.type === 'startPromotion') {
      expect(BASELINE_STOCKED_GOOD_IDS).toContain(command.goodId);
    } else {
      expect(command.type).toBe('trainStaff');
      expect((command as { staffId: number }).staffId).toBe(BASELINE_STAFF_ID);
    }
  });

  it('is deterministic for the same seed', () => {
    const config = {
      ...DEFAULT_HARNESS_CONFIG,
      strategies: { ...DEFAULT_HARNESS_CONFIG.strategies, random: { actionChance: 1 } },
    };
    const a = randomStrategy.decide({ day: 5, rng: new Stream(99), config, economy: fakeEconomy() } as any);
    const b = randomStrategy.decide({ day: 5, rng: new Stream(99), config, economy: fakeEconomy() } as any);
    expect(a).toEqual(b);
  });
});
```

- [x] **Step 5: Run it, confirm it fails, then implement**

Run: `npx vitest run tools/sim-harness/strategies/random.test.ts` — FAIL, `./random.js` missing.

Create `tools/sim-harness/strategies/random.ts`:

```ts
import type { Command } from '../../../src/sim/index.js';
import { TICKS_PER_SIM_DAY } from '../../../src/sim/index.js';
import { BASELINE_STAFF_ID, BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import type { Strategy, StrategyContext } from './types.js';

const ACTION_KINDS = ['price', 'promotion', 'train'] as const;

function randomAction(ctx: StrategyContext): Command {
  const kind = ctx.rng.pick(ACTION_KINDS);
  switch (kind) {
    case 'price': {
      const goodId = ctx.rng.pick(BASELINE_STOCKED_GOOD_IDS);
      const reference = ctx.economy.referencePriceOf(goodId);
      const factor = 0.7 + ctx.rng.nextFloat() * 0.6; // [0.7, 1.3)
      return { type: 'setPrice', goodId, price: Number((reference * factor).toFixed(2)) };
    }
    case 'promotion': {
      const goodId = ctx.rng.pick(BASELINE_STOCKED_GOOD_IDS);
      const discountFraction = 0.1 + ctx.rng.nextFloat() * 0.3; // [0.1, 0.4)
      return { type: 'startPromotion', goodId, discountFraction, durationTicks: 3 * TICKS_PER_SIM_DAY };
    }
    case 'train':
      return { type: 'trainStaff', staffId: BASELINE_STAFF_ID };
  }
}

export const randomStrategy: Strategy = {
  name: 'random',
  decide(ctx) {
    if (!ctx.rng.chance(ctx.config.strategies.random.actionChance)) return [];
    return [randomAction(ctx)];
  },
};
```

Run again: PASS.

- [x] **Step 6: Commit**

```bash
git add tools/sim-harness/strategies
git commit -m "feat(harness): strategy interface, do-nothing and random strategies

random uses price/promotion/staff-training actions only, not fixture mutation —
GridSystem.applyCommand's placeFixture/rotateFixture throw PlacementError on any
invalid cell, uncaught, which would crash a 500-run sweep on a bad geometry roll.
Deviates from the design spec's 'fixture tweak' action kind for that reason."
```

---

### Task 6: `price-war`, `premium`

**Files:**
- Create: `tools/sim-harness/strategies/price-war.ts`
- Create: `tools/sim-harness/strategies/premium.ts`
- Create: `tools/sim-harness/strategies/price-war.test.ts`
- Create: `tools/sim-harness/strategies/premium.test.ts`

**Interfaces:**
- Consumes: `Strategy`/`StrategyContext` (Task 5), `BASELINE_STOCKED_GOOD_IDS`/
  `NEXT_INSTANCE_ID_AFTER_BASELINE` (Task 4).
- Produces: `priceWarStrategy: Strategy`, `premiumStrategy: Strategy`.

- [x] **Step 1: Write the failing tests**

Create `tools/sim-harness/strategies/price-war.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import { priceWarStrategy } from './price-war.js';

function fakeEconomy() {
  return { referencePriceOf: (goodId: string) => (goodId === 'milk' ? 3.49 : 2.99) } as any;
}

describe('priceWarStrategy', () => {
  it('cuts price on both baseline goods on day 0', () => {
    const commands = priceWarStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    const priceCommands = commands.filter((c) => c.type === 'setPrice');
    expect(priceCommands).toHaveLength(BASELINE_STOCKED_GOOD_IDS.length);
    for (const c of priceCommands as { goodId: string; price: number }[]) {
      const reference = c.goodId === 'milk' ? 3.49 : 2.99;
      expect(c.price).toBeLessThan(reference);
    }
  });

  it('starts a promotion only on cadence days', () => {
    const cadence = DEFAULT_HARNESS_CONFIG.strategies.priceWar.promotionCadenceDays;
    const onCadence = priceWarStrategy.decide({
      day: cadence,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    expect(onCadence.some((c) => c.type === 'startPromotion')).toBe(true);

    const offCadence = priceWarStrategy.decide({
      day: cadence + 1,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    expect(offCadence.some((c) => c.type === 'startPromotion')).toBe(false);
  });
});
```

Create `tools/sim-harness/strategies/premium.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import { premiumStrategy } from './premium.js';

function fakeEconomy() {
  return { referencePriceOf: () => 3 } as any;
}

describe('premiumStrategy', () => {
  it('marks up all four catalog goods and expands assortment, only on day 0', () => {
    const commands = premiumStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
      economy: fakeEconomy(),
    } as any);
    const priceCommands = commands.filter((c) => c.type === 'setPrice') as { price: number }[];
    expect(priceCommands).toHaveLength(4);
    for (const c of priceCommands) expect(c.price).toBeGreaterThan(3);

    const placeCommands = commands.filter((c) => c.type === 'placeFixture');
    expect(placeCommands).toHaveLength(2);
    const stockCommands = commands.filter((c) => c.type === 'stockFixture') as { instanceId: number }[];
    expect(stockCommands.map((c) => c.instanceId).sort()).toEqual([
      NEXT_INSTANCE_ID_AFTER_BASELINE,
      NEXT_INSTANCE_ID_AFTER_BASELINE + 1,
    ]);

    expect(premiumStrategy.decide({ day: 1, rng: new Stream(1), config: DEFAULT_HARNESS_CONFIG, economy: fakeEconomy() } as any)).toEqual([]);
  });
});
```

- [x] **Step 2: Run them, confirm they fail**

Run: `npx vitest run tools/sim-harness/strategies/price-war.test.ts tools/sim-harness/strategies/premium.test.ts`
Expected: FAIL — neither module exists yet.

- [x] **Step 3: Write `tools/sim-harness/strategies/price-war.ts`**

```ts
import type { Command } from '../../../src/sim/index.js';
import { TICKS_PER_SIM_DAY } from '../../../src/sim/index.js';
import { BASELINE_STOCKED_GOOD_IDS } from '../world.js';
import type { Strategy } from './types.js';

export const priceWarStrategy: Strategy = {
  name: 'price-war',
  decide(ctx) {
    const commands: Command[] = [];
    const cfg = ctx.config.strategies.priceWar;

    if (ctx.day === 0) {
      for (const goodId of BASELINE_STOCKED_GOOD_IDS) {
        const reference = ctx.economy.referencePriceOf(goodId);
        commands.push({ type: 'setPrice', goodId, price: Number((reference * (1 - cfg.cutFraction)).toFixed(2)) });
      }
    }

    if (ctx.day % cfg.promotionCadenceDays === 0) {
      const goodId = BASELINE_STOCKED_GOOD_IDS[Math.floor(ctx.day / cfg.promotionCadenceDays) % BASELINE_STOCKED_GOOD_IDS.length]!;
      commands.push({
        type: 'startPromotion',
        goodId,
        discountFraction: cfg.promotionDiscountFraction,
        durationTicks: cfg.promotionDurationDays * TICKS_PER_SIM_DAY,
      });
    }

    return commands;
  },
};
```

- [x] **Step 4: Write `tools/sim-harness/strategies/premium.ts`**

```ts
import type { Command } from '../../../src/sim/index.js';
import { BASELINE_STOCKED_GOOD_IDS, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import type { Strategy } from './types.js';

const EXPANSION_GOODS: readonly ['eggs', 'snacks'] = ['eggs', 'snacks'];
const EXPANSION_SHELF_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 10, y: 16 },
  { x: 10, y: 19 },
];

export const premiumStrategy: Strategy = {
  name: 'premium',
  decide(ctx) {
    if (ctx.day !== 0) return [];
    const commands: Command[] = [];
    const markup = ctx.config.strategies.premium.markupFraction;

    for (const goodId of [...BASELINE_STOCKED_GOOD_IDS, ...EXPANSION_GOODS]) {
      const reference = ctx.economy.referencePriceOf(goodId);
      commands.push({ type: 'setPrice', goodId, price: Number((reference * (1 + markup)).toFixed(2)) });
    }

    EXPANSION_GOODS.forEach((goodId, i) => {
      const pos = EXPANSION_SHELF_POSITIONS[i]!;
      commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: pos.x, y: pos.y, rotation: 0 });
      commands.push({ type: 'stockFixture', instanceId: NEXT_INSTANCE_ID_AFTER_BASELINE + i, goodId });
    });

    return commands;
  },
};
```

- [x] **Step 5: Run them, confirm they pass**

Run: `npx vitest run tools/sim-harness/strategies/price-war.test.ts tools/sim-harness/strategies/premium.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add tools/sim-harness/strategies/price-war.ts tools/sim-harness/strategies/premium.ts \
        tools/sim-harness/strategies/price-war.test.ts tools/sim-harness/strategies/premium.test.ts
git commit -m "feat(harness): price-war and premium strategies"
```

---

### Task 7: `service`, `layout-optimizer`, strategy registry

**Files:**
- Create: `tools/sim-harness/strategies/service.ts`
- Create: `tools/sim-harness/strategies/layout-optimizer.ts`
- Create: `tools/sim-harness/strategies/index.ts`
- Create: `tools/sim-harness/strategies/service.test.ts`
- Create: `tools/sim-harness/strategies/layout-optimizer.test.ts`
- Create: `tools/sim-harness/strategies/index.test.ts`

**Interfaces:**
- Consumes: `Strategy`/`StrategyContext`/`STRATEGY_NAMES` (Task 5), `BASELINE_STAFF_ID`/
  `BASELINE_SHELF_INSTANCE_IDS`/`NEXT_INSTANCE_ID_AFTER_BASELINE` (Task 4), the four strategies
  from Tasks 5-6.
- Produces: `serviceStrategy: Strategy`, `layoutOptimizerStrategy: Strategy`,
  `strategyFor(name: StrategyName): Strategy` (consumed by `run.ts`, Task 9).

- [x] **Step 1: Write the failing tests**

Create `tools/sim-harness/strategies/service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_STAFF_ID, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import { serviceStrategy } from './service.js';

describe('serviceStrategy', () => {
  it('places extra registers and hires staff to fill staffTarget, only on day 0', () => {
    const commands = serviceStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);
    const cfg = DEFAULT_HARNESS_CONFIG.strategies.service;
    const extraCount = cfg.staffTarget - 1;

    expect(commands.filter((c) => c.type === 'placeFixture')).toHaveLength(extraCount);
    const hires = commands.filter((c) => c.type === 'hireStaff') as { staffId: number; skill: number }[];
    expect(hires).toHaveLength(extraCount);
    for (const h of hires) {
      expect(h.staffId).not.toBe(BASELINE_STAFF_ID);
      expect(h.skill).toBe(cfg.hireSkill);
    }
    const assigns = commands.filter((c) => c.type === 'assignStaffToRegister') as { instanceId: number }[];
    expect(assigns.map((a) => a.instanceId).sort()).toEqual(
      Array.from({ length: extraCount }, (_, i) => NEXT_INSTANCE_ID_AFTER_BASELINE + i),
    );
  });

  it('trains all hired staff on cadence days only, after day 0', () => {
    const cfg = DEFAULT_HARNESS_CONFIG.strategies.service;
    const onCadence = serviceStrategy.decide({
      day: cfg.trainCadenceDays,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);
    expect(onCadence.every((c) => c.type === 'trainStaff')).toBe(true);
    expect(onCadence.length).toBe(cfg.staffTarget);

    const offCadence = serviceStrategy.decide({
      day: cfg.trainCadenceDays + 1,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);
    expect(offCadence).toEqual([]);
  });
});
```

Create `tools/sim-harness/strategies/layout-optimizer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_SHELF_INSTANCE_IDS, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import { layoutOptimizerStrategy } from './layout-optimizer.js';

describe('layoutOptimizerStrategy', () => {
  it('removes both baseline shelves and places four new ones stocked with all four goods, only on day 0', () => {
    const commands = layoutOptimizerStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);

    const removals = commands.filter((c) => c.type === 'removeFixture') as { instanceId: number }[];
    expect(removals.map((r) => r.instanceId).sort()).toEqual([...BASELINE_SHELF_INSTANCE_IDS].sort());

    const placements = commands.filter((c) => c.type === 'placeFixture');
    expect(placements).toHaveLength(4);

    const stocked = commands.filter((c) => c.type === 'stockFixture') as { instanceId: number; goodId: string }[];
    expect(stocked.map((s) => s.goodId).sort()).toEqual(['bread', 'eggs', 'milk', 'snacks']);
    expect(stocked.map((s) => s.instanceId).sort()).toEqual(
      Array.from({ length: 4 }, (_, i) => NEXT_INSTANCE_ID_AFTER_BASELINE + i),
    );

    expect(layoutOptimizerStrategy.decide({ day: 1, rng: new Stream(1), config: DEFAULT_HARNESS_CONFIG } as any)).toEqual([]);
  });
});
```

Create `tools/sim-harness/strategies/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { STRATEGY_NAMES } from './types.js';
import { strategyFor } from './index.js';

describe('strategyFor', () => {
  it('returns a strategy whose name matches for every declared name', () => {
    for (const name of STRATEGY_NAMES) {
      expect(strategyFor(name).name).toBe(name);
    }
  });
});
```

- [x] **Step 2: Run them, confirm they fail**

Run: `npx vitest run tools/sim-harness/strategies/service.test.ts tools/sim-harness/strategies/layout-optimizer.test.ts tools/sim-harness/strategies/index.test.ts`
Expected: FAIL — none of the three modules exist yet.

- [x] **Step 3: Write `tools/sim-harness/strategies/service.ts`**

```ts
import type { Command } from '../../../src/sim/index.js';
import { BASELINE_STAFF_ID, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import type { Strategy } from './types.js';

const EXTRA_REGISTER_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 15, y: 17 },
  { x: 15, y: 19 },
];

export const serviceStrategy: Strategy = {
  name: 'service',
  decide(ctx) {
    const commands: Command[] = [];
    const cfg = ctx.config.strategies.service;
    const extraStaffCount = Math.min(Math.max(0, cfg.staffTarget - 1), EXTRA_REGISTER_POSITIONS.length);

    if (ctx.day === 0) {
      for (let i = 0; i < extraStaffCount; i++) {
        const pos = EXTRA_REGISTER_POSITIONS[i]!;
        const instanceId = NEXT_INSTANCE_ID_AFTER_BASELINE + i;
        const staffId = BASELINE_STAFF_ID + 1 + i;
        commands.push({ type: 'placeFixture', fixtureId: 'register', x: pos.x, y: pos.y, rotation: 0 });
        commands.push({ type: 'hireStaff', staffId, skill: cfg.hireSkill, morale: cfg.hireMorale });
        commands.push({ type: 'assignStaffToRegister', staffId, instanceId });
      }
      return commands;
    }

    if (ctx.day % cfg.trainCadenceDays === 0) {
      const hiredCount = extraStaffCount + 1; // + the baseline hire
      for (let staffId = BASELINE_STAFF_ID; staffId < BASELINE_STAFF_ID + hiredCount; staffId++) {
        commands.push({ type: 'trainStaff', staffId });
      }
    }

    return commands;
  },
};
```

- [x] **Step 4: Write `tools/sim-harness/strategies/layout-optimizer.ts`**

```ts
import type { Command } from '../../../src/sim/index.js';
import { BASELINE_SHELF_INSTANCE_IDS, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import type { Strategy } from './types.js';

/** A long aisle spanning the flow-field path from the entrance toward the checkout, so a
 *  shopper's walk passes every stocked good — PLAN §5.4's literal path-exposure mechanic. */
const AISLE_SHELVES: readonly { x: number; y: number; goodId: string }[] = [
  { x: 3, y: 3, goodId: 'milk' },
  { x: 8, y: 8, goodId: 'bread' },
  { x: 13, y: 13, goodId: 'eggs' },
  { x: 16, y: 16, goodId: 'snacks' },
];

export const layoutOptimizerStrategy: Strategy = {
  name: 'layout-optimizer',
  decide(ctx) {
    if (ctx.day !== 0) return [];
    const commands: Command[] = [];

    for (const instanceId of BASELINE_SHELF_INSTANCE_IDS) {
      commands.push({ type: 'removeFixture', instanceId });
    }

    AISLE_SHELVES.forEach((shelf, i) => {
      commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: shelf.x, y: shelf.y, rotation: 0 });
      commands.push({ type: 'stockFixture', instanceId: NEXT_INSTANCE_ID_AFTER_BASELINE + i, goodId: shelf.goodId });
    });

    return commands;
  },
};
```

- [x] **Step 5: Write `tools/sim-harness/strategies/index.ts`**

```ts
import { doNothingStrategy } from './do-nothing.js';
import { layoutOptimizerStrategy } from './layout-optimizer.js';
import { premiumStrategy } from './premium.js';
import { priceWarStrategy } from './price-war.js';
import { randomStrategy } from './random.js';
import { serviceStrategy } from './service.js';
import type { Strategy, StrategyName } from './types.js';

export * from './types.js';

const STRATEGIES: Readonly<Record<StrategyName, Strategy>> = {
  'do-nothing': doNothingStrategy,
  random: randomStrategy,
  'price-war': priceWarStrategy,
  premium: premiumStrategy,
  service: serviceStrategy,
  'layout-optimizer': layoutOptimizerStrategy,
};

export function strategyFor(name: StrategyName): Strategy {
  return STRATEGIES[name];
}
```

- [x] **Step 6: Run all three test files, confirm they pass**

Run: `npx vitest run tools/sim-harness/strategies`
Expected: PASS, every file (all of Tasks 5-7's tests).

- [x] **Step 7: Commit**

```bash
git add tools/sim-harness/strategies
git commit -m "feat(harness): service and layout-optimizer strategies, strategy registry

All six canned strategies (PLAN.md §11.3) are now implemented against the real
command surface — no invented sim mechanic."
```

---

### Task 8: `metrics.ts` — trip-share tracking, win condition, EBITDA

**Files:**
- Create: `tools/sim-harness/metrics.ts`
- Create: `tools/sim-harness/metrics.test.ts`

**Interfaces:**
- Consumes: `TripOutcome` (`src/sim/index.js`).
- Produces:
  ```ts
  export interface DailyTripCounts { readonly player: number; readonly target: number; }
  export class TripCounter {
    recordTick(outcomes: readonly TripOutcome[], targetStoreIndex: number): void;
    closeDay(): void;
    dailyCounts(): readonly DailyTripCounts[];
  }
  export function computeShareTrajectory(
    dailyCounts: readonly DailyTripCounts[],
    trailingWindowDays: number,
  ): readonly number[]; // share(d), NaN if undefined
  export function computeWinResult(
    shareTrajectory: readonly number[],
    shareThreshold: number,
  ): { readonly won: boolean; readonly daysToWin: number | null };
  ```
  Consumed by `run.ts` (Task 9).

- [x] **Step 1: Write the failing tests**

Create `tools/sim-harness/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeShareTrajectory, computeWinResult, TripCounter } from './metrics.js';

describe('TripCounter', () => {
  it('tallies player vs. target trips per day and ignores other rivals', () => {
    const counter = new TripCounter();
    const targetStoreIndex = 2;
    counter.recordTick([{ householdId: 1, storeIndex: 0, satisfaction: 1 }], targetStoreIndex);
    counter.recordTick([{ householdId: 2, storeIndex: 2, satisfaction: 1 }], targetStoreIndex);
    counter.recordTick([{ householdId: 3, storeIndex: 1, satisfaction: 1 }], targetStoreIndex); // a different rival
    counter.closeDay();
    counter.recordTick([{ householdId: 1, storeIndex: 0, satisfaction: 1 }], targetStoreIndex);
    counter.closeDay();

    expect(counter.dailyCounts()).toEqual([
      { player: 1, target: 1 },
      { player: 1, target: 0 },
    ]);
  });
});

describe('computeShareTrajectory', () => {
  it('computes a trailing-window share, NaN when the window has zero trips', () => {
    const trajectory = computeShareTrajectory(
      [
        { player: 0, target: 0 },
        { player: 3, target: 1 },
        { player: 1, target: 3 },
      ],
      2,
    );
    expect(trajectory[0]).toBeNaN();
    expect(trajectory[1]).toBeCloseTo(3 / 4);
    // trailing window of 2 covers days 1-2: player 3+1=4, target 1+3=4
    expect(trajectory[2]).toBeCloseTo(4 / 8);
  });
});

describe('computeWinResult', () => {
  it('wins at the start of the final unbroken suffix at/above threshold', () => {
    expect(computeWinResult([0.3, 0.3, 0.6, 0.7, 0.8], 0.5)).toEqual({ won: true, daysToWin: 2 });
  });
  it('loses if the trajectory crosses the threshold but ends below it', () => {
    expect(computeWinResult([0.6, 0.7, 0.3], 0.5)).toEqual({ won: false, daysToWin: null });
  });
  it('loses if it never reaches the threshold', () => {
    expect(computeWinResult([0.1, 0.2, 0.3], 0.5)).toEqual({ won: false, daysToWin: null });
  });
  it('treats exactly-at-threshold as a win', () => {
    expect(computeWinResult([0.5, 0.5], 0.5)).toEqual({ won: true, daysToWin: 0 });
  });
  it('treats an undefined (NaN) day as breaking the suffix', () => {
    expect(computeWinResult([NaN, 0.6, 0.7], 0.5)).toEqual({ won: true, daysToWin: 1 });
  });
  it('loses on an empty trajectory', () => {
    expect(computeWinResult([], 0.5)).toEqual({ won: false, daysToWin: null });
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/metrics.test.ts`
Expected: FAIL — `./metrics.js` does not exist yet.

- [x] **Step 3: Write `tools/sim-harness/metrics.ts`**

```ts
import type { TripOutcome } from '../../src/sim/index.js';

export interface DailyTripCounts {
  readonly player: number;
  readonly target: number;
}

/** Accumulates trip outcomes tick by tick into one player-vs-target count per sim day. */
export class TripCounter {
  #playerCounts: number[] = [];
  #targetCounts: number[] = [];
  #currentDayPlayer = 0;
  #currentDayTarget = 0;

  recordTick(outcomes: readonly TripOutcome[], targetStoreIndex: number): void {
    for (const outcome of outcomes) {
      if (outcome.storeIndex === 0) this.#currentDayPlayer++;
      else if (outcome.storeIndex === targetStoreIndex) this.#currentDayTarget++;
    }
  }

  closeDay(): void {
    this.#playerCounts.push(this.#currentDayPlayer);
    this.#targetCounts.push(this.#currentDayTarget);
    this.#currentDayPlayer = 0;
    this.#currentDayTarget = 0;
  }

  dailyCounts(): readonly DailyTripCounts[] {
    return this.#playerCounts.map((player, i) => ({ player, target: this.#targetCounts[i]! }));
  }
}

/** share(d) = trailing-window player trips / (player + target) trips; NaN if the window saw
 *  no trips to either store at all — an undefined day, not a 0% share. */
export function computeShareTrajectory(
  dailyCounts: readonly DailyTripCounts[],
  trailingWindowDays: number,
): readonly number[] {
  const trajectory: number[] = [];
  for (let day = 0; day < dailyCounts.length; day++) {
    const start = Math.max(0, day - trailingWindowDays + 1);
    let player = 0;
    let target = 0;
    for (let i = start; i <= day; i++) {
      player += dailyCounts[i]!.player;
      target += dailyCounts[i]!.target;
    }
    const total = player + target;
    trajectory.push(total === 0 ? NaN : player / total);
  }
  return trajectory;
}

/**
 * A run wins if its trailing share is at/above `shareThreshold` for a suffix of days ending at
 * the last day. `daysToWin` is the earliest day of that unbroken suffix. If the final day itself
 * doesn't meet the threshold (or the trajectory is empty), it's a loss regardless of any earlier
 * crossing — "held the lead, then lost it back" must not count as a win.
 */
export function computeWinResult(
  shareTrajectory: readonly number[],
  shareThreshold: number,
): { readonly won: boolean; readonly daysToWin: number | null } {
  if (shareTrajectory.length === 0) return { won: false, daysToWin: null };
  const lastDay = shareTrajectory.length - 1;
  if (!(shareTrajectory[lastDay]! >= shareThreshold)) return { won: false, daysToWin: null };

  let start = lastDay;
  for (let day = lastDay - 1; day >= 0; day--) {
    if (!(shareTrajectory[day]! >= shareThreshold)) break;
    start = day;
  }
  return { won: true, daysToWin: start };
}
```

- [x] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tools/sim-harness/metrics.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add tools/sim-harness/metrics.ts tools/sim-harness/metrics.test.ts
git commit -m "feat(harness): trip-share tracking and the win/days-to-win algorithm"
```

---

### Task 9: `run.ts` — single (level, strategy, seed) run

**Files:**
- Create: `tools/sim-harness/run.ts`
- Create: `tools/sim-harness/run.test.ts`

**Interfaces:**
- Consumes: `buildHarnessWorld` (Task 4), `strategyFor` (Task 7), `TripCounter`/
  `computeShareTrajectory`/`computeWinResult` (Task 8), `TICKS_PER_SIM_DAY`
  (`src/sim/index.js`).
- Produces:
  ```ts
  export interface RunResult {
    readonly seed: number;
    readonly won: boolean;
    readonly daysToWin: number | null;
    readonly totalEbitda: number;
    readonly shareTrajectory: readonly number[];
  }
  export function runOnce(
    level: number,
    strategyName: StrategyName,
    seed: number,
    days: number,
    config?: HarnessConfig,
  ): RunResult;
  ```
  Consumed by `sweep.ts` (Task 10).

- [x] **Step 1: Write the failing test**

Create `tools/sim-harness/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runOnce } from './run.js';

describe('runOnce', () => {
  it('produces a well-formed RunResult for a short do-nothing run', () => {
    const result = runOnce(1, 'do-nothing', 12345, 10);
    expect(result.seed).toBe(12345);
    expect(typeof result.won).toBe('boolean');
    expect(result.won ? typeof result.daysToWin === 'number' : result.daysToWin === null).toBe(true);
    expect(Number.isFinite(result.totalEbitda)).toBe(true);
    expect(result.shareTrajectory).toHaveLength(10);
  });

  it('is deterministic for the same seed', () => {
    const a = runOnce(2, 'random', 999, 5);
    const b = runOnce(2, 'random', 999, 5);
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = runOnce(2, 'random', 1, 5);
    const b = runOnce(2, 'random', 2, 5);
    expect(a.shareTrajectory).not.toEqual(b.shareTrajectory);
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/run.test.ts`
Expected: FAIL — `./run.js` does not exist yet.

- [x] **Step 3: Write `tools/sim-harness/run.ts`**

```ts
import { TICKS_PER_SIM_DAY } from '../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from './config.js';
import { computeShareTrajectory, computeWinResult, TripCounter } from './metrics.js';
import { strategyFor, type StrategyName } from './strategies/index.js';
import { buildHarnessWorld } from './world.js';

export interface RunResult {
  readonly seed: number;
  readonly won: boolean;
  readonly daysToWin: number | null;
  readonly totalEbitda: number;
  readonly shareTrajectory: readonly number[];
}

export function runOnce(
  level: number,
  strategyName: StrategyName,
  seed: number,
  days: number,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): RunResult {
  const harnessWorld = buildHarnessWorld(level, seed, config);
  const strategy = strategyFor(strategyName);
  const tripCounter = new TripCounter();
  const rng = harnessWorld.world.rng.get('harness');

  for (let day = 0; day < days; day++) {
    const commands = strategy.decide({
      world: harnessWorld.world,
      day,
      economy: harnessWorld.economy,
      checkout: harnessWorld.checkout,
      rng,
      config,
    });
    for (const command of commands) harnessWorld.world.commands.push(command);

    for (let tick = 0; tick < TICKS_PER_SIM_DAY; tick++) {
      harnessWorld.world.step();
      tripCounter.recordTick(harnessWorld.market.pendingOutcomes(), harnessWorld.targetStoreIndex);
    }
    tripCounter.closeDay();
  }

  const shareTrajectory = computeShareTrajectory(tripCounter.dailyCounts(), config.winCondition.trailingWindowDays);
  const { won, daysToWin } = computeWinResult(shareTrajectory, config.winCondition.shareThreshold);
  const totalEbitda = harnessWorld.economy.statements().reduce((sum, statement) => sum + statement.ebitda, 0);

  return { seed, won, daysToWin, totalEbitda, shareTrajectory };
}
```

- [x] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tools/sim-harness/run.test.ts`
Expected: PASS. (This test actually runs the sim for real — 10-50 sim-days — so it may take a
couple of seconds; that's expected, not a hang.)

- [x] **Step 5: Commit**

```bash
git add tools/sim-harness/run.ts tools/sim-harness/run.test.ts
git commit -m "feat(harness): single (level, strategy, seed) run wiring"
```

---

### Task 10: `sweep.ts` — the programmatic (level, strategy, runs, days) API

**Files:**
- Create: `tools/sim-harness/sweep.ts`
- Create: `tools/sim-harness/sweep.test.ts`

**Interfaces:**
- Consumes: `runOnce`/`RunResult` (Task 9).
- Produces:
  ```ts
  export interface LevelStrategyResult {
    readonly level: number;
    readonly strategy: StrategyName;
    readonly runs: readonly RunResult[];
    readonly winRate: number;
    readonly medianDaysToWin: number | null;
    readonly ebitda: { readonly mean: number; readonly p10: number; readonly p50: number; readonly p90: number };
    readonly meanShareTrajectory: readonly number[];
  }
  export function deriveRunSeed(baseSeed: number, runIndex: number): number;
  export function sweep(
    level: number,
    strategyName: StrategyName,
    runs: number,
    days: number,
    baseSeed: number,
    config?: HarnessConfig,
  ): LevelStrategyResult;
  ```
  Consumed by `cli.ts` (Task 11) and `gate.ts` (Task 12).

- [x] **Step 1: Write the failing test**

Create `tools/sim-harness/sweep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveRunSeed, sweep } from './sweep.js';

describe('deriveRunSeed', () => {
  it('is deterministic and varies by run index', () => {
    expect(deriveRunSeed(100, 0)).toBe(deriveRunSeed(100, 0));
    expect(deriveRunSeed(100, 0)).not.toBe(deriveRunSeed(100, 1));
  });
});

describe('sweep', () => {
  it('aggregates a short do-nothing sweep into a well-formed result', () => {
    const result = sweep(1, 'do-nothing', 3, 5, 42);
    expect(result.level).toBe(1);
    expect(result.strategy).toBe('do-nothing');
    expect(result.runs).toHaveLength(3);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.ebitda.p10).toBeLessThanOrEqual(result.ebitda.p50);
    expect(result.ebitda.p50).toBeLessThanOrEqual(result.ebitda.p90);
    expect(result.meanShareTrajectory).toHaveLength(5);
  });

  it('gives each of the three runs a distinct, reproducible seed', () => {
    const a = sweep(1, 'do-nothing', 3, 2, 7);
    const b = sweep(1, 'do-nothing', 3, 2, 7);
    expect(a.runs.map((r) => r.seed)).toEqual(b.runs.map((r) => r.seed));
    expect(new Set(a.runs.map((r) => r.seed)).size).toBe(3);
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/sweep.test.ts`
Expected: FAIL — `./sweep.js` does not exist yet.

- [x] **Step 3: Write `tools/sim-harness/sweep.ts`**

```ts
import { DEFAULT_HARNESS_CONFIG, type HarnessConfig } from './config.js';
import { runOnce, type RunResult } from './run.js';
import type { StrategyName } from './strategies/index.js';

export interface LevelStrategyResult {
  readonly level: number;
  readonly strategy: StrategyName;
  readonly runs: readonly RunResult[];
  readonly winRate: number;
  readonly medianDaysToWin: number | null;
  readonly ebitda: { readonly mean: number; readonly p10: number; readonly p50: number; readonly p90: number };
  readonly meanShareTrajectory: readonly number[];
}

/** Deterministic per-run seed derivation — XOR-folds the run index so nearby indices don't
 *  produce nearby seeds. */
export function deriveRunSeed(baseSeed: number, runIndex: number): number {
  return (baseSeed ^ Math.imul(runIndex + 1, 0x9e3779b1)) >>> 0;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index]!;
}

function median(sorted: readonly number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function sweep(
  level: number,
  strategyName: StrategyName,
  runs: number,
  days: number,
  baseSeed: number,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
): LevelStrategyResult {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) {
    results.push(runOnce(level, strategyName, deriveRunSeed(baseSeed, i), days, config));
  }

  const winRate = results.filter((r) => r.won).length / results.length;
  const daysToWinSorted = results
    .map((r) => r.daysToWin)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);
  const ebitdaSorted = results.map((r) => r.totalEbitda).sort((a, b) => a - b);

  const maxDays = Math.max(0, ...results.map((r) => r.shareTrajectory.length));
  const meanShareTrajectory: number[] = [];
  for (let day = 0; day < maxDays; day++) {
    const values = results
      .map((r) => r.shareTrajectory[day])
      .filter((v): v is number => v !== undefined && !Number.isNaN(v));
    meanShareTrajectory.push(values.length === 0 ? NaN : values.reduce((sum, v) => sum + v, 0) / values.length);
  }

  return {
    level,
    strategy: strategyName,
    runs: results,
    winRate,
    medianDaysToWin: median(daysToWinSorted),
    ebitda: {
      mean: ebitdaSorted.reduce((sum, v) => sum + v, 0) / ebitdaSorted.length,
      p10: percentile(ebitdaSorted, 0.1),
      p50: percentile(ebitdaSorted, 0.5),
      p90: percentile(ebitdaSorted, 0.9),
    },
    meanShareTrajectory,
  };
}
```

- [x] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tools/sim-harness/sweep.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add tools/sim-harness/sweep.ts tools/sim-harness/sweep.test.ts
git commit -m "feat(harness): sweep — the programmatic (level, strategy, runs, days) API"
```

---

### Task 11: `cli.ts` — `npm run harness`

**Files:**
- Create: `tools/sim-harness/cli.ts`
- Create: `tools/sim-harness/cli.test.ts`
- Create: `vite.harness.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `sweep`/`LevelStrategyResult` (Task 10), `STRATEGY_NAMES` (Task 5).
- Produces: `parseArgs`, `formatCsv`, `formatJson` (unit-tested directly); a built, runnable
  `dist/harness/cli.js`.

**Why a Vite config at all:** every existing `src/sim/systems/*/config.ts` imports its content via
`?raw` (a Vite-only import suffix — verified empirically during brainstorming that plain `node`
cannot resolve it, even with native TS execution). `tools/sim-harness/cli.ts` transitively imports
all of those through `src/sim/index.js`, so it must be bundled by Vite before `node` can run it.
This still adds zero new dependencies — `vite` is already a devDependency.

- [x] **Step 1: Write the failing unit tests** (for the pure pieces — arg parsing and formatting)

Create `tools/sim-harness/cli.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatCsv, formatJson, parseArgs } from './cli.js';
import type { LevelStrategyResult } from './sweep.js';

describe('parseArgs', () => {
  it('parses required and optional flags', () => {
    const args = parseArgs(['--level', '2', '--strategy', 'service', '--runs', '10', '--days', '30']);
    expect(args).toEqual({
      level: 2,
      strategy: 'service',
      runs: 10,
      days: 30,
      seed: 20260901,
      out: 'csv',
      outFile: null,
    });
  });

  it('throws on a missing required flag', () => {
    expect(() => parseArgs(['--strategy', 'service'])).toThrow(/--level/);
  });

  it('throws on an unknown strategy', () => {
    expect(() => parseArgs(['--level', '1', '--strategy', 'nonsense'])).toThrow(/Unknown strategy/);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--level', '1', '--strategy', 'random', '--bogus', '1'])).toThrow(/Unknown argument/);
  });
});

function fakeResult(): LevelStrategyResult {
  return {
    level: 1,
    strategy: 'do-nothing',
    runs: [
      { seed: 1, won: false, daysToWin: null, totalEbitda: -100, shareTrajectory: [0.1] },
      { seed: 2, won: true, daysToWin: 5, totalEbitda: 200, shareTrajectory: [0.6] },
    ],
    winRate: 0.5,
    medianDaysToWin: 5,
    ebitda: { mean: 50, p10: -100, p50: 50, p90: 200 },
    meanShareTrajectory: [0.35],
  };
}

describe('formatCsv', () => {
  it('writes one row per run plus a summary block', () => {
    const csv = formatCsv(fakeResult());
    expect(csv).toContain('seed,won,daysToWin,totalEbitda');
    expect(csv).toContain('1,false,,-100.00');
    expect(csv).toContain('2,true,5,200.00');
    expect(csv).toContain('winRate=0.500');
  });
});

describe('formatJson', () => {
  it('round-trips the full result', () => {
    const result = fakeResult();
    expect(JSON.parse(formatJson(result))).toEqual(result);
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/cli.test.ts`
Expected: FAIL — `./cli.js` does not exist yet.

- [x] **Step 3: Write `tools/sim-harness/cli.ts`**

```ts
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { STRATEGY_NAMES, type StrategyName } from './strategies/index.js';
import { sweep, type LevelStrategyResult } from './sweep.js';

const DEFAULT_BASE_SEED = 20260901;

export interface CliArgs {
  readonly level: number;
  readonly strategy: StrategyName;
  readonly runs: number;
  readonly days: number;
  readonly seed: number;
  readonly out: 'csv' | 'json';
  readonly outFile: string | null;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  let level: number | null = null;
  let strategy: StrategyName | null = null;
  let runs = 100;
  let days = 90;
  let seed = DEFAULT_BASE_SEED;
  let out: 'csv' | 'json' = 'csv';
  let outFile: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      i++;
      const value = argv[i];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      return value;
    };

    switch (flag) {
      case '--level':
        level = Number(next());
        break;
      case '--strategy': {
        const value = next();
        if (!(STRATEGY_NAMES as readonly string[]).includes(value)) {
          throw new Error(`Unknown strategy: ${value}`);
        }
        strategy = value as StrategyName;
        break;
      }
      case '--runs':
        runs = Number(next());
        break;
      case '--days':
        days = Number(next());
        break;
      case '--seed':
        seed = Number(next());
        break;
      case '--out': {
        const value = next();
        if (value !== 'csv' && value !== 'json') throw new Error(`--out must be csv or json, got ${value}`);
        out = value;
        break;
      }
      case '--out-file':
        outFile = next();
        break;
      default:
        throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (level === null) throw new Error('--level is required');
  if (strategy === null) throw new Error('--strategy is required');
  return { level, strategy, runs, days, seed, out, outFile };
}

export function formatCsv(result: LevelStrategyResult): string {
  const header = 'seed,won,daysToWin,totalEbitda';
  const rows = result.runs.map(
    (r) => `${r.seed},${r.won},${r.daysToWin ?? ''},${r.totalEbitda.toFixed(2)}`,
  );
  const summary = [
    '',
    `# level=${result.level} strategy=${result.strategy}`,
    `# winRate=${result.winRate.toFixed(3)}`,
    `# medianDaysToWin=${result.medianDaysToWin ?? 'n/a'}`,
    `# ebitdaMean=${result.ebitda.mean.toFixed(2)} p10=${result.ebitda.p10.toFixed(2)} p50=${result.ebitda.p50.toFixed(2)} p90=${result.ebitda.p90.toFixed(2)}`,
  ];
  return [header, ...rows, ...summary].join('\n');
}

export function formatJson(result: LevelStrategyResult): string {
  return JSON.stringify(result, null, 2);
}

export function main(argv: readonly string[]): void {
  const args = parseArgs(argv);
  const result = sweep(args.level, args.strategy, args.runs, args.days, args.seed);
  const output = args.out === 'csv' ? formatCsv(result) : formatJson(result);
  if (args.outFile) writeFileSync(args.outFile, output);
  else console.log(output);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2));
}
```

- [x] **Step 4: Run it, confirm the unit tests pass**

Run: `npx vitest run tools/sim-harness/cli.test.ts`
Expected: PASS.

- [x] **Step 5: Write `vite.harness.config.ts`**

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: true,
    outDir: 'dist/harness',
    emptyOutDir: true,
    rollupOptions: {
      input: { cli: 'tools/sim-harness/cli.ts' },
      output: { format: 'es', entryFileNames: '[name].js' },
    },
  },
});
```

- [x] **Step 6: Add `package.json` scripts**

Add alongside the existing `"harness"`-adjacent scripts (near `check:budget`):

```json
    "harness:build": "vite build --config vite.harness.config.ts",
    "harness": "npm run harness:build --silent && node dist/harness/cli.js",
```

- [x] **Step 7: Run the real CLI end to end, by hand, once**

Run: `npm run harness -- --level 1 --strategy do-nothing --runs 3 --days 5`
Expected: builds in a few seconds, then prints a CSV with 3 rows and a summary block — no
stack trace, no `ERR_UNKNOWN_FILE_EXTENSION`, no `ERR_MODULE_NOT_FOUND`. If it fails on either of
those two errors, the Vite SSR bundle isn't actually including the `?raw` content transform —
double check `build.ssr: true` is set and that `src/sim/index.js` is reached only through the
bundle (not re-imported some other way).

- [x] **Step 8: Write the failing automated integration test**

This is the "one end-to-end test running a short sweep through the real CLI/sweep.ts path" the
spec's testing section (§9) calls for — Step 7 proved it works once by hand; this is what keeps
it proven in CI. Create `tools/sim-harness/cli.integration.test.ts`:

```ts
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('harness CLI (integration)', () => {
  it(
    'builds and runs a short sweep end to end',
    () => {
      execFileSync('npx', ['vite', 'build', '--config', 'vite.harness.config.ts'], { stdio: 'pipe' });
      const output = execFileSync(
        'node',
        ['dist/harness/cli.js', '--level', '1', '--strategy', 'do-nothing', '--runs', '3', '--days', '5'],
        { encoding: 'utf-8' },
      );
      expect(output).toContain('seed,won,daysToWin,totalEbitda');
      expect(output).toContain('winRate=');
      const rows = output.split('\n').filter((line) => /^\d+,(true|false),/.test(line));
      expect(rows).toHaveLength(3);
    },
    30_000,
  );
});
```

- [x] **Step 9: Run it, confirm it fails, then confirm it passes**

Run: `npx vitest run tools/sim-harness/cli.integration.test.ts`
Expected: FAILs before `vite.harness.config.ts` exists (Step 5 hasn't run yet in a from-scratch
replay) or passes immediately if Steps 5-7 are already done in this same task — either way, run it
now and confirm it's green before moving on.

- [x] **Step 10: Commit**

```bash
git add tools/sim-harness/cli.ts tools/sim-harness/cli.test.ts tools/sim-harness/cli.integration.test.ts \
        vite.harness.config.ts package.json
git commit -m "feat(harness): npm run harness CLI, Vite SSR build pipeline

Bundled with Vite because every existing src/sim/systems/*/config.ts imports its
JSON5 content via Vite's ?raw suffix, which plain node cannot resolve even with
native TypeScript execution — verified empirically, not assumed. Zero new
runtime dependency: vite is already a devDependency."
```

---

### Task 12: `gate.ts` — `npm run balance:gate`

**Files:**
- Create: `tools/sim-harness/gate.ts`
- Create: `tools/sim-harness/gate.test.ts`
- Modify: `vite.harness.config.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `sweep`/`LevelStrategyResult` (Task 10), `STRATEGY_NAMES` (Task 5).
- Produces: `checkAcceptanceRule`, `checkMonotonicCl` (unit-tested directly with fabricated
  results, per the spec — no real sim run needed for these tests), `runGate`.

- [x] **Step 1: Write the failing tests**

Create `tools/sim-harness/gate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { checkAcceptanceRule, checkMonotonicCl } from './gate.js';
import type { LevelStrategyResult } from './sweep.js';
import type { StrategyName } from './strategies/index.js';

function result(strategy: StrategyName, level: number, winRate: number): LevelStrategyResult {
  return {
    level,
    strategy,
    runs: [],
    winRate,
    medianDaysToWin: null,
    ebitda: { mean: 0, p10: 0, p50: 0, p90: 0 },
    meanShareTrajectory: [],
  };
}

describe('checkAcceptanceRule', () => {
  it('passes when do-nothing/random lose and at least two coherent strategies land in 55-75%', () => {
    const results: LevelStrategyResult[] = [
      result('do-nothing', 1, 0.0),
      result('random', 1, 0.05),
      result('price-war', 1, 0.6),
      result('premium', 1, 0.65),
      result('service', 1, 0.4),
      result('layout-optimizer', 1, 0.3),
    ];
    expect(checkAcceptanceRule(results)).toEqual({ level: 1, passed: true, failures: [] });
  });

  it('fails when do-nothing wins too often', () => {
    const results: LevelStrategyResult[] = [
      result('do-nothing', 1, 0.5),
      result('random', 1, 0.05),
      result('price-war', 1, 0.6),
      result('premium', 1, 0.65),
      result('service', 1, 0.4),
      result('layout-optimizer', 1, 0.3),
    ];
    const check = checkAcceptanceRule(results);
    expect(check.passed).toBe(false);
    expect(check.failures.some((f) => f.includes('do-nothing'))).toBe(true);
  });

  it('fails when fewer than two coherent strategies land in range', () => {
    const results: LevelStrategyResult[] = [
      result('do-nothing', 1, 0.0),
      result('random', 1, 0.05),
      result('price-war', 1, 0.6),
      result('premium', 1, 0.9),
      result('service', 1, 0.9),
      result('layout-optimizer', 1, 0.9),
    ];
    const check = checkAcceptanceRule(results);
    expect(check.passed).toBe(false);
    expect(check.failures.some((f) => f.includes('coherent'))).toBe(true);
  });
});

describe('checkMonotonicCl', () => {
  it('passes when win rate never increases with level', () => {
    const byLevel = new Map<number, LevelStrategyResult[]>([
      [1, [result('service', 1, 0.7)]],
      [2, [result('service', 2, 0.6)]],
      [3, [result('service', 3, 0.6)]],
    ]);
    expect(checkMonotonicCl(byLevel, 'service')).toEqual([]);
  });

  it('fails when a higher level wins more than a lower one', () => {
    const byLevel = new Map<number, LevelStrategyResult[]>([
      [1, [result('service', 1, 0.5)]],
      [2, [result('service', 2, 0.7)]],
    ]);
    const failures = checkMonotonicCl(byLevel, 'service');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('service');
  });
});
```

- [x] **Step 2: Run it, confirm it fails**

Run: `npx vitest run tools/sim-harness/gate.test.ts`
Expected: FAIL — `./gate.js` does not exist yet.

- [x] **Step 3: Write `tools/sim-harness/gate.ts`**

```ts
import { pathToFileURL } from 'node:url';
import { STRATEGY_NAMES, type StrategyName } from './strategies/index.js';
import { sweep, type LevelStrategyResult } from './sweep.js';

export interface GateCheckResult {
  readonly level: number;
  readonly passed: boolean;
  readonly failures: readonly string[];
}

const COHERENT_STRATEGIES: readonly StrategyName[] = ['price-war', 'premium', 'service', 'layout-optimizer'];

export function checkAcceptanceRule(results: readonly LevelStrategyResult[]): GateCheckResult {
  const level = results[0]!.level;
  const failures: string[] = [];
  const byStrategy = new Map(results.map((r) => [r.strategy, r]));

  const doNothing = byStrategy.get('do-nothing')!;
  if (doNothing.winRate > 0.05) {
    failures.push(`do-nothing win rate ${doNothing.winRate.toFixed(3)} exceeds 0.05`);
  }

  const random = byStrategy.get('random')!;
  if (random.winRate > 0.1) {
    failures.push(`random win rate ${random.winRate.toFixed(3)} exceeds 0.10`);
  }

  const inRange = COHERENT_STRATEGIES.filter((name) => {
    const r = byStrategy.get(name)!;
    return r.winRate >= 0.55 && r.winRate <= 0.75;
  });
  if (inRange.length < 2) {
    failures.push(`only ${inRange.length} coherent strategies land in 55-75% win rate (need >= 2)`);
  }

  return { level, passed: failures.length === 0, failures };
}

export function checkMonotonicCl(
  resultsByLevel: ReadonlyMap<number, readonly LevelStrategyResult[]>,
  strategy: StrategyName,
): readonly string[] {
  const levels = [...resultsByLevel.keys()].sort((a, b) => a - b);
  const failures: string[] = [];
  for (let i = 1; i < levels.length; i++) {
    const prevLevel = levels[i - 1]!;
    const curLevel = levels[i]!;
    const prev = resultsByLevel.get(prevLevel)!.find((r) => r.strategy === strategy)!;
    const cur = resultsByLevel.get(curLevel)!.find((r) => r.strategy === strategy)!;
    if (cur.winRate > prev.winRate) {
      failures.push(
        `${strategy}: level ${curLevel} win rate ${cur.winRate.toFixed(3)} exceeds level ${prevLevel}'s ${prev.winRate.toFixed(3)}`,
      );
    }
  }
  return failures;
}

export function runGate(runs: number, days: number, baseSeed: number): void {
  const levels = [1, 2, 3];
  const resultsByLevel = new Map<number, LevelStrategyResult[]>();
  for (const level of levels) {
    resultsByLevel.set(
      level,
      STRATEGY_NAMES.map((strategy) => sweep(level, strategy, runs, days, baseSeed)),
    );
  }

  let allPassed = true;
  for (const level of levels) {
    const check = checkAcceptanceRule(resultsByLevel.get(level)!);
    console.log(`Level ${level}: ${check.passed ? 'PASS' : 'FAIL'}`);
    for (const failure of check.failures) console.log(`  - ${failure}`);
    if (!check.passed) allPassed = false;
  }

  for (const strategy of STRATEGY_NAMES) {
    const failures = checkMonotonicCl(resultsByLevel, strategy);
    if (failures.length > 0) {
      allPassed = false;
      console.log(`Monotonic-CL check FAILED for ${strategy}:`);
      for (const failure of failures) console.log(`  - ${failure}`);
    }
  }

  console.log(allPassed ? 'GATE: PASS' : 'GATE: FAIL');
  if (!allPassed) process.exitCode = 1;
}

const DEFAULT_GATE_RUNS = 100;
const DEFAULT_GATE_DAYS = 90;
const DEFAULT_GATE_SEED = 20260901;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGate(DEFAULT_GATE_RUNS, DEFAULT_GATE_DAYS, DEFAULT_GATE_SEED);
}
```

- [x] **Step 4: Run it, confirm it passes**

Run: `npx vitest run tools/sim-harness/gate.test.ts`
Expected: PASS.

- [x] **Step 5: Add the second Vite entry**

Modify `vite.harness.config.ts`'s `rollupOptions.input`:

```ts
      input: { cli: 'tools/sim-harness/cli.ts', gate: 'tools/sim-harness/gate.ts' },
```

- [x] **Step 6: Add the `package.json` script**

```json
    "balance:gate": "npm run harness:build --silent && node dist/harness/gate.js",
```

- [x] **Step 7: Run the real gate end to end**

Run: `npm run balance:gate`
Expected: builds, then runs all 3 levels × 6 strategies (18 sweeps at the small default
runs/days) and prints a PASS/FAIL table. **A FAIL here is an expected, honest outcome** — nothing
in `content/balance/*` has been tuned for this yet (spec §10: actual balance tuning is phase
5.4's job). What matters for this task is that it runs to completion, prints concrete numbers for
every level and every strategy, and exits non-zero on FAIL / zero on PASS — not that it currently
passes.

- [x] **Step 8: Commit**

```bash
git add tools/sim-harness/gate.ts tools/sim-harness/gate.test.ts vite.harness.config.ts package.json
git commit -m "feat(harness): npm run balance:gate — acceptance rule + monotonic-CL check

This is what actually closes PLAN.md's phase 2.0 gate ('harness win rates
decrease monotonically with CL rank') — a concrete PASS/FAIL table, not
something inferred by a human reading raw CSVs. Whether today's untuned
content/balance/* numbers pass it is a separate, expected-to-fail question for
the phase 5.4 balance pass."
```

---

### Task 13: Full verify, handoff, final commit

**Files:**
- Modify: `docs/handoff.md`

**Interfaces:** none — this task wires nothing new, it closes out the sub-project.

- [ ] **Step 1: Run the full verification suite**

Run: `npm run verify`
Expected: typecheck, lint, `check:tokens`, `check:content`, the full unit/golden test suite, and
the game build all pass. If lint flags anything in `tools/sim-harness/` (e.g. unused exports,
import ordering), fix it in place — don't disable the rule.

- [ ] **Step 2: Run the harness and gate once more for real numbers to record**

Run: `npm run balance:gate` (default runs/days — the same invocation as Task 12 Step 7). Note the
actual PASS/FAIL table output for the handoff update in Step 3.

- [ ] **Step 3: Update `docs/handoff.md`**

Add a new entry under "Now" (or wherever the current Rival Dynamics/Balance Harness section
lives), following the file's existing style — what landed, what's weird, what's next. Include:
the prerequisite reactivity fix and whether `rival-reaction` was re-baselined; the six strategies
and the one documented deviation (`random` drops the fixture-tweak action for crash-safety); the
actual `npm run balance:gate` PASS/FAIL table from Step 2, stated plainly (a FAIL is expected and
not a bug per Task 12's note); and that phase 2.0's monotonic-CL gate can now actually be
*checked*, even though passing it is phase 5.4's job.

Since `docs/handoff.md` is local-only and gitignored (per `CLAUDE.md`), this edit is not part of
the git commit in Step 4 — it's a working-directory file, not tracked history.

- [ ] **Step 4: Commit**

```bash
git status --short   # confirm only intentional files are staged — docs/handoff.md is gitignored
git add -A
git commit -m "chore(harness): balance harness sub-project complete

npm run harness and npm run balance:gate both exist and run end to end. Six
strategies, trip-share win condition, EBITDA distribution, and the acceptance-
rule + monotonic-CL gate check are all live. Whether today's content/balance/*
numbers actually pass that gate is phase 5.4's balance-tuning question, not
this sub-project's — see docs/superpowers/specs/2026-09-01-balance-harness-design.md §10."
```
