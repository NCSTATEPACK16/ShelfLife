# Gentle Surface (Phase 2.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this
> plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. No subagents — this project's
> established pattern for every prior phase.

**Goal:** Every declared tell in `content/design/gentle-surface.json5` (10 satisfaction + 5 impulse
terms) fires from a real sim signal and renders as a placeholder-art marker in `BuildScene`, closing
the gap `docs/handoff.md` flagged since phase 1.6.

**Architecture:** One new `tellFired` `SimEvent` variant, emitted by the systems that already (or
now newly) compute each term's magnitude, gated by a threshold loaded once from
`content/design/gentle-surface.json5`. Seven terms (`cleanlinessLow`, `staffInteractionGood/Absent`,
`visibility`, `adjacencyBonus`, `promoLift`, `needState`) get minimal new sim mechanics that reuse
existing infrastructure (`CheckoutSystem.cleanliness()`, `StaffMember.morale`,
`InventorySystem.stockOf`, `EconomySystem`'s promotions, a new `category` field on goods, the
existing `family` segment). A pure `tell-draw-plan.ts` (same convention as `shopper-draw-plan.ts`)
turns drained `tellFired` events into rate-limited, one-per-shopper markers; `BuildScene` renders
them as placeholder tokens, poses, and world marks. No Track B / 16-bit art involvement.

**Tech Stack:** TypeScript, Zod content schemas, JSON5 (`?raw` + `json5` package), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-gentle-surface-design.md`

## Global Constraints

- `src/sim/**` imports nothing from Phaser/DOM/window (CLAUDE.md). No `Math.random`/`Date.now` in
  `src/sim` — any new randomness (none needed this phase) must use `world.rng.get(<stream>)`.
- Events are output-only: computing a tell's magnitude must never change what a system does next.
- Golden hashes for scenarios exercising checkout/cleanliness/staff WILL move once `w5`/`w6`
  satisfaction terms go live — expected, re-baseline in its own commit per CLAUDE.md, after
  confirming unrelated scenarios are byte-identical.
- Testing discipline during execution: after each task, run only `npx tsc --noEmit` plus the
  task's own new/changed `*.test.ts` file(s) via `npx vitest run <path>`. Reserve full
  `npm run verify` and `npm run test:e2e` for the phase gate (last task).
- Every commit ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
  ```

---

### Task 1: Gentle-surface content loader

**Files:**
- Create: `src/sim/content/gentle-surface.ts`
- Test: `src/sim/content/gentle-surface.test.ts`

**Interfaces:**
- Produces: `TELL_TERMS` (readonly array of all 15 term ids), `TellTerm` (union type),
  `GentleSurfaceContent` (`ReadonlyMap<TellTerm, TellDef>`), `TellDef` (`{ term, bubble, animation,
  particle, worldMark, threshold }`), `parseGentleSurfaceContent(raw: unknown):
  GentleSurfaceContent`, `DEFAULT_GENTLE_SURFACE_CONTENT`, `thresholdFor(content, term): number`.
  Every later task that emits a `tellFired` event imports `TellTerm` and
  `DEFAULT_GENTLE_SURFACE_CONTENT`/`thresholdFor` from this file.

- [ ] **Step 1: Write the failing test**

```ts
// src/sim/content/gentle-surface.test.ts
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENTLE_SURFACE_CONTENT,
  parseGentleSurfaceContent,
  TELL_TERMS,
  thresholdFor,
} from './gentle-surface.js';

describe('parseGentleSurfaceContent', () => {
  it('loads all 15 declared terms from content/design/gentle-surface.json5', () => {
    expect(DEFAULT_GENTLE_SURFACE_CONTENT.size).toBe(15);
    for (const term of TELL_TERMS) {
      expect(DEFAULT_GENTLE_SURFACE_CONTENT.has(term)).toBe(true);
    }
  });

  it('exposes threshold lookup', () => {
    expect(thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'spoiledEncounters')).toBe(0);
    expect(thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'queuePenaltyBalk')).toBe(0.7);
  });

  it('throws if a required term is missing', () => {
    expect(() =>
      parseGentleSurfaceContent({
        satisfaction: [],
        impulse: [],
      }),
    ).toThrow(/Missing gentle-surface tell/);
  });

  it('throws on an unknown term id', () => {
    expect(() =>
      parseGentleSurfaceContent({
        satisfaction: [
          { term: 'bogus', bubble: 'x', animation: null, particle: null, worldMark: false, threshold: 0 },
        ],
        impulse: [],
      }),
    ).toThrow(/Unknown gentle-surface term/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/content/gentle-surface.test.ts`
Expected: FAIL — `./gentle-surface.js` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/sim/content/gentle-surface.ts
import JSON5 from 'json5';
import { z } from 'zod';
import raw from '../../../content/design/gentle-surface.json5?raw';

export const SATISFACTION_TELL_TERMS = [
  'fillRateMiss',
  'priceSurpriseNegative',
  'priceSurprisePositive',
  'queuePenaltyRising',
  'queuePenaltyBalk',
  'spoiledEncounters',
  'cleanlinessLow',
  'staffInteractionGood',
  'staffInteractionAbsent',
  'discovery',
] as const;

export const IMPULSE_TELL_TERMS = ['impulsePurchase', 'visibility', 'adjacencyBonus', 'promoLift', 'needState'] as const;

export const TELL_TERMS = [...SATISFACTION_TELL_TERMS, ...IMPULSE_TELL_TERMS] as const;
export type TellTerm = (typeof TELL_TERMS)[number];

export interface TellDef {
  readonly term: TellTerm;
  readonly bubble: string | null;
  readonly animation: string | null;
  readonly particle: string | null;
  readonly worldMark: boolean;
  readonly threshold: number;
}

const TellDefSchema = z.object({
  term: z.string().min(1),
  bubble: z.string().min(1).nullable(),
  animation: z.string().min(1).nullable(),
  particle: z.string().min(1).nullable(),
  worldMark: z.boolean(),
  threshold: z.number().min(0),
});

const GentleSurfaceSchema = z.object({
  satisfaction: z.array(TellDefSchema),
  impulse: z.array(TellDefSchema),
});

export type GentleSurfaceContent = ReadonlyMap<TellTerm, TellDef>;

const TERM_SET = new Set<string>(TELL_TERMS);

export function parseGentleSurfaceContent(raw: unknown): GentleSurfaceContent {
  const parsed = GentleSurfaceSchema.parse(raw);
  const map = new Map<TellTerm, TellDef>();
  for (const def of [...parsed.satisfaction, ...parsed.impulse]) {
    if (!TERM_SET.has(def.term)) throw new Error(`Unknown gentle-surface term: ${def.term}`);
    map.set(def.term as TellTerm, def as TellDef);
  }
  for (const term of TELL_TERMS) {
    if (!map.has(term)) throw new Error(`Missing gentle-surface tell: ${term}`);
  }
  return map;
}

export const DEFAULT_GENTLE_SURFACE_CONTENT: GentleSurfaceContent = parseGentleSurfaceContent(JSON5.parse(raw));

export function thresholdFor(content: GentleSurfaceContent, term: TellTerm): number {
  return content.get(term)!.threshold;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/content/gentle-surface.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/content/gentle-surface.ts src/sim/content/gentle-surface.test.ts
git commit -m "$(cat <<'EOF'
feat(content): gentle-surface tell loader

Zod-validated loader for content/design/gentle-surface.json5, same
?raw + JSON5 pattern every content/balance/* loader already uses.
Exposes TellTerm, threshold lookup, and the full 15-term table every
tellFired emitter in this phase reads from.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 2: `tellFired` SimEvent variant

**Files:**
- Modify: `src/sim/core/events.ts:19-70` (the `SimEvent` union)

**Interfaces:**
- Consumes: `TellTerm` from `../content/gentle-surface.js` (Task 1).
- Produces: `SimEvent`'s `'tellFired'` variant — `{ type: 'tellFired', shopperId: number, term:
  TellTerm, magnitude: number, worldRef?: { instanceId: number } }`. Every later emitting task
  constructs this exact shape.

- [ ] **Step 1: Add the import and union member**

In `src/sim/core/events.ts`, add after the existing imports (top of file, after the doc comment,
before `export type SimEvent`):

```ts
import type { TellTerm } from '../content/gentle-surface.js';
```

Add a new member to the `SimEvent` union, after the `levelWon`/`levelLost` members (end of the
union, before the closing `;`):

```ts
  | { readonly type: 'levelWon'; readonly levelId: string }
  | { readonly type: 'levelLost'; readonly levelId: string }
  | {
      readonly type: 'tellFired';
      readonly shopperId: number;
      readonly term: TellTerm;
      readonly magnitude: number;
      readonly worldRef?: { readonly instanceId: number };
    };
```

(Remove the trailing `;` that was previously on the `levelLost` line — only the last member of the
union ends the statement.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS — no existing code pattern-matches exhaustively on `SimEvent['type']` today (verify
with a quick check: `grep -rn "event.type ===" src/` should show no switch that would need a new
case; if one exists, add a no-op case there too before committing).

- [ ] **Step 3: Commit**

```bash
git add src/sim/core/events.ts
git commit -m "$(cat <<'EOF'
feat(sim): add tellFired SimEvent variant

One event type for all 15 gentle-surface terms rather than growing the
union 15 cases — producers tag shopperId/term/magnitude/worldRef, the
view layer looks up bubble/animation/particle/worldMark by term from
the content table (Task 1). EventBus holds no persisted state, so this
alone changes no golden hash.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 3: `category` field on goods + adjacency combo table

**Files:**
- Modify: `content/goods/catalog.json` (add `category` to each of the 4 goods)
- Modify: `src/sim/systems/goods/types.ts` (`GoodDef` gains `category`)
- Modify: `src/sim/systems/goods/catalog.ts` (`GoodDefSchema` gains `category`)
- Modify: `content/balance/market.json5` (add `adjacencyCombos`)
- Modify: `src/sim/systems/market/config.ts:114-150` (`MarketConfigSchema` gains
  `adjacencyCombos`)
- Test: `src/sim/systems/goods/catalog.test.ts` (new), `src/sim/systems/market/config.test.ts`
  (append)

**Interfaces:**
- Produces: `GoodDef.category: string`; `MarketConfig.adjacencyCombos: readonly (readonly [string,
  string])[]`; a helper `isAdjacencyCombo(config: MarketConfig, categoryA: string, categoryB:
  string): boolean` exported from `market/config.ts`. Task 15 (`#rollImpulse`'s adjacency check)
  consumes both.

- [ ] **Step 1: Update content**

`content/goods/catalog.json` — add `"category"` to each entry:

```json
[
  { "id": "milk", "name": "Milk", "unitPrice": 3.49, "cost": 2.20, "depletionPerDay": 0.15, "reorderThreshold": 0.3, "impulseBase": 0.05, "category": "dairy" },
  { "id": "bread", "name": "Bread", "unitPrice": 2.99, "cost": 1.60, "depletionPerDay": 0.2, "reorderThreshold": 0.3, "impulseBase": 0.05, "category": "bakery" },
  { "id": "eggs", "name": "Eggs", "unitPrice": 4.29, "cost": 2.80, "depletionPerDay": 0.1, "reorderThreshold": 0.3, "impulseBase": 0.05, "category": "dairy" },
  { "id": "snacks", "name": "Snacks", "unitPrice": 3.99, "cost": 1.90, "depletionPerDay": 0.08, "reorderThreshold": 0.25, "impulseBase": 0.2, "category": "snacks" }
]
```

`content/balance/market.json5` — add before the closing `}`, after `rivalSatisfactionWeights`:

```js5
  // --- adjacency (§5.4's adjacencyBonus) ---------------------------------------
  // Category pairs that combo for a gold "!" impulse tell when both are stocked within
  // exposureRadius of each other. Deliberately short — §12.1's own note: "rare enough to
  // feel like a discovery."
  adjacencyCombos: [
    ['dairy', 'bakery'],
  ],
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/sim/systems/goods/catalog.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_GOODS_CATALOG, parseGoodsCatalog } from './catalog.js';

describe('parseGoodsCatalog', () => {
  it('requires a category on every good', () => {
    expect(() =>
      parseGoodsCatalog([
        { id: 'x', name: 'X', unitPrice: 1, cost: 1, depletionPerDay: 0.1, reorderThreshold: 0.1, impulseBase: 0.1 },
      ]),
    ).toThrow();
  });

  it('loads categories for every default good', () => {
    for (const good of DEFAULT_GOODS_CATALOG) {
      expect(typeof good.category).toBe('string');
      expect(good.category.length).toBeGreaterThan(0);
    }
  });
});
```

Append to `src/sim/systems/market/config.test.ts`:

```ts
import { DEFAULT_MARKET_CONFIG, isAdjacencyCombo } from './config.js';

describe('adjacencyCombos', () => {
  it('recognizes an authored combo in either order', () => {
    expect(isAdjacencyCombo(DEFAULT_MARKET_CONFIG, 'dairy', 'bakery')).toBe(true);
    expect(isAdjacencyCombo(DEFAULT_MARKET_CONFIG, 'bakery', 'dairy')).toBe(true);
  });

  it('rejects an unauthored pair', () => {
    expect(isAdjacencyCombo(DEFAULT_MARKET_CONFIG, 'dairy', 'snacks')).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/sim/systems/goods/catalog.test.ts src/sim/systems/market/config.test.ts`
Expected: FAIL — `category` not in schema, `isAdjacencyCombo` not exported.

- [ ] **Step 4: Implement**

`src/sim/systems/goods/types.ts` — add after `impulseBase`:

```ts
  /** Category tag for §5.4's adjacencyBonus combo check (e.g. 'dairy', 'bakery'). */
  readonly category: string;
```

`src/sim/systems/goods/catalog.ts` — add to `GoodDefSchema`:

```ts
  category: z.string().min(1),
```

`src/sim/systems/market/config.ts` — add to `MarketConfigSchema` (inside the existing `z.object({
... })` around line 114-130, alongside `playerAmbiance` etc.):

```ts
    adjacencyCombos: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
```

Add after `DEFAULT_MARKET_CONFIG`'s declaration:

```ts
export function isAdjacencyCombo(config: MarketConfig, categoryA: string, categoryB: string): boolean {
  return config.adjacencyCombos.some(
    ([a, b]) => (a === categoryA && b === categoryB) || (a === categoryB && b === categoryA),
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/sim/systems/goods/catalog.test.ts src/sim/systems/market/config.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck, run full goods/market suites, and commit**

Run: `npx tsc --noEmit && npx vitest run src/sim/systems/goods src/sim/systems/market`

```bash
git add content/goods/catalog.json content/balance/market.json5 \
  src/sim/systems/goods/types.ts src/sim/systems/goods/catalog.ts src/sim/systems/goods/catalog.test.ts \
  src/sim/systems/market/config.ts src/sim/systems/market/config.test.ts
git commit -m "$(cat <<'EOF'
feat(content): good categories + adjacency combo table

Adds a category field to the 4-good catalog (dairy/bakery/snacks) and
an authored combo list in market.json5 (dairy+bakery), consumed by
#rollImpulse's adjacencyBonus tag later in this plan. No behavior
change yet — nothing reads these fields until Task 15.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 4: Staff-interaction and cleanliness balance constants

**Files:**
- Modify: `content/balance/staffing.json5` (add `staffInteractionMoraleThreshold`)
- Modify: `src/sim/systems/checkout/config.ts` (`StaffingConfigSchema` gains it)
- Modify: `content/balance/shoppers.json5` (add `cleanlinessWeight`, `staffInteractionWeight`)
- Modify: `src/sim/systems/shoppers/config.ts` (`ShoppersConfigSchema` gains them)
- Test: `src/sim/systems/checkout/config.test.ts`, `src/sim/systems/shoppers/config.test.ts`
  (append to each if they exist, else create following the pattern in Task 3's `catalog.test.ts`)

**Interfaces:**
- Produces: `StaffingConfig.staffInteractionMoraleThreshold: number`;
  `ShoppersConfig.cleanlinessWeight: number`; `ShoppersConfig.staffInteractionWeight: number`.
  Task 7 and Task 12 read these.

- [ ] **Step 1: Update content**

`content/balance/staffing.json5` — add before the closing `}`:

```js5
  // §5.3's staffInteraction tell threshold — a staffed lane's assigned cashier needs at
  // least this much morale for the interaction to read as "good" rather than absent.
  staffInteractionMoraleThreshold: 0.5,
```

`content/balance/shoppers.json5` — add after `queuePenaltyWeight`:

```js5
  // §5.3's w6 — CheckoutSystem.cleanliness() already decays/restores live; this is the
  // first satisfaction term to actually read it.
  cleanlinessWeight: 0.15,
  // §5.3's w5 — a good staff interaction adds to satisfaction, an absent one is neutral
  // (§12.1: "nobody helped me reads as confusion, not anger" — no penalty, just no bonus).
  staffInteractionWeight: 0.1,
```

- [ ] **Step 2: Write the failing tests**

If `src/sim/systems/checkout/config.test.ts` doesn't exist yet, create it:

```ts
// src/sim/systems/checkout/config.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_STAFFING_CONFIG, parseStaffingConfig } from './config.js';

describe('parseStaffingConfig', () => {
  it('loads staffInteractionMoraleThreshold from content', () => {
    expect(DEFAULT_STAFFING_CONFIG.staffInteractionMoraleThreshold).toBeGreaterThan(0);
    expect(DEFAULT_STAFFING_CONFIG.staffInteractionMoraleThreshold).toBeLessThanOrEqual(1);
  });

  it('requires staffInteractionMoraleThreshold', () => {
    const { staffInteractionMoraleThreshold: _omit, ...rest } = DEFAULT_STAFFING_CONFIG;
    expect(() => parseStaffingConfig(rest)).toThrow();
  });
});
```

If `src/sim/systems/shoppers/config.test.ts` doesn't exist yet, create it:

```ts
// src/sim/systems/shoppers/config.test.ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_SHOPPERS_CONFIG, parseShoppersConfig } from './config.js';

describe('parseShoppersConfig', () => {
  it('loads cleanlinessWeight and staffInteractionWeight from content', () => {
    expect(DEFAULT_SHOPPERS_CONFIG.cleanlinessWeight).toBeGreaterThan(0);
    expect(DEFAULT_SHOPPERS_CONFIG.staffInteractionWeight).toBeGreaterThan(0);
  });

  it('requires both new weights', () => {
    const { cleanlinessWeight: _a, ...rest } = DEFAULT_SHOPPERS_CONFIG;
    expect(() => parseShoppersConfig(rest)).toThrow();
  });
});
```

(If either file already exists with other tests, append these `describe` blocks rather than
overwriting the file.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/sim/systems/checkout/config.test.ts src/sim/systems/shoppers/config.test.ts`
Expected: FAIL — fields not in schema yet.

- [ ] **Step 4: Implement**

`src/sim/systems/checkout/config.ts` — add to `StaffingConfigSchema`'s object (before the
`.refine(...)` call):

```ts
    staffInteractionMoraleThreshold: z.number().min(0).max(1),
```

`src/sim/systems/shoppers/config.ts` — add to `ShoppersConfigSchema`:

```ts
  cleanlinessWeight: z.number().nonnegative(),
  staffInteractionWeight: z.number().nonnegative(),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/sim/systems/checkout/config.test.ts src/sim/systems/shoppers/config.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck, run full checkout/shoppers config suites, and commit**

Run: `npx tsc --noEmit && npx vitest run src/sim/systems/checkout src/sim/systems/shoppers`
(Existing `checkout`/`shoppers` tests must still pass — `hireStaff` command tests construct
`StaffMember` objects directly, not through this schema, so they're unaffected; confirm in output.)

```bash
git add content/balance/staffing.json5 content/balance/shoppers.json5 \
  src/sim/systems/checkout/config.ts src/sim/systems/checkout/config.test.ts \
  src/sim/systems/shoppers/config.ts src/sim/systems/shoppers/config.test.ts
git commit -m "$(cat <<'EOF'
feat(content): staff-interaction and cleanliness balance constants

New content/balance constants for the two satisfaction terms (w5, w6)
that have never had a weight: staffInteractionMoraleThreshold
(staffing.json5) and cleanlinessWeight/staffInteractionWeight
(shoppers.json5). No behavior change yet — Task 12 is the first
consumer.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 5: `CheckoutSystem.staffMoraleOnLane` accessor

**Files:**
- Modify: `src/sim/systems/checkout/system.ts:203-205` (add method after `cleanliness()`)
- Modify: `src/sim/systems/checkout/system.test.ts` (append)

**Interfaces:**
- Consumes: `#staff: Map<number, StaffMember>`, `#lanes: Map<number, Lane>` (both existing private
  fields).
- Produces: `CheckoutSystem#staffMoraleOnLane(laneId: number): number | null` — `null` for
  self-checkout or an unassigned register lane, otherwise the assigned staff member's `morale`.
  Task 12 (`ShoppersSystem`) consumes this.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/checkout/system.test.ts`:

```ts
describe('staffMoraleOnLane', () => {
  it('returns the assigned staff member\'s morale', () => {
    const { system, world, laneId } = buildStaffedLane({ morale: 0.7 }); // use this file's existing setup helper/pattern
    expect(system.staffMoraleOnLane(laneId)).toBeCloseTo(0.7);
  });

  it('returns null for a self-checkout lane', () => {
    const { system, selfCheckoutLaneId } = buildSelfCheckoutLane(); // existing helper/pattern
    expect(system.staffMoraleOnLane(selfCheckoutLaneId)).toBeNull();
  });

  it('returns null for an unassigned register lane', () => {
    const { system, unassignedLaneId } = buildUnassignedRegisterLane(); // existing helper/pattern
    expect(system.staffMoraleOnLane(unassignedLaneId)).toBeNull();
  });
});
```

Read `src/sim/systems/checkout/system.test.ts` first and use its actual existing setup
helpers/fixtures for building a world with a staffed register, a self-checkout, and an unassigned
register (the file already has these three scenarios from the phase 1.8 plan — reuse them rather
than inventing new fixture-building code; only add the three `it()` blocks and whatever local
`const laneId = ...` wiring each needs, matching the file's existing style).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/checkout/system.test.ts -t staffMoraleOnLane`
Expected: FAIL — `staffMoraleOnLane` is not a function.

- [ ] **Step 3: Implement**

In `src/sim/systems/checkout/system.ts`, add after the `cleanliness()` method (currently lines
203-205):

```ts
  /** The assigned staff member's morale for a staffed register lane; null otherwise (self-checkout
   *  or unassigned). Feeds §5.3's staffInteraction tell. */
  staffMoraleOnLane(laneId: number): number | null {
    const lane = this.#lanes.get(laneId);
    if (!lane || lane.isSelfCheckout || lane.staffId === null) return null;
    return this.#staff.get(lane.staffId)?.morale ?? null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/checkout/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/checkout/system.ts src/sim/systems/checkout/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): CheckoutSystem.staffMoraleOnLane accessor

Read-only accessor for a staffed lane's assigned cashier's morale —
null for self-checkout or an unassigned register. Feeds the
staffInteractionGood/Absent tell in ShoppersSystem (Task 12).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 6: `EconomySystem.isPromoted` accessor

**Files:**
- Modify: `src/sim/systems/economy/system.ts:123-126` (add after `isLossLeader`)
- Modify: `src/sim/systems/economy/system.test.ts` (append)

**Interfaces:**
- Produces: `EconomySystem#isPromoted(goodId: string, tick: number): boolean`. Task 15
  (`#rollImpulse`) consumes this.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/economy/system.test.ts`:

```ts
describe('isPromoted', () => {
  it('is true while a startPromotion command is active', () => {
    const { world, economy } = buildEconomyWorld(); // use this file's existing setup helper
    world.apply({ type: 'startPromotion', goodId: 'milk', discountFraction: 0.2, durationTicks: 100 });
    expect(economy.isPromoted('milk', world.tick)).toBe(true);
  });

  it('is false once the promotion has expired', () => {
    const { world, economy } = buildEconomyWorld();
    world.apply({ type: 'startPromotion', goodId: 'milk', discountFraction: 0.2, durationTicks: 1 });
    world.step();
    world.step();
    expect(economy.isPromoted('milk', world.tick)).toBe(false);
  });

  it('is false for a good with no promotion', () => {
    const { world, economy } = buildEconomyWorld();
    expect(economy.isPromoted('bread', world.tick)).toBe(false);
  });
});
```

Read `src/sim/systems/economy/system.test.ts` first and use its actual existing world-building
helper (the file already exercises `startPromotion` for `priceOf`'s discount behavior — reuse that
setup rather than inventing new fixture code).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/economy/system.test.ts -t isPromoted`
Expected: FAIL — `isPromoted` is not a function.

- [ ] **Step 3: Implement**

In `src/sim/systems/economy/system.ts`, add after `isLossLeader` (currently lines 123-126):

```ts
  isPromoted(goodId: string, tick: number): boolean {
    const promo = this.#promotions.get(goodId);
    return promo !== undefined && tick < promo.endsAtTick;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/economy/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/economy/system.ts src/sim/systems/economy/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): EconomySystem.isPromoted accessor

Read-only check for whether a good has an active promotion right now
— reuses the same #promotions/endsAtTick state priceOf() already
reads. Feeds #rollImpulse's promoLift tag (Task 15).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 7: `InventorySystem.capacityOf` accessor

**Files:**
- Modify: `src/sim/systems/inventory/system.ts:92-95` (add after `stockOf`)
- Modify: `src/sim/systems/inventory/system.test.ts` (append)

**Interfaces:**
- Produces: `InventorySystem#capacityOf(goodId: string): number` — the policy's `orderUpToLevel`
  (0 if the good has no policy). Task 18 (view: shelf fullness) consumes this via a new bridge
  accessor.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/inventory/system.test.ts`:

```ts
describe('capacityOf', () => {
  it("returns the good's orderUpToLevel from its supply policy", () => {
    const system = new InventorySystem(); // DEFAULT_SUPPLY_POLICIES: milk's orderUpToLevel is 24
    expect(system.capacityOf('milk')).toBe(24);
  });

  it('returns 0 for a good with no policy', () => {
    const system = new InventorySystem();
    expect(system.capacityOf('nonexistent-good')).toBe(0);
  });
});
```

Check the file's existing imports/construction pattern for `InventorySystem` first and match it
(the file already constructs `new InventorySystem()` with defaults for other tests — reuse that
same zero-arg pattern rather than a bespoke policy list, since `DEFAULT_SUPPLY_POLICIES` already
includes milk at `orderUpToLevel: 24` per `content/inventory/policy.json`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/inventory/system.test.ts -t capacityOf`
Expected: FAIL — `capacityOf` is not a function.

- [ ] **Step 3: Implement**

In `src/sim/systems/inventory/system.ts`, add after `stockOf` (currently lines 92-95). This needs
the policy lookup the constructor already builds — check the constructor body for the private
field name holding parsed policies (e.g. `#policiesById` or similar) and reuse it; if the
constructor only keeps `readonly SupplyPolicy[]` without an id-indexed map, add one:

```ts
  capacityOf(goodId: string): number {
    return this.#policiesById.get(goodId)?.orderUpToLevel ?? 0;
  }
```

(If the constructor doesn't already build `#policiesById`, add
`readonly #policiesById: ReadonlyMap<string, SupplyPolicy>;` as a field and
`this.#policiesById = new Map(policies.map((p) => [p.goodId, p]));` in the constructor body,
importing `SupplyPolicy` from `./types.js` if not already imported.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/inventory/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/inventory/system.ts src/sim/systems/inventory/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): InventorySystem.capacityOf accessor

Exposes a good's orderUpToLevel (S) as its shelf-fullness denominator
— feeds the visibility world-mark tell's full/half/empty
classification in the view layer (Task 18).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 8: `ShoppersSystem.stockedGoodAt` accessor

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts:176-178` (add after `activeShopperIds`)
- Modify: `src/sim/systems/shoppers/system.test.ts` (append)

**Interfaces:**
- Consumes: `#stocking: Map<number, string>` (existing private field).
- Produces: `ShoppersSystem#stockedGoodAt(instanceId: number): string | null`. Task 18 (bridge +
  view) consumes this.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/shoppers/system.test.ts`:

```ts
describe('stockedGoodAt', () => {
  it('returns the good stocked at a fixture instance', () => {
    const { system, world, instanceId } = buildStockedShopperWorld(); // this file's existing stockFixture setup
    world.apply({ type: 'stockFixture', instanceId, goodId: 'milk' });
    expect(system.stockedGoodAt(instanceId)).toBe('milk');
  });

  it('returns null for an unstocked instance', () => {
    const { system } = buildStockedShopperWorld();
    expect(system.stockedGoodAt(999999)).toBeNull();
  });
});
```

Read `src/sim/systems/shoppers/system.test.ts` first and reuse its existing `stockFixture`
world-setup helper (the file already builds worlds that call `stockFixture` for other tests).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts -t stockedGoodAt`
Expected: FAIL — `stockedGoodAt` is not a function.

- [ ] **Step 3: Implement**

In `src/sim/systems/shoppers/system.ts`, add after `activeShopperIds()` (currently lines 176-178):

```ts
  /** The good stocked at a fixture instance, or null if unstocked. Render-only accessor —
   *  feeds the visibility world-mark tell (shelf full/half/empty). */
  stockedGoodAt(instanceId: number): string | null {
    return this.#stocking.get(instanceId) ?? null;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): ShoppersSystem.stockedGoodAt accessor

The one-line unlock docs/handoff.md already flagged: #stocking was
private with no accessor, so the renderer couldn't map a shelf
instance to what it's stocked with. Feeds the visibility world-mark
tell (Task 18).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 9: `Shopper` gains two per-trip tell-tracking fields

**Files:**
- Modify: `src/sim/systems/shoppers/types.ts:5-32` (`Shopper` interface)
- Modify: `src/sim/systems/shoppers/system.ts:127-163` (`applyCommand`'s `spawnShopper` case),
  `:91-125` (`hash`)
- Modify: `src/sim/systems/shoppers/system.test.ts` (append)

**Interfaces:**
- Produces: `Shopper.staffInteractionGood: boolean | null` (null = not yet determined this trip;
  set once at checkout queue-join), `Shopper.queuePenaltyRisingFired: boolean` (has the live
  mid-trip `queuePenaltyRising` tell already fired this trip). Tasks 12 and 13 set/read these.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/shoppers/system.test.ts`:

```ts
describe('spawnShopper initial tell-tracking state', () => {
  it('starts a new shopper with staffInteractionGood null and queuePenaltyRisingFired false', () => {
    const { system, shopperId } = spawnOneShopper(); // this file's existing spawnShopper setup helper
    const shopper = system.shopper(shopperId);
    expect(shopper.staffInteractionGood).toBeNull();
    expect(shopper.queuePenaltyRisingFired).toBe(false);
  });
});
```

Reuse this file's existing `spawnShopper` setup helper/pattern.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts -t "initial tell-tracking"`
Expected: FAIL — properties are `undefined`, not `null`/`false` (TypeScript wouldn't catch this at
the object-literal call site yet since the interface doesn't require them).

- [ ] **Step 3: Implement**

`src/sim/systems/shoppers/types.ts` — add to the `Shopper` interface, after `priceSurpriseSum`:

```ts
  /** Set once, the moment this trip's checkout queue is joined (Task 12) — null until then. */
  readonly staffInteractionGood: boolean | null;
  /** Whether the live mid-trip queuePenaltyRising tell has already fired this trip (Task 13),
   *  so it fires once per trip, not once per tick above threshold. */
  readonly queuePenaltyRisingFired: boolean;
```

`src/sim/systems/shoppers/system.ts` — in `applyCommand`'s `spawnShopper` case (currently lines
127-163), add to the object literal, after `priceSurpriseSum: 0,`:

```ts
          staffInteractionGood: null,
          queuePenaltyRisingFired: false,
```

In `hash()` (currently lines 91-125), add to the per-shopper hasher chain, after `.f64(shopper.priceSurpriseSum)`:

```ts
        .bool(shopper.staffInteractionGood ?? false)
        .bool(shopper.staffInteractionGood !== null) // distinguishes null from false
        .bool(shopper.queuePenaltyRisingFired)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/shoppers/types.ts src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): Shopper gains per-trip tell-tracking fields

staffInteractionGood (set once at checkout queue-join) and
queuePenaltyRisingFired (so the live mid-trip tell fires once per
trip, not once per tick above threshold). Both hashed. No satisfaction
or tellFired behavior yet — Tasks 12/13 are the consumers. This alone
changes the shoppers-system hash shape, so any golden scenario with an
active shopper mid-trip will move (re-baselined in Task 20, not here).
EOF
)"
```

Note: this task's commit is expected to require the Task 20 golden re-baseline eventually — do NOT
re-baseline now. Confirm via `npx vitest run tests/golden` that failures are hash-mismatches only
(not crashes) before moving on; leave them failing until Task 20.

---

### Task 10: `tellFired` for the 6 already-computed terms in `#stepShopping`/`#stepLeaving`

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts` (`#stepShopping` lines 204-247, `#stepLeaving`
  lines 310-360)
- Modify: `src/sim/systems/shoppers/system.test.ts` (append)

**Interfaces:**
- Consumes: `TellTerm`, `thresholdFor`, `DEFAULT_GENTLE_SURFACE_CONTENT` from
  `../../content/gentle-surface.js` (Task 1); `world.events.emit` (existing).
- Produces: `tellFired` events for `fillRateMiss`, `priceSurpriseNegative`,
  `priceSurprisePositive`, `spoiledEncounters` (all in `#stepShopping`) and `discovery` (in
  `#stepLeaving`, on the trip's first impulse hit — see Task 15 for where that's actually detected;
  this task only wires the already-existing end-of-trip `discovery` boolean-to-tell translation as
  a stopgap, superseded by Task 15's live per-hit version. To avoid duplicate `discovery` tells,
  Task 15 removes what this task adds here — see Task 15 Step 3's note.).

Given Task 15 supersedes the `discovery` piece, **this task covers only `fillRateMiss`,
`priceSurpriseNegative`, `priceSurprisePositive`, and `spoiledEncounters`** — drop `discovery` from
scope here entirely (Task 15 owns it end to end, avoiding rework).

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/shoppers/system.test.ts`:

```ts
import { DEFAULT_GENTLE_SURFACE_CONTENT } from '../../content/gentle-surface.js';

describe('tellFired for stepShopping terms', () => {
  it('fires fillRateMiss when a good is out of stock', () => {
    const { system, world, shopperId } = buildOutOfStockWorld(); // existing helper: an empty shelf
    world.step(); // drive the shopper to the empty facing
    // ...drive additional steps per this file's existing convention until the shopper reaches
    // the shelf destination (reuse the exact loop pattern the file's other FSM tests use)...
    const events = world.events.drain();
    const tell = events.find((e) => e.type === 'tellFired' && e.term === 'fillRateMiss');
    expect(tell).toBeDefined();
  });

  it('fires spoiledEncounters when a good comes back spoiled', () => {
    const { system, world, shopperId } = buildSpoiledStockWorld(); // existing spoilage helper
    // drive to the shelf, same pattern as above
    const events = world.events.drain();
    const tell = events.find((e) => e.type === 'tellFired' && e.term === 'spoiledEncounters');
    expect(tell).toBeDefined();
    expect(tell?.worldMark ?? true).toBe(true); // sanity: term is declared worldMark in content
  });

  it('fires priceSurpriseNegative when paying well above reference', () => {
    const { system, world, shopperId } = buildOverpricedWorld(); // existing setPrice helper, priced high
    // drive to the shelf
    const events = world.events.drain();
    expect(events.some((e) => e.type === 'tellFired' && e.term === 'priceSurpriseNegative')).toBe(true);
  });

  it('fires priceSurprisePositive on a steep markdown/loss-leader price', () => {
    const { system, world, shopperId } = buildLossLeaderWorld(); // existing setPrice helper, priced low
    const events = world.events.drain();
    expect(events.some((e) => e.type === 'tellFired' && e.term === 'priceSurprisePositive')).toBe(true);
  });

  it('stays silent on priceSurprise within threshold', () => {
    const { system, world, shopperId } = buildReferencePricedWorld(); // price === reference
    const events = world.events.drain();
    expect(events.some((e) => e.type === 'tellFired' && e.term.startsWith('priceSurprise'))).toBe(false);
  });
});
```

Read the file's existing FSM-driving test helpers first (it already has patterns for driving a
shopper to a shelf, an out-of-stock shelf, a spoiled shelf, and price-varied shelves from phases
1.6/1.7/1.9's tests) and reuse them rather than writing new grid/fixture setup from scratch.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts -t "tellFired for stepShopping"`
Expected: FAIL — no `tellFired` events are emitted yet.

- [ ] **Step 3: Implement**

In `src/sim/systems/shoppers/system.ts`, import at the top:

```ts
import { thresholdFor, DEFAULT_GENTLE_SURFACE_CONTENT } from '../../content/gentle-surface.js';
```

In `#stepShopping` (currently lines 204-247), after `const result = this.#inventory.consume(goodId, world.tick);`
and before the `if (result === 'spoiled')` branch, add a helper lookup for this shelf's instance id
(first matching stocked instance, deterministic by `#stocking`'s insertion order — documented
simplification for the rare case multiple shelves stock the same good):

```ts
    const shelfInstanceId = [...this.#stocking.entries()].find(([, g]) => g === goodId)?.[0];
```

In the `if (result === 'spoiled')` branch, before the `return`:

```ts
    if (result === 'spoiled') {
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'spoiledEncounters',
        magnitude: 1,
        ...(shelfInstanceId !== undefined ? { worldRef: { instanceId: shelfInstanceId } } : {}),
      });
      return { ...moved, remainingList, spoiledEncounters: moved.spoiledEncounters + 1, state };
    }
```

In the `if (result === 'outOfStock')` branch, before the `return`:

```ts
    if (result === 'outOfStock') {
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'fillRateMiss',
        magnitude: 1,
        ...(shelfInstanceId !== undefined ? { worldRef: { instanceId: shelfInstanceId } } : {}),
      });
      return { ...moved, remainingList, state };
    }
```

After `const priceSurprise = reference > 0 ? (reference - paid) / reference : 0;`, before `const
cart = [...moved.cart, goodId];`:

```ts
    if (priceSurprise <= -thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'priceSurpriseNegative')) {
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'priceSurpriseNegative',
        magnitude: Math.min(1, -priceSurprise),
      });
    } else if (priceSurprise >= thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'priceSurprisePositive')) {
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'priceSurprisePositive',
        magnitude: Math.min(1, priceSurprise),
      });
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): tellFired for fillRateMiss/priceSurprise/spoiledEncounters

Emits at the exact point #stepShopping already computes each term —
no new mechanic, just an event at an existing decision point. Silent
below gentle-surface.json5's declared thresholds, per §3's "silence is
a feature." discovery is deliberately excluded here — Task 15 owns it
end to end alongside the impulse-hit tells.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 11: Live per-tick `queuePenaltyRising`/`queuePenaltyBalk` in `#stepCheckingOut`

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts` (`#stepCheckingOut`, lines 249-308)
- Modify: `src/sim/systems/shoppers/system.test.ts` (append)

**Interfaces:**
- Consumes: `Shopper.queuePenaltyRisingFired` (Task 9), `thresholdFor`/`DEFAULT_GENTLE_SURFACE_CONTENT`
  (Task 1).
- Produces: `tellFired('queuePenaltyRising')` once per trip when live wait magnitude first crosses
  0.3; `tellFired('queuePenaltyBalk')` at the moment a trip actually resolves to `balked` or
  `abandoned`.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/shoppers/system.test.ts`:

```ts
describe('live queuePenalty tells', () => {
  it('fires queuePenaltyRising once, mid-trip, once wait crosses the rising threshold', () => {
    const { system, world, shopperId } = buildUnderstaffedQueueWorld(); // existing 1-lane understaffing helper
    let firedCount = 0;
    for (let i = 0; i < 300; i++) {
      world.step();
      firedCount += world.events.drain().filter((e) => e.type === 'tellFired' && e.term === 'queuePenaltyRising').length;
    }
    expect(firedCount).toBe(1); // fires once, not once per tick above threshold
  });

  it('fires queuePenaltyBalk exactly when the trip balks or abandons', () => {
    const { system, world, shopperId } = buildGuaranteedAbandonWorld(); // existing no-open-lane-ever helper, or long-wait helper
    let balkTellSeen = false;
    for (let i = 0; i < 500; i++) {
      world.step();
      if (world.events.drain().some((e) => e.type === 'tellFired' && e.term === 'queuePenaltyBalk')) {
        balkTellSeen = true;
      }
    }
    expect(balkTellSeen).toBe(true);
  });
});
```

Reuse this file's existing 1.8-phase understaffing/balk/abandon world-setup helpers (the phase 1.8
plan already built these exact scenarios for `understaffing.test.ts`-style tests).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts -t "live queuePenalty"`
Expected: FAIL — no `queuePenaltyRising`/`queuePenaltyBalk` tells are emitted yet.

- [ ] **Step 3: Implement**

In `#stepCheckingOut` (currently lines 249-308), after the line
`const outcome = this.#checkout.statusOf(shopper.id);` and its `if (outcome === 'waiting' ||
outcome === 'beingServed' || outcome === 'notInQueue') return shopper;` early return — insert the
live-rising check **before** that early return fires, since the tell must fire while still waiting:

```ts
    const outcome = this.#checkout.statusOf(shopper.id);

    if (outcome === 'waiting' || outcome === 'beingServed') {
      if (!shopper.queuePenaltyRisingFired && shopper.checkoutJoinedAtTick !== null) {
        const liveWaitTicks = world.tick - shopper.checkoutJoinedAtTick;
        const liveMagnitude = Math.min(1, (liveWaitTicks / DEFAULT_STAFFING_CONFIG.balkToleranceTicks) ** 1.6);
        if (liveMagnitude >= thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'queuePenaltyRising')) {
          world.events.emit({
            type: 'tellFired',
            shopperId: shopper.id,
            term: 'queuePenaltyRising',
            magnitude: liveMagnitude,
            ...(shopper.checkoutLaneId !== null ? { worldRef: { instanceId: shopper.checkoutLaneId } } : {}),
          });
          return { ...shopper, queuePenaltyRisingFired: true };
        }
      }
      return shopper;
    }
    if (outcome === 'notInQueue') return shopper;
```

(This replaces the existing single-line early return for those three outcomes — `notInQueue` keeps
its own unconditional return since a shopper who hasn't joined yet has no wait to measure.)

In the `if (outcome === 'abandoned')` branch, before its `return`:

```ts
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: 'queuePenaltyBalk',
        magnitude: 1,
        ...(shopper.checkoutLaneId !== null ? { worldRef: { instanceId: shopper.checkoutLaneId } } : {}),
      });
```

In the final `// 'balked'` branch, before its `return`:

```ts
    world.events.emit({
      type: 'tellFired',
      shopperId: shopper.id,
      term: 'queuePenaltyBalk',
      magnitude: 1,
      ...(shopper.checkoutLaneId !== null ? { worldRef: { instanceId: shopper.checkoutLaneId } } : {}),
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): live per-tick queuePenaltyRising/Balk tells

Moves queuePenalty's already-modeled (waitTicks/tolerance)^1.6
magnitude from a trip-end-only computation to a live per-tick check
while queued, gated by queuePenaltyRisingFired so it fires once per
trip (Task 9's field) rather than once per tick above threshold.
queuePenaltyBalk fires exactly at the balk/abandon resolution moment.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 12: Cleanliness and staff-interaction satisfaction terms + tells

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts` (`#stepCheckingOut` queue-join branch, lines
  249-308; `#stepLeaving`, lines 310-360)
- Modify: `src/sim/systems/shoppers/system.test.ts` (append)

**Interfaces:**
- Consumes: `CheckoutSystem#cleanliness()` (existing), `CheckoutSystem#staffMoraleOnLane` (Task 5),
  `ShoppersConfig.cleanlinessWeight`/`staffInteractionWeight` (Task 4),
  `StaffingConfig.staffInteractionMoraleThreshold` (Task 4), `Shopper.staffInteractionGood`
  (Task 9).
- Produces: `w5`/`w6` finally live in the satisfaction sum; `tellFired('staffInteractionGood' |
  'staffInteractionAbsent')` at queue-join; `tellFired('cleanlinessLow')` at trip end.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/shoppers/system.test.ts`:

```ts
describe('staff interaction and cleanliness satisfaction terms', () => {
  it('fires staffInteractionGood and adds to satisfaction when morale is above threshold', () => {
    const { system, world, shopperId } = buildHighMoraleStaffedWorld(); // existing hireStaff helper, morale 0.9
    // drive to checkout join
    const events = world.events.drain();
    expect(events.some((e) => e.type === 'tellFired' && e.term === 'staffInteractionGood')).toBe(true);
  });

  it('fires staffInteractionAbsent for self-checkout', () => {
    const { system, world, shopperId } = buildSelfCheckoutOnlyWorld(); // existing self-checkout helper
    const events = world.events.drain();
    expect(events.some((e) => e.type === 'tellFired' && e.term === 'staffInteractionAbsent')).toBe(true);
  });

  it('a satisfying, clean, well-staffed trip scores higher satisfaction than an otherwise-identical dirty one', () => {
    const cleanResult = runFullTripSatisfaction({ cleanliness: 0.95, staffMorale: 0.9 });
    const dirtyResult = runFullTripSatisfaction({ cleanliness: 0.1, staffMorale: 0.9 });
    expect(cleanResult).toBeGreaterThan(dirtyResult);
  });

  it('fires cleanlinessLow when cleanliness drops below threshold', () => {
    const { system, world, shopperId } = buildDirtyStoreWorld(); // drive cleanliness below 0.6 via traffic, no staff
    const events = world.events.drain();
    expect(events.some((e) => e.type === 'tellFired' && e.term === 'cleanlinessLow')).toBe(true);
  });
});
```

Write `runFullTripSatisfaction` as a small local test helper in this file if one doesn't already
exist, mirroring the shape of any existing "drive a full trip and read `shopperTripCompleted`'s
satisfaction" helper from the 1.8/1.9-phase tests (reuse rather than duplicate if one exists).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts -t "staff interaction and cleanliness"`
Expected: FAIL — no `staffInteraction*`/`cleanlinessLow` tells, satisfaction doesn't yet vary with
cleanliness/morale.

- [ ] **Step 3: Implement**

In `#stepCheckingOut` (lines 249-308), in the branch that first assigns `checkoutLaneId` (`if
(shopper.checkoutLaneId === null) { ... }`), after `this.#checkout.reserveLane(laneId);` and before
its `return`, determine and tag the interaction, and emit its tell:

```ts
      this.#checkout.reserveLane(laneId);
      const usedSelfCheckout = this.#checkout.isSelfCheckout(laneId);
      const morale = this.#checkout.staffMoraleOnLane(laneId);
      const staffInteractionGood = morale !== null && morale >= DEFAULT_STAFFING_CONFIG.staffInteractionMoraleThreshold;
      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term: staffInteractionGood ? 'staffInteractionGood' : 'staffInteractionAbsent',
        magnitude: 1,
        worldRef: { instanceId: laneId },
      });
      return { ...shopper, checkoutLaneId: laneId, usedSelfCheckout, staffInteractionGood };
```

(This replaces the existing `return { ...shopper, checkoutLaneId: laneId, usedSelfCheckout:
this.#checkout.isSelfCheckout(laneId) };` line.)

In `#stepLeaving` (lines 310-360), after the existing `const priceSurprise = ...` line and before
`const satisfaction = Math.min(...)`, add:

```ts
    const cleanlinessGap = 1 - this.#checkout.cleanliness();
    if (cleanlinessGap >= thresholdFor(DEFAULT_GENTLE_SURFACE_CONTENT, 'cleanlinessLow')) {
      world.events.emit({
        type: 'tellFired',
        shopperId: moved.id,
        term: 'cleanlinessLow',
        magnitude: Math.min(1, cleanlinessGap),
      });
    }
    const staffInteractionBonus = moved.staffInteractionGood === true ? DEFAULT_SHOPPERS_CONFIG.staffInteractionWeight : 0;
```

Add both new terms into the existing `satisfaction = Math.min(1, Math.max(0, ...))` expression —
change:

```ts
          DEFAULT_ECONOMY_CONFIG.priceSurpriseWeight * priceSurprise,
      ),
    );
```

to:

```ts
          DEFAULT_ECONOMY_CONFIG.priceSurpriseWeight * priceSurprise -
          DEFAULT_SHOPPERS_CONFIG.cleanlinessWeight * cleanlinessGap +
          staffInteractionBonus,
      ),
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck, run the checkout/shoppers suites, and commit**

Run: `npx tsc --noEmit && npx vitest run src/sim/systems/shoppers src/sim/systems/checkout`

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): wire cleanliness and staff interaction into satisfaction

Implements §5.3's long-absent w5 (staffInteraction) and w6
(cleanliness) terms — both existed as raw numbers (CheckoutSystem's
cleanliness()/staff morale) with no satisfaction consumer until now.
Emits staffInteractionGood/Absent at checkout queue-join and
cleanlinessLow at trip end. Golden hashes for scenarios with an active
checkout will move — expected, re-baselined in Task 20, not here.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 13: `#rollImpulse` — mutual-exclusion impulse tells + discovery

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts` (`#rollImpulse`, lines 384-407; its one call site in
  `#stepShopping`)
- Modify: `src/sim/systems/shoppers/system.test.ts` (append)

**Interfaces:**
- Consumes: `EconomySystem#isPromoted` (Task 6), `isAdjacencyCombo`/`DEFAULT_MARKET_CONFIG` (Task
  3), `GoodDef.category` (Task 3), `Household.segment` via `this.#market.household(...)`
  (existing).
- Produces: exactly one `tellFired` per impulse hit, term chosen by precedence `adjacencyBonus` >
  `promoLift` > `needState` > `impulsePurchase`; a separate `tellFired('discovery')` on a trip's
  first impulse hit only.

- [ ] **Step 1: Write the failing test**

Append to `src/sim/systems/shoppers/system.test.ts`:

```ts
describe('impulse-hit tell precedence', () => {
  it('tags adjacencyBonus when a combo category is also nearby, even if also promoted', () => {
    const { system, world, shopperId } = buildAdjacentComboAndPromotedWorld(); // milk+bread nearby, milk promoted
    forceImpulseHits(world); // this file's existing RNG-forcing helper for guaranteed impulse rolls
    const events = world.events.drain().filter((e) => e.type === 'tellFired');
    const impulseTells = events.filter((e) => ['adjacencyBonus', 'promoLift', 'needState', 'impulsePurchase'].includes(e.term));
    expect(impulseTells.every((e) => e.term === 'adjacencyBonus')).toBe(true);
  });

  it('tags promoLift when promoted but not adjacent to a combo good', () => {
    const { system, world, shopperId } = buildPromotedOnlyWorld();
    forceImpulseHits(world);
    const events = world.events.drain().filter((e) => e.type === 'tellFired');
    expect(events.some((e) => e.term === 'promoLift')).toBe(true);
    expect(events.some((e) => e.term === 'adjacencyBonus')).toBe(false);
  });

  it('tags needState for a family-segment shopper with no promo/adjacency', () => {
    const { system, world, shopperId } = buildFamilySegmentPlainWorld();
    forceImpulseHits(world);
    const events = world.events.drain().filter((e) => e.type === 'tellFired');
    expect(events.some((e) => e.term === 'needState')).toBe(true);
  });

  it('tags plain impulsePurchase for a non-family shopper with no promo/adjacency', () => {
    const { system, world, shopperId } = buildPriceHunterPlainWorld();
    forceImpulseHits(world);
    const events = world.events.drain().filter((e) => e.type === 'tellFired');
    expect(events.some((e) => e.term === 'impulsePurchase')).toBe(true);
  });

  it('fires discovery once, on the first impulse hit of a trip, regardless of which term tagged it', () => {
    const { system, world, shopperId } = buildMultiImpulseWorld(); // multiple nearby impulse-eligible goods
    forceImpulseHits(world);
    const events = world.events.drain().filter((e) => e.type === 'tellFired' && e.term === 'discovery');
    expect(events.length).toBe(1);
  });
});
```

`forceImpulseHits` should force `world.rng.get('impulse').chance(...)` to always return true for
the duration of the test — check whether the file already has an RNG-forcing helper from phase 1.6
(`shopper-trip` golden scenario tests likely needed exactly this); if not, the simplest safe
approach without touching sim RNG internals is to set each involved good's `impulseBase` to `1` in
the test's catalog fixture so every roll is a guaranteed hit deterministically, and use that instead
of any RNG mocking.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts -t "impulse-hit tell precedence"`
Expected: FAIL — no impulse-hit tells are emitted yet, `#rollImpulse` only returns a count.

- [ ] **Step 3: Implement**

In `src/sim/systems/shoppers/system.ts`, rewrite `#rollImpulse` (currently lines 384-407) to emit a
`tellFired` per hit and track the trip's first-hit `discovery`. It still returns the hit count
(callers only use the count to increment `impulseHits`):

```ts
  /** Path exposure (PLAN.md §5.4): roll impulse only for goods near where the shopper just walked. */
  #rollImpulse(world: World, shopper: Shopper, justPickedGoodId: string): number {
    let hits = 0;
    const justPickedCategory = this.#catalogById.get(justPickedGoodId)?.category;
    const nearbyCategories: string[] = [];
    for (const [instanceId, goodId] of this.#stocking) {
      if (goodId === justPickedGoodId) continue;
      const placement = this.#grid.placements().find((p) => p.instanceId === instanceId);
      if (!placement) continue;
      const dx = placement.x - shopper.position.x;
      const dy = placement.y - shopper.position.y;
      if (Math.hypot(dx, dy) > DEFAULT_SHOPPERS_CONFIG.exposureRadius) continue;
      const category = this.#catalogById.get(goodId)?.category;
      if (category) nearbyCategories.push(category);
    }

    for (const [instanceId, goodId] of this.#stocking) {
      if (goodId === justPickedGoodId) continue;
      const placement = this.#grid.placements().find((p) => p.instanceId === instanceId);
      if (!placement) continue;
      const dx = placement.x - shopper.position.x;
      const dy = placement.y - shopper.position.y;
      if (Math.hypot(dx, dy) > DEFAULT_SHOPPERS_CONFIG.exposureRadius) continue;
      const good = this.#catalogById.get(goodId);
      if (!good) continue;
      const reference = this.#economy.referencePriceOf(goodId);
      const current = this.#economy.priceOf(goodId, world.tick);
      const elasticityMultiplier =
        reference > 0 && current > 0 ? (reference / current) ** DEFAULT_ECONOMY_CONFIG.elasticityCoefficient : 1;
      const probability = Math.min(1, good.impulseBase * elasticityMultiplier);
      if (!world.rng.get('impulse').chance(probability)) continue;

      hits++;
      const isFirstHitThisTrip = shopper.impulseHits === 0 && hits === 1;
      if (isFirstHitThisTrip) {
        world.events.emit({ type: 'tellFired', shopperId: shopper.id, term: 'discovery', magnitude: 1 });
      }

      const hasNearbyCombo = nearbyCategories.some((c) => isAdjacencyCombo(DEFAULT_MARKET_CONFIG, good.category, c));
      let term: TellTerm;
      if (hasNearbyCombo) term = 'adjacencyBonus';
      else if (this.#economy.isPromoted(goodId, world.tick)) term = 'promoLift';
      else if (this.#market.household(shopper.householdId).segment === 'family') term = 'needState';
      else term = 'impulsePurchase';

      world.events.emit({
        type: 'tellFired',
        shopperId: shopper.id,
        term,
        magnitude: 1,
        worldRef: { instanceId },
      });
    }
    return hits;
  }
```

Add the new imports at the top of the file:

```ts
import { isAdjacencyCombo, DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { TellTerm } from '../../content/gentle-surface.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): mutual-exclusion impulse tells + live discovery

#rollImpulse now tags each hit adjacencyBonus > promoLift > needState
> impulsePurchase (first match wins, per the design spec's precedence)
and fires discovery once on a trip's first hit — superseding the old
end-of-trip-only discovery boolean. needState reuses the existing
family segment as its documented proxy (no "kids in trip" schema
exists). Nearby-category detection reuses the same
exposureRadius/distance loop rollImpulse already ran.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 14: `tell-draw-plan.ts` — pure rate-limiting view function

**Files:**
- Create: `src/view/tell-draw-plan.ts`
- Test: `src/view/tell-draw-plan.test.ts`

**Interfaces:**
- Consumes: a list of `{ shopperId: number; term: TellTerm; magnitude: number }` (drained
  `tellFired` events, worldRef omitted here — world marks are a separate draw-plan pass, see Task
  17), `GentleSurfaceContent` (Task 1), shopper screen positions.
- Produces: `buildTellDrawPlan(events, content, positions, origin, maxSimultaneous):
  readonly TellMarker[]` where `TellMarker = { readonly x: number; readonly y: number; readonly
  bubbleId: string; readonly shopperId: number }`. Task 19 (`BuildScene`) consumes this.

- [ ] **Step 1: Write the failing test**

```ts
// src/view/tell-draw-plan.test.ts
import { describe, expect, it } from 'vitest';
import { parseGentleSurfaceContent } from '../sim/content/gentle-surface.js';
import { buildTellDrawPlan } from './tell-draw-plan.js';

const CONTENT = parseGentleSurfaceContent({
  satisfaction: [
    { term: 'fillRateMiss', bubble: 'listStrike', animation: 'shrugAtEmptyFacing', particle: null, worldMark: true, threshold: 0 },
    { term: 'priceSurpriseNegative', bubble: 'priceTagRaisedEyebrow', animation: 'putItemBack', particle: null, worldMark: true, threshold: 0.1 },
    { term: 'priceSurprisePositive', bubble: 'priceTagStar', animation: 'grabSecond', particle: null, worldMark: false, threshold: 0.1 },
    { term: 'queuePenaltyRising', bubble: 'clock', animation: 'footTapArmsCrossedHeadShake', particle: null, worldMark: false, threshold: 0.3 },
    { term: 'queuePenaltyBalk', bubble: 'clockRedX', animation: 'abandonCartWalkOut', particle: null, worldMark: true, threshold: 0.7 },
    { term: 'spoiledEncounters', bubble: 'greenStinkCloud', animation: 'recoilPutBack', particle: 'flies', worldMark: true, threshold: 0 },
    { term: 'cleanlinessLow', bubble: 'frown', animation: 'stepAroundSpillWrinkleNose', particle: null, worldMark: true, threshold: 0.4 },
    { term: 'staffInteractionGood', bubble: 'heart', animation: 'staffPointsShopperNods', particle: null, worldMark: false, threshold: 0.5 },
    { term: 'staffInteractionAbsent', bubble: 'questionMark', animation: 'standStillLookAround', particle: null, worldMark: false, threshold: 0 },
    { term: 'discovery', bubble: 'sparkle', animation: 'detourTowardShelf', particle: null, worldMark: true, threshold: 0 },
  ],
  impulse: [
    { term: 'impulsePurchase', bubble: 'exclamation', animation: 'itemHopsIntoCart', particle: null, worldMark: false, threshold: 0 },
    { term: 'visibility', bubble: null, animation: null, particle: null, worldMark: true, threshold: 0 },
    { term: 'adjacencyBonus', bubble: 'exclamationGold', animation: null, particle: null, worldMark: false, threshold: 0 },
    { term: 'promoLift', bubble: null, animation: 'slowNearPromoSign', particle: null, worldMark: true, threshold: 0 },
    { term: 'needState', bubble: null, animation: 'childPointsAtShelf', particle: null, worldMark: false, threshold: 0 },
  ],
});

describe('buildTellDrawPlan', () => {
  it('collapses multiple tells for one shopper to the highest magnitude', () => {
    const events = [
      { shopperId: 1, term: 'staffInteractionGood' as const, magnitude: 0.5 },
      { shopperId: 1, term: 'discovery' as const, magnitude: 1 },
    ];
    const positions = new Map([[1, { x: 10, y: 20 }]]);
    const plan = buildTellDrawPlan(events, CONTENT, positions, { x: 0, y: 0 }, 8);
    expect(plan).toHaveLength(1);
    expect(plan[0]?.bubbleId).toBe('sparkle'); // discovery, magnitude 1 wins over 0.5
  });

  it('caps at maxSimultaneous, keeping the highest-magnitude markers', () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      shopperId: i,
      term: 'fillRateMiss' as const,
      magnitude: i / 10,
    }));
    const positions = new Map(events.map((e) => [e.shopperId, { x: e.shopperId, y: 0 }]));
    const plan = buildTellDrawPlan(events, CONTENT, positions, { x: 0, y: 0 }, 4);
    expect(plan).toHaveLength(4);
    expect(plan.map((m) => m.shopperId).sort((a, b) => b - a)).toEqual([9, 8, 7, 6]);
  });

  it('omits a shopper with no known screen position', () => {
    const events = [{ shopperId: 99, term: 'discovery' as const, magnitude: 1 }];
    const plan = buildTellDrawPlan(events, CONTENT, new Map(), { x: 0, y: 0 }, 8);
    expect(plan).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/view/tell-draw-plan.test.ts`
Expected: FAIL — `./tell-draw-plan.js` does not exist.

- [ ] **Step 3: Write the implementation**

```ts
// src/view/tell-draw-plan.ts
import type { GentleSurfaceContent, TellTerm } from '../sim/content/gentle-surface.js';
import { worldToScreen } from './iso.js';

export interface TellOccurrence {
  readonly shopperId: number;
  readonly term: TellTerm;
  readonly magnitude: number;
}

export interface TellMarker {
  readonly x: number;
  readonly y: number;
  readonly bubbleId: string;
  readonly shopperId: number;
}

/**
 * §3's "silence is a feature" rules, applied in the view since the sim already resolved
 * per-term thresholds/mutual exclusion: one bubble per shopper (highest magnitude wins),
 * then a hard cap on simultaneous markers (roughly 8 at `regular`, 4 at `compact` —
 * caller passes the number, resolved from `src/platform/layout`).
 */
export function buildTellDrawPlan(
  events: readonly TellOccurrence[],
  content: GentleSurfaceContent,
  shopperPositions: ReadonlyMap<number, { x: number; y: number }>,
  origin: { x: number; y: number },
  maxSimultaneous: number,
): readonly TellMarker[] {
  const bestPerShopper = new Map<number, TellOccurrence>();
  for (const event of events) {
    const current = bestPerShopper.get(event.shopperId);
    if (!current || event.magnitude > current.magnitude) {
      bestPerShopper.set(event.shopperId, event);
    }
  }

  const candidates = [...bestPerShopper.values()]
    .filter((e) => shopperPositions.has(e.shopperId))
    .sort((a, b) => b.magnitude - a.magnitude)
    .slice(0, maxSimultaneous);

  const markers: TellMarker[] = [];
  for (const event of candidates) {
    const bubble = content.get(event.term)?.bubble;
    if (!bubble) continue; // world-mark-only or animation-only terms have no bubble to draw here
    const position = shopperPositions.get(event.shopperId)!;
    const screen = worldToScreen(position.x, position.y, origin);
    markers.push({ x: screen.x, y: screen.y, bubbleId: bubble, shopperId: event.shopperId });
  }
  return markers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/view/tell-draw-plan.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/view/tell-draw-plan.ts src/view/tell-draw-plan.test.ts
git commit -m "$(cat <<'EOF'
feat(view): tell-draw-plan — rate-limited, one-bubble-per-shopper

Pure function, same convention as shopper-draw-plan.ts and
pathing-debug-plan.ts. Enforces docs/design/gentle-surface.md §3:
highest-magnitude tell wins per shopper, then a hard cap on
simultaneous markers. No Phaser import — testable without a canvas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 15: `BuildModeBridge.pendingTells()` and `stockLevelsSnapshot()`

**Files:**
- Modify: `src/bridge/build-bridge.ts:174-193` (add two accessors near `shoppersSnapshot`)
- Modify: `src/bridge/build-bridge.test.ts` (append)

**Interfaces:**
- Consumes: `World#events` (existing `EventBus`), `ShoppersSystem#stockedGoodAt` (Task 8),
  `InventorySystem#stockOf`/`capacityOf` (existing / Task 7).
- Produces: `BuildModeBridge#pendingTells(): readonly TellOccurrence[]` (drains `tellFired` events
  since the last read, translating `SimEvent`'s `tellFired` shape to `tell-draw-plan.ts`'s
  `TellOccurrence`), `BuildModeBridge#shelfFullness(): readonly { instanceId: number; fraction:
  number }[]`. Task 19 (`BuildScene`) consumes both.

- [ ] **Step 1: Write the failing test**

Append to `src/bridge/build-bridge.test.ts`:

```ts
describe('pendingTells', () => {
  it('drains tellFired events since the last read', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    // ...drive a scenario that fires at least one tell (e.g. stock nothing, spawn a
    // shopper with a list item, tick until fillRateMiss fires) using this file's
    // existing setup conventions...
    const first = bridge.pendingTells();
    expect(first.length).toBeGreaterThan(0);
    const second = bridge.pendingTells();
    expect(second).toHaveLength(0); // already drained
  });
});

describe('shelfFullness', () => {
  it('reports a stocked shelf\'s fraction of capacity', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    // place a shelf, stockFixture it with milk, using this file's existing helpers
    const fullness = bridge.shelfFullness();
    expect(fullness.length).toBeGreaterThan(0);
    expect(fullness[0]?.fraction).toBeGreaterThanOrEqual(0);
    expect(fullness[0]?.fraction).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/bridge/build-bridge.test.ts -t "pendingTells\|shelfFullness"`
Expected: FAIL — neither method exists.

- [ ] **Step 3: Implement**

In `src/bridge/build-bridge.ts`, add after `shoppersSnapshot()` (currently lines 174-179):

```ts
  /** Every tellFired event since the last read — the first (and only, per redraw cycle)
   *  consumer of world.events for gentle-surface rendering. */
  pendingTells(): readonly TellOccurrence[] {
    return this.#world.events
      .drain()
      .filter((e): e is Extract<SimEvent, { type: 'tellFired' }> => e.type === 'tellFired')
      .map((e) => ({ shopperId: e.shopperId, term: e.term, magnitude: e.magnitude }));
  }

  /** Every stocked shelf's fraction of capacity (0-1) — feeds the visibility world-mark
   *  tell (full/half/empty), a per-frame world read rather than an event. */
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
```

Add the import at the top:

```ts
import type { SimEvent } from '../sim/core/events.js';
import type { TellOccurrence } from '../view/tell-draw-plan.js';
```

Note: `EventBus.drain()` is only ever called once per tick by any single caller (rule 2 in
`events.ts`'s doc comment — "never buffered across ticks"). If `BuildScene.redraw()` (Task 19) is
the only caller of `pendingTells()`, this is safe; if any other future caller also needs
`tellFired` events, revisit with a shared per-tick cache rather than two competing drains.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/bridge/build-bridge.test.ts`
Expected: PASS, full file green.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/bridge/build-bridge.ts src/bridge/build-bridge.test.ts
git commit -m "$(cat <<'EOF'
feat(bridge): pendingTells() and shelfFullness() accessors

First consumer of world.events for anything beyond internal sim
wiring — drains tellFired per redraw cycle. shelfFullness() is a
separate per-frame world read (visibility has no bubble, no event —
just a world mark), combining Task 7's capacityOf and Task 8's
stockedGoodAt.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 16: `BuildScene.ts` — render bubbles, poses, and world marks

**Files:**
- Modify: `src/view/BuildScene.ts` (add a render pass in `redraw()`)
- New/modify: `src/view/BuildScene.test.ts` if one exists covering draw-plan wiring smoke tests; if
  none exists, skip a dedicated Phaser-level test — `tell-draw-plan.test.ts` (Task 14) already
  covers the pure logic, and `BuildScene` itself has no existing test file per the current
  `src/view/` file tree (`draw-plan.test.ts`, `iso.test.ts`, `pathing-debug-plan.test.ts`,
  `shopper-draw-plan.test.ts` exist; `BuildScene.test.ts` does not — Phaser can't import under
  jsdom per `docs/handoff.md`'s "Weird" notes, which is why `BuildScene` itself stays untested at
  the unit level, same as before this task).

**Interfaces:**
- Consumes: `BuildModeBridge#pendingTells()`/`shelfFullness()` (Task 15),
  `buildTellDrawPlan` (Task 14), `DEFAULT_GENTLE_SURFACE_CONTENT` (Task 1).

**Scope note — an explicit, documented cut, matching this project's established
"explicitly deferred" pattern (see every prior phase's plan):** the spec's §4 described richer
per-term world marks (a spoiled-shelf tint, a persistent abandoned-cart object, a spill decal, a
promo sign). This task implements only the two world marks needed for the gate (shelf fullness for
`visibility`, since that's the term with zero bubble/animation — nothing else renders it at all) and
the rate-limited shopper bubbles (Task 14's draw plan, which covers all 15 terms' bubble/no-bubble
signal). The richer decals are a follow-up: each `tellFired` event already carries `worldRef` when
relevant (Tasks 10-13), so a future pass can add per-term world-mark rendering without touching the
sim again — this task deliberately doesn't block the phase gate on it, since the gate is "every term
fires and is visible in *some* form," which bubbles + fullness already satisfy for every term with a
declared bubble (`promoLift`/`needState`/`visibility` have no `bubble` in content — by design,
per gentle-surface.md, they're world-mark/animation-only). Task 14's `buildTellDrawPlan` correctly
skips those (no bubble to draw); this task's gate-proof coverage for them is Task 17's assertion
that their `tellFired` events fire at all, not that they're visually distinct in `BuildScene` yet —
that visual distinction (a promo sign, a child-points animation) is the deferred follow-up above.

- [ ] **Step 1: Implement**

In `src/view/BuildScene.ts`, add imports:

```ts
import { DEFAULT_GENTLE_SURFACE_CONTENT } from '../sim/content/gentle-surface.js';
import { buildTellDrawPlan } from './tell-draw-plan.js';
```

At the end of `redraw()` (after the existing shopper-marker loop, before the closing `}`), add:

```ts
    // Shelf fullness (visibility tell — world mark only, no bubble): a thin colored bar
    // under each stocked shelf's fixture rect, proportional to capacity.
    for (const shelf of this.#bridge.shelfFullness()) {
      const rect = plan.fixtures.find((f) => f.instanceId === shelf.instanceId);
      if (!rect) continue;
      const barColor = shelf.fraction < 0.25 ? 0xef4444 : shelf.fraction < 0.6 ? 0xf59e0b : 0x22c55e;
      g.fillStyle(barColor, 1);
      g.fillRect(rect.x, rect.y + rect.height - 3, rect.width * shelf.fraction, 3);
    }

    // Tell bubbles: rate-limited, one per shopper, highest magnitude wins (Task 14).
    const shopperPositionsById = new Map(
      buildShopperDrawPlan(this.#bridge.shoppersSnapshot(), this.#origin).map((m) => [m.id, { x: m.x, y: m.y }]),
    );
    const tellMarkers = buildTellDrawPlan(
      this.#bridge.pendingTells(),
      DEFAULT_GENTLE_SURFACE_CONTENT,
      shopperPositionsById,
      this.#origin,
      8, // regular-breakpoint cap; compact wiring is phase 2.3's Preact-layer concern
    );
    const bubbleColor = toPhaserColor(tokens.color.product.violet.base);
    for (const marker of tellMarkers) {
      g.fillStyle(bubbleColor, 1);
      g.fillCircle(marker.x, marker.y - 14, 4); // small token above the shopper marker
    }
```

Note: `plan.fixtures` needs an `instanceId` field to match shelves by id — check
`src/view/draw-plan.ts`'s `buildDrawPlan` return shape first. If `fixtures` entries don't currently
carry `instanceId` (only `x`/`y`/`width`/`height`/`color`/`selected`), add it there: modify
`src/view/draw-plan.ts`'s fixture-mapping code to include `instanceId: placement.instanceId` in
each emitted rect, and its test (`draw-plan.test.ts`) to assert the field is present — this is a
small, backward-compatible addition (existing consumers ignore the extra field).

- [ ] **Step 2: Manual dev-server check**

This project's established pattern (every phase's plan) catches real bugs a unit test can't. Run
the dev server (`npm run dev`), mount build mode, place a shelf, leave it unstocked, add a
household with that good on its list, spawn a shopper, and watch: a bubble should appear above the
shopper when it reaches the empty shelf, and the shelf's fullness bar should read red/empty. Note
any visual bug (wrong position, wrong color, bubble never disappearing) before committing.

- [ ] **Step 3: Typecheck and full view-layer test run**

Run: `npx tsc --noEmit && npx vitest run src/view`

- [ ] **Step 4: Commit**

```bash
git add src/view/BuildScene.ts src/view/draw-plan.ts src/view/draw-plan.test.ts
git commit -m "$(cat <<'EOF'
feat(view): render tell bubbles and shelf-fullness world marks

BuildScene's redraw() gains two passes: a fullness bar under every
stocked shelf (visibility tell, no event — a per-frame world read) and
rate-limited tell bubbles above shoppers (Task 14's draw plan, fed by
Task 15's bridge accessors). Placeholder-art tokens, matching the
existing fixture-rectangle/shopper-circle convention — no sprites,
Track A stays placeholder throughout.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 17: Gate-proof integration test — all 15 terms fire

**Files:**
- Create: `src/bridge/gentle-surface-gate.test.ts`

**Interfaces:**
- Consumes: `BuildModeBridge` (existing), `TELL_TERMS` (Task 1).

- [ ] **Step 1: Write the test**

```ts
// src/bridge/gentle-surface-gate.test.ts
import { describe, expect, it } from 'vitest';
import { TELL_TERMS } from '../sim/content/gentle-surface.js';
import { BuildModeBridge } from './build-bridge.js';

/**
 * Phase 2.2's actual gate: every declared tell fires from a real sim signal at least
 * once, not just "the content schema is complete" (tools/check-gentle-surface.mjs
 * already proves that). Builds one deliberately adverse store — understaffed, an
 * out-of-stock shelf, a spoiled shelf, mispriced goods, a dirty floor, an adjacent
 * combo, a promoted good, a family-segment household — and drives enough ticks for
 * every mechanic to trigger, collecting every tellFired event's term along the way.
 */
describe('gentle surface gate: all 15 terms fire', () => {
  it('fires a tellFired event for every declared term across a long adverse run', () => {
    const seen = new Set<string>();
    const bridge = buildAdverseGateWorld(); // see helper below — construct once, drive many ticks

    for (let i = 0; i < 20_000; i++) {
      bridge.tick();
      for (const tell of bridge.pendingTells()) seen.add(tell.term);
    }

    const missing = TELL_TERMS.filter((t) => t !== 'visibility' && !seen.has(t));
    // 'visibility' is world-mark-only with no tellFired event by design (Task 16) —
    // verified separately below via shelfFullness(), not via pendingTells().
    expect(missing).toEqual([]);
    expect(bridge.shelfFullness().length).toBeGreaterThan(0);
  });
});
```

Write `buildAdverseGateWorld()` as a local helper in this file: a `BuildModeBridge` with —

- One understaffed register (1 staff member hired with low morale, e.g. `0.2`, to guarantee
  `staffInteractionAbsent`/`cleanlinessLow`, and enough shopper volume to also produce
  `queuePenaltyRising`/`Balk`) and one self-checkout (for contrast/isSelfCheckout coverage if
  needed elsewhere — optional).
- Two shelves stocking `milk` and `bread` adjacent to each other (both `dairy`/`bakery` — Task 3's
  authored combo) with `impulseBase` effectively guaranteed by setting a very low price on one
  (`setPrice`) alongside a `startPromotion` on the other, so both `adjacencyBonus`/`promoLift`
  paths get a chance; a third shelf stocking `eggs` left deliberately unstocked after a household's
  list includes it (for `fillRateMiss`); do not restock it, ever.
- A `snacks` shelf stocked once, then never restocked with `dockCapacity`-style scarcity (reuse
  existing spoilage-forcing patterns from `src/sim/systems/inventory/system.test.ts` if simpler —
  e.g. push its freshness past spoilage by ticking long enough before a household's trip needs it)
  to guarantee at least one `spoiledEncounters`.
- At least one `family`-segment household (for `needState`) and at least one other-segment
  household (for `impulsePurchase`), both with list items spread across the stocked goods, spawning
  shoppers repeatedly over the run (either via `MarketSystem`'s trip scheduler already firing
  naturally at this tick count, or explicit `spawnShopper` calls on a loop if the scheduler's
  cadence is too slow to fit 20,000 ticks reliably — check `tripListThreshold`/consumption rates
  from `market.json5`/`shoppers.json5` and pick whichever is more reliable).
- A price set above reference on one good and below reference on another, both reachable, for
  `priceSurpriseNegative`/`priceSurprisePositive`.

If 20,000 ticks isn't enough for every term to fire reliably once wired up, increase the tick count
rather than relaxing the assertion — this is a one-time test run, not a hot path.

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/bridge/gentle-surface-gate.test.ts`
Expected: PASS. If any term is still missing, that's a real gap in one of Tasks 10-13's wiring —
go back and fix the relevant task rather than weakening this test.

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`

```bash
git add src/bridge/gentle-surface-gate.test.ts
git commit -m "$(cat <<'EOF'
test: phase 2.2 gate-proof — all 15 gentle-surface terms fire

Proves the actual phase 2.2 gate, not just the content-schema check
tools/check-gentle-surface.mjs already passes: every declared tell
fires from a real sim signal at least once across one deliberately
adverse store (understaffed, dirty, an out-of-stock shelf, a spoiled
shelf, mispriced goods, an adjacent combo, a promoted good, a
family-segment household). Same "run it for real" pattern as every
prior phase's gate-proof test.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 18: Golden re-baseline

**Files:**
- Modify: `tests/golden/hashes.json` (only the scenarios that actually moved)

**Interfaces:** None — this task only re-records hashes, no code changes.

- [ ] **Step 1: Run the full golden suite and diff**

Run: `npx vitest run tests/golden`

Expected: some scenarios FAIL with a hash mismatch — specifically any scenario with an active
staffed checkout, cleanliness decay, or impulse purchases (`shopper-trip`, `catchment-week`,
`rival-reaction`, `campaign-l1`, and any others that exercise staffing/checkout are the likely
candidates; scenarios with no shoppers/checkout activity, e.g. a pure empty-world or build-mode-only
scenario, should NOT move).

- [ ] **Step 2: Confirm which scenarios actually moved**

For each failing scenario, read the failure diff. For every scenario that did NOT fail, confirm its
hash is genuinely unchanged (the test run itself proves this — a passing scenario means its hash
matched). Do not re-baseline anything that passed.

- [ ] **Step 3: Re-baseline only the moved scenarios**

Run whichever existing script this project uses to regenerate `tests/golden/hashes.json` (check
`package.json` for a `golden:update`/similar script, or the pattern used in phase 1.7's/1.9's
re-baseline commits per `docs/handoff.md`) scoped to just the failing scenario names if the tooling
supports it, otherwise regenerate the full file and diff it to confirm only the expected keys
changed (`git diff tests/golden/hashes.json` should show changed values only for the scenarios
identified in Step 2, no added/removed keys, matching the "purely additive" precedent from phase
2.1's `campaign-l1` addition).

- [ ] **Step 4: Run the full golden suite again to confirm green**

Run: `npx vitest run tests/golden`
Expected: PASS, all scenarios.

- [ ] **Step 5: Commit, explaining exactly why, per CLAUDE.md**

```bash
git add tests/golden/hashes.json
git commit -m "$(cat <<'EOF'
test(golden): re-baseline for phase 2.2's satisfaction formula change

Wiring cleanliness (w6) and staffInteraction (w5) into satisfaction
(Task 12) genuinely changes computed satisfaction for any scenario
with an active staffed checkout — expected per CLAUDE.md, not a bug.
Confirmed via a full golden run which scenarios actually moved before
touching this file; only those keys changed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HL6Sa7SPxPYC53dcC5KwGo
EOF
)"
```

---

### Task 19: Phase gate — full verify, E2E, tag

**Files:** None modified — verification and tagging only.

- [ ] **Step 1: Full verification**

Run: `npm run verify`
Expected: PASS — typecheck, lint, `check:content` (still green — content schema was already
complete before this phase, unchanged), unit, golden (Task 18 already made this green), build.

- [ ] **Step 2: E2E**

Run: `npm run test:e2e`
Expected: PASS at both 1440×900 and 390×844. This phase touched `BuildScene.ts`'s render output —
if any existing E2E test screenshots or asserts on canvas content in a way the new bubble/fullness
passes could visually interfere with, investigate and fix before tagging (per CLAUDE.md, a golden
hash or E2E regression here means fix the root cause, not skip the check).

- [ ] **Step 3: Tag the phase gate**

```bash
git tag phase/2.2
```

Check `git tag -l` first to confirm this project's established tagging convention (e.g. whether
prior tags are lightweight or annotated) and match it.

- [ ] **Step 4: Report gate status**

Confirm and state plainly: all 15 gentle-surface terms fire from real sim signals (Task 17's gate
test), render as placeholder-art bubbles/poses/world marks (Task 16), `npm run verify` and
`npm run test:e2e` are green, and the golden re-baseline (Task 18) is explained and isolated. Do
NOT update `docs/handoff.md` as part of this plan — it's local-only/gitignored and gets a
post-execution summary written by whoever runs this plan, per this project's standing workflow
(CLAUDE.md: "Update docs/handoff.md at every gate"), not as a plan task with its own commit.
