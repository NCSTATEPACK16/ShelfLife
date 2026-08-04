# Store Choice, Loyalty & Word-of-Mouth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Households autonomously decide to shop, choose between the player's store and Sav-A-Lott via a multinomial logit, and build or lose loyalty from what happens on the trip — with word-of-mouth spreading strong reactions to neighbours.

**Architecture:** Three new/extended sim systems under `src/sim/systems/`: `MarketSystem` (owns households, the daily trip scheduler, and the logit), `LoyaltySystem` (sole writer of `L(h,s)` and `S̄(h)`), and `ReputationSystem` (one-hop diffusion over a k-nearest-neighbour relation). `Household` and the pantry model relocate from `shoppers/` to `market/`; `ShoppersSystem` is left owning only the in-store agent. Registration order is `grid → pathing → inventory → checkout → economy → market → shoppers → loyalty → reputation`.

**Tech Stack:** TypeScript (strict), Vitest, Zod v4 for content schemas, JSON5 balance content imported via Vite's `?raw` suffix.

**Spec:** `docs/superpowers/specs/2026-08-03-store-choice-logit-design.md`. Read it before Task 1.

## Global Constraints

- `src/sim/**` imports **nothing** from Phaser, the DOM, `window`, Capacitor, or Supabase. ESLint-enforced.
- No `Math.random()` and no `Date.now()` anywhere in `src/sim`. Use `world.rng.get(stream)` and `world.tick`.
- New system → new directory under `src/sim/systems/` containing `index.ts`, `types.ts`, and `*.test.ts`.
- Every tuning constant lives in `content/balance/*.json5`. A numeric literal that is a tuning knob, inlined in TypeScript, fails review.
- All brand and product names are fictional. No new rival is introduced by this plan; Sav-A-Lott is already logged in `docs/legal/parody-review.md`.
- Iterate over ascending numeric ids, never `Map` insertion order, anywhere the result reaches the world hash.
- **If a golden hash changes, STOP.** Re-baseline only in a dedicated commit that touches `tests/golden/hashes.json` and nothing else, with a message explaining the behaviour change. This plan schedules exactly two such commits (Task 2, Task 7). Any *other* task changing a golden hash is a bug in that task.
- After every meaningful change: `npm run verify`.
- Conventional commits. Commit per logical unit.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `content/balance/market.json5` | Every tuning constant introduced by this phase |
| `src/sim/systems/market/household.ts` | `Household`, `deriveShoppingList`, `advancePantryDay` (moved from `shoppers/`) |
| `src/sim/systems/market/choice.ts` | Pure logit: `storeUtility`, `softmax`, `chooseStore` |
| `src/sim/systems/market/terms.ts` | Pure term extraction: player-store and rival-store `StoreTerms` |
| `src/sim/systems/market/system.ts` | `MarketSystem` — households, scheduler, logit, rival trip resolution, outcome buffer |
| `src/sim/systems/loyalty/{types,config,system,index}.ts` | `LoyaltySystem` — `L(h,s)`, `S̄(h)`, `daysSinceVisit` |
| `src/sim/systems/reputation/{types,system,index}.ts` | `ReputationSystem` — k-NN relation, one-hop diffusion |

**Modified:**

| File | Change |
|---|---|
| `src/sim/systems/market/types.ts` | `RivalStore` gains `priceIndex`, `assortmentBreadth`, optional `loyaltyDecay`; `SegmentDef` gains `brandAffinity` |
| `src/sim/systems/market/config.ts` | Schemas for the above; `MarketConfig` parsing |
| `src/sim/systems/shoppers/{system,types,index}.ts` | Drop household ownership; report trip outcomes |
| `src/sim/systems/checkout/system.ts` | Add `serviceScore()` |
| `src/sim/index.ts` | Export the new surface |
| `src/bridge/build-bridge.ts` | Register the three systems in order |
| `tests/golden/scenarios.ts` | Register market in `shopper-trip`; add `catchment-week` |
| `content/rivals/sav-a-lott.json5`, `content/balance/segments.json5` | New authored fields |

**Deleted:** `src/sim/systems/shoppers/household.ts` and `household.test.ts` (moved, not rewritten).

---

## Task 1: Balance content and schemas

**Files:**
- Create: `content/balance/market.json5`
- Modify: `content/rivals/sav-a-lott.json5`, `content/balance/segments.json5`
- Modify: `src/sim/systems/market/types.ts`, `src/sim/systems/market/config.ts`, `src/sim/systems/market/index.ts`
- Test: `src/sim/systems/market/config.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `MarketConfig` (the `z.infer` of the schema below), `DEFAULT_MARKET_CONFIG: MarketConfig`, `parseMarketConfig(raw: unknown): MarketConfig`. `RivalStore` gains `readonly priceIndex: number`, `readonly assortmentBreadth: number`, `readonly loyaltyDecay?: number`. `SegmentDef` gains `readonly brandAffinity: Readonly<Record<string, number>>`.

- [ ] **Step 1: Write the failing config tests**

Append to `src/sim/systems/market/config.test.ts`:

```typescript
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES, DEFAULT_SEGMENT_CONFIG, parseMarketConfig } from './config.js';

describe('market config', () => {
  it('loads every phase 2.0c constant', () => {
    expect(DEFAULT_MARKET_CONFIG.tripListThreshold).toBeGreaterThan(0);
    expect(DEFAULT_MARKET_CONFIG.priceFitNeutral).toBeGreaterThan(0);
    expect(DEFAULT_MARKET_CONFIG.loyaltyAlpha).toBeGreaterThan(0);
    expect(DEFAULT_MARKET_CONFIG.womNeighbors).toBeGreaterThanOrEqual(1);
    expect(DEFAULT_MARKET_CONFIG.delightThreshold).toBeGreaterThan(DEFAULT_MARKET_CONFIG.disgustThreshold);
  });

  it('rejects a word-of-mouth nudge that outweighs an actual trip', () => {
    expect(() =>
      parseMarketConfig({ ...DEFAULT_MARKET_CONFIG, womDelta: DEFAULT_MARKET_CONFIG.loyaltyAlpha }),
    ).toThrow();
  });

  it('rejects a negative neighbour count', () => {
    expect(() => parseMarketConfig({ ...DEFAULT_MARKET_CONFIG, womNeighbors: 0 })).toThrow();
  });
});

describe('rival store fields', () => {
  it('authors a price index and assortment breadth for Sav-A-Lott', () => {
    const savALott = DEFAULT_RIVAL_STORES[0]!;
    expect(savALott.priceIndex).toBeLessThan(1);
    expect(savALott.assortmentBreadth).toBeGreaterThan(0);
    expect(savALott.assortmentBreadth).toBeLessThan(1);
  });
});

describe('segment brand affinity', () => {
  it('gives every segment an affinity map', () => {
    for (const def of DEFAULT_SEGMENT_CONFIG.values()) {
      expect(def.brandAffinity).toBeDefined();
      expect(def.brandAffinity['player']).toBeTypeOf('number');
    }
  });

  it('treats an unknown identity as neutral rather than throwing', () => {
    const foodie = DEFAULT_SEGMENT_CONFIG.get('foodie')!;
    expect(foodie.brandAffinity['no-such-identity'] ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/systems/market/config.test.ts`
Expected: FAIL — `DEFAULT_MARKET_CONFIG` is not exported.

- [ ] **Step 3: Author `content/balance/market.json5`**

```json5
// Phase 2.0c constants (PLAN.md §5.1, §5.2, §5.3). Trip scheduling, the store-choice
// logit's non-segment terms, loyalty dynamics, and word-of-mouth diffusion.
//
// See docs/superpowers/specs/2026-08-03-store-choice-logit-design.md for why each
// exists. Two values are honest stubs and are commented as such below.
{
  // --- trip scheduling (§5.4) -------------------------------------------------
  // A household shops once its pantry-derived list reaches this many items. Segments
  // differentiate frequency through consumptionMultiplier (how fast the list fills),
  // not through a second threshold — one knob per outcome.
  tripListThreshold: 2,

  // --- utility terms (§5.1) ---------------------------------------------------
  // index -> fit mapping: fit = clamp01(priceFitNeutral + (1 - index)).
  // An index of 1.0 (at reference price) maps to priceFitNeutral, and the mapping
  // discriminates in BOTH directions — a loss leader must not be indistinguishable
  // from a modest discount.
  priceFitNeutral: 0.5,

  // STUB: the `cleanliness` system in PLAN.md §4 does not exist yet, so the player
  // store's ambiance term has no real input. A real term with a fake input, not a
  // fake term. Revisit when cleanliness lands.
  playerAmbiance: 0.5,

  // --- loyalty (§5.2) ---------------------------------------------------------
  loyaltyAlpha: 0.06,          // α — learning rate on (satisfaction - S̄)
  meanSatisfactionLambda: 0.1, // λ — how fast a household's expectation S̄ adapts
  loyaltyDecayDefault: 0.004,  // δ per day; RivalStore.loyaltyDecay overrides (bosses)
  decayCapDays: 30,            // decay(d) = min(d, cap) / cap
  initialLoyalty: 0.2,
  initialMeanSatisfaction: 0.5,

  // --- word of mouth (§5.3) ---------------------------------------------------
  womNeighbors: 3,             // k
  womDelta: 0.006,             // ω — an order of magnitude below α; hearsay must not
                               // outweigh having actually shopped somewhere
  delightThreshold: 0.85,
  disgustThreshold: 0.25,

  // --- rival trip resolution (§5.8, reduced fidelity) -------------------------
  // Weights over a rival's authored terms. Sum to 1 so the result is already in [0,1]
  // before clamping.
  rivalSatisfactionWeights: {
    quality: 0.3,
    service: 0.2,
    ambiance: 0.1,
    assortment: 0.2,
    price: 0.2,
  },
}
```

- [ ] **Step 4: Add the authored fields to existing content**

In `content/rivals/sav-a-lott.json5`, after `ambiance: 0.1,`:

```json5
  // Phase 2.0c. Cheap and narrow is mechanically what "dying deep-discounter" means:
  // it wins priceHunter and student households on price and loses everyone else on
  // breadth. §5.8's priceAggression is what will move priceIndex next phase.
  priceIndex: 0.82,
  assortmentBreadth: 0.45,
```

In `content/balance/segments.json5`, add a `brandAffinity` map to each of the seven entries, beside `consumptionMultiplier`. Update the file header to mention it. Values:

```json5
  // priceHunter
  brandAffinity: { player: 0.0, 'deep-discount': 0.4 },
  // convenience
  brandAffinity: { player: 0.1, 'deep-discount': 0.0 },
  // family
  brandAffinity: { player: 0.1, 'deep-discount': 0.1 },
  // foodie
  brandAffinity: { player: 0.3, 'deep-discount': -0.3 },
  // bulk
  brandAffinity: { player: 0.0, 'deep-discount': 0.3 },
  // senior
  brandAffinity: { player: 0.2, 'deep-discount': 0.0 },
  // student
  brandAffinity: { player: 0.0, 'deep-discount': 0.35 },
```

- [ ] **Step 5: Extend the types**

In `src/sim/systems/market/types.ts`, add to `RivalStore` after `ambiance`:

```typescript
  /** Basket cost relative to catalog reference prices. < 1 is cheaper than reference. */
  readonly priceIndex: number;
  /** Fraction of a typical household's list this store carries — [0,1]. */
  readonly assortmentBreadth: number;
  /**
   * Per-store loyalty decay δ (§5.2). Omitted here; the default from market.json5
   * applies. The override exists for bosses — "Trailblazer Jim's runs δ/5" is
   * mechanically what a cult is — and is deliberately unused in phase 2.0c.
   */
  readonly loyaltyDecay?: number;
```

Add to `SegmentDef`:

```typescript
  /** βb's input, keyed by store `identity`. An absent identity is neutral (0). */
  readonly brandAffinity: Readonly<Record<string, number>>;
```

- [ ] **Step 6: Extend the schemas**

In `src/sim/systems/market/config.ts`, add to `RivalStoreSchema`:

```typescript
  priceIndex: z.number().positive(),
  assortmentBreadth: z.number().min(0).max(1),
  loyaltyDecay: z.number().min(0).max(1).optional(),
```

Add to `SegmentDefSchema`:

```typescript
  brandAffinity: z.record(z.string(), z.number().finite()),
```

Then append the market config schema and loader, mirroring `parseSegmentConfig`'s shape:

```typescript
import marketRaw from '../../../../content/balance/market.json5?raw';

const MarketConfigSchema = z
  .object({
    tripListThreshold: z.number().int().positive(),
    priceFitNeutral: z.number().min(0).max(1),
    playerAmbiance: z.number().min(0).max(1),
    loyaltyAlpha: z.number().positive().max(1),
    meanSatisfactionLambda: z.number().positive().max(1),
    loyaltyDecayDefault: z.number().min(0).max(1),
    decayCapDays: z.number().int().positive(),
    initialLoyalty: z.number().min(0).max(1),
    initialMeanSatisfaction: z.number().min(0).max(1),
    womNeighbors: z.number().int().positive(),
    womDelta: z.number().min(0).max(1),
    delightThreshold: z.number().min(0).max(1),
    disgustThreshold: z.number().min(0).max(1),
    rivalSatisfactionWeights: z.object({
      quality: z.number().min(0),
      service: z.number().min(0),
      ambiance: z.number().min(0),
      assortment: z.number().min(0),
      price: z.number().min(0),
    }),
  })
  .refine((c) => c.delightThreshold > c.disgustThreshold, {
    message: 'delightThreshold must exceed disgustThreshold',
  })
  .refine((c) => c.womDelta < c.loyaltyAlpha, {
    message: 'womDelta must be smaller than loyaltyAlpha — hearsay cannot outweigh a real trip',
  });

export type MarketConfig = z.infer<typeof MarketConfigSchema>;

export function parseMarketConfig(raw: unknown): MarketConfig {
  return MarketConfigSchema.parse(raw);
}

export const DEFAULT_MARKET_CONFIG: MarketConfig = parseMarketConfig(JSON5.parse(marketRaw));
```

Export `DEFAULT_MARKET_CONFIG`, `parseMarketConfig`, and the `MarketConfig` type from `src/sim/systems/market/index.ts` and `src/sim/index.ts`.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/sim/systems/market/`
Expected: PASS.

- [ ] **Step 8: Verify no golden hash moved**

Run: `npx vitest run tests/golden/`
Expected: PASS. Config is not hashed; if a golden moved here, something else changed and you must find it before continuing.

- [ ] **Step 9: Commit**

```bash
git add content/balance/market.json5 content/balance/segments.json5 content/rivals/sav-a-lott.json5 src/sim/systems/market/ src/sim/index.ts
git commit -m "feat(content): phase 2.0c balance constants, rival price/assortment, brand affinity"
```

---

## Task 2: Move `Household` from `shoppers/` to `market/`

Mechanical relocation plus a `MarketSystem` skeleton that owns households and nothing else. **No new behaviour.** The world hash moves because household bytes are written by a system registered earlier in the order — tick counts, event sequences, and shopper behaviour must all be identical.

**Files:**
- Create: `src/sim/systems/market/household.ts`, `src/sim/systems/market/household.test.ts`, `src/sim/systems/market/system.ts`, `src/sim/systems/market/system.test.ts`
- Delete: `src/sim/systems/shoppers/household.ts`, `src/sim/systems/shoppers/household.test.ts`
- Modify: `src/sim/systems/shoppers/{system,types,index}.ts`, `src/sim/systems/market/{types,index}.ts`, `src/sim/index.ts`, `src/bridge/build-bridge.ts`, `tests/golden/scenarios.ts`
- Test: `src/sim/systems/market/{household,system}.test.ts`

**Interfaces:**
- Consumes: `MarketConfig`, `DEFAULT_SEGMENT_CONFIG`, `consumptionMultiplierFor` (Task 1).
- Produces:
  - `Household` (moved verbatim: `id`, `segment`, `position`, `pantry`, `list`) now exported from `market/`.
  - `deriveShoppingList(pantry, catalog): readonly string[]` and `advancePantryDay(household, catalog, segmentConfig): Household` — moved verbatim.
  - `class MarketSystem implements System` with `readonly name = 'market'`, `household(id: number): Household`, `householdIds(): readonly number[]`, and `hasHousehold(id: number): boolean`. Claims the `addHousehold` command.

- [ ] **Step 1: Move the pantry module**

```bash
git mv src/sim/systems/shoppers/household.ts src/sim/systems/market/household.ts
git mv src/sim/systems/shoppers/household.test.ts src/sim/systems/market/household.test.ts
```

Fix imports in the moved files: `../market/index.js` becomes `./index.js`, and `./types.js` still resolves (`Household` moves into `market/types.ts` in the next step). Update `import type { GoodDef } from '../goods/types.js'` — the relative depth is unchanged, so it still works.

- [ ] **Step 2: Move the `Household` interface**

Cut the `Household` interface from `src/sim/systems/shoppers/types.ts` and paste it verbatim into `src/sim/systems/market/types.ts`. `market/types.ts` already declares `Position` and `Segment` locally, so drop the now-unneeded import. In `shoppers/types.ts`, remove the now-unused `Position`/`Segment` import if nothing else uses it.

- [ ] **Step 3: Write the failing `MarketSystem` test**

Create `src/sim/systems/market/system.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { MarketSystem } from './system.js';

function worldWithMarket(): { world: World; market: MarketSystem } {
  const world = new World({ seed: 1 });
  const market = new MarketSystem();
  world.register(market);
  return { world, market };
}

describe('MarketSystem household ownership', () => {
  it('claims addHousehold and stores the household', () => {
    const { world, market } = worldWithMarket();
    world.commands.push({ type: 'addHousehold', householdId: 7, segment: 'family', position: { x: 2, y: 3 } });
    world.step();
    expect(market.household(7).segment).toBe('family');
    expect(market.household(7).position).toEqual({ x: 2, y: 3 });
  });

  it('throws for an unknown household id', () => {
    const { market } = worldWithMarket();
    expect(() => market.household(99)).toThrow('Unknown household id: 99');
  });

  it('returns household ids in ascending order regardless of insertion order', () => {
    const { world, market } = worldWithMarket();
    for (const id of [5, 1, 3]) {
      world.commands.push({ type: 'addHousehold', householdId: id, segment: 'family', position: { x: 0, y: 0 } });
    }
    world.step();
    expect(market.householdIds()).toEqual([1, 3, 5]);
  });

  it('depletes pantries once per sim day', () => {
    const { world, market } = worldWithMarket();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    const dayZero = market.household(1).pantry['milk'] ?? 1;
    for (let i = 0; i < 1440; i++) world.step();
    expect(market.household(1).pantry['milk']!).toBeLessThan(dayZero);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npx vitest run src/sim/systems/market/system.test.ts`
Expected: FAIL — cannot resolve `./system.js`.

- [ ] **Step 5: Write `MarketSystem`**

Create `src/sim/systems/market/system.ts`:

```typescript
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Command } from '../../core/commands.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import type { GoodDef } from '../goods/types.js';
import { DEFAULT_SEGMENT_CONFIG } from './config.js';
import type { SegmentConfig } from './config.js';
import { advancePantryDay, deriveShoppingList } from './household.js';
import type { Household } from './types.js';

/**
 * The market (PLAN.md §5.1, §16 phase 2.0c).
 *
 * Owns households — pantry, shopping list, segment, and catchment position. Phase 1.6
 * put these in `ShoppersSystem` because the in-store agent was their only consumer;
 * store choice inverts that, since the scheduler must reason about a household before
 * any shopper exists. `ShoppersSystem` is left owning the in-store agent alone.
 *
 * This task is the relocation only. Scheduling and the logit arrive in a later task.
 */
export class MarketSystem implements System {
  readonly name = 'market';
  readonly #catalog: readonly GoodDef[];
  readonly #segments: SegmentConfig;
  readonly #households = new Map<number, Household>();

  constructor(catalog: readonly GoodDef[] = DEFAULT_GOODS_CATALOG, segments: SegmentConfig = DEFAULT_SEGMENT_CONFIG) {
    this.#catalog = catalog;
    this.#segments = segments;
  }

  update(world: World): void {
    if (world.tick % TICKS_PER_SIM_DAY !== 0) return;
    for (const id of this.householdIds()) {
      this.#households.set(id, advancePantryDay(this.#households.get(id)!, this.#catalog, this.#segments));
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const ids = this.householdIds();
    hasher.u32(ids.length);
    for (const id of ids) {
      const household = this.#households.get(id)!;
      hasher.u32(id).str(household.segment).i32(household.position.x).i32(household.position.y);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
      hasher.u32(household.list.length);
      for (const goodId of household.list) hasher.str(goodId);
    }
  }

  applyCommand(_world: World, command: Command): boolean {
    if (command.type !== 'addHousehold') return false;
    this.#households.set(command.householdId, {
      id: command.householdId,
      segment: command.segment,
      position: command.position,
      pantry: {},
      list: deriveShoppingList({}, this.#catalog),
    });
    return true;
  }

  household(id: number): Household {
    const household = this.#households.get(id);
    if (!household) throw new Error(`Unknown household id: ${id}`);
    return household;
  }

  hasHousehold(id: number): boolean {
    return this.#households.has(id);
  }

  /** Ascending — never Map insertion order, since this drives hashing and RNG draws. */
  householdIds(): readonly number[] {
    return [...this.#households.keys()].sort((a, b) => a - b);
  }
}
```

The `hash` body is copied byte-for-byte in field order from `ShoppersSystem#hash`'s household block. Do not "tidy" it — keeping it identical is what makes the re-baseline in Step 9 attributable to position alone.

- [ ] **Step 6: Strip households out of `ShoppersSystem`**

In `src/sim/systems/shoppers/system.ts`:

1. Delete the `#households` field, the `addHousehold` case in `applyCommand`, the daily pantry block in `update`, and the household block in `hash` (the first block, through the closing brace before `stockedInstanceIds`).
2. Add `market: MarketSystem` as the **first** constructor parameter, stored as `readonly #market: MarketSystem`.
3. Replace `this.#households.get(command.householdId)` in the `spawnShopper` case with:

```typescript
        if (!this.#market.hasHousehold(command.householdId)) {
          throw new Error(`Unknown household id: ${command.householdId}`);
        }
        const household = this.#market.household(command.householdId);
```

4. Replace the `household(id)` accessor with a delegating one so existing callers keep working:

```typescript
  /** Delegates to `MarketSystem`, which has owned households since phase 2.0c. */
  household(id: number): Household {
    return this.#market.household(id);
  }
```

5. Update imports: `Household` now comes from `../market/types.js`; drop `advancePantryDay`/`deriveShoppingList` and `TICKS_PER_SIM_DAY` if now unused.

- [ ] **Step 7: Update every construction site**

`ShoppersSystem`'s constructor gains a leading argument. Update, in this order:

- `src/bridge/build-bridge.ts` — add `#market`, register it after `#economy` and before `#shoppers`:

```typescript
    this.#market = new MarketSystem();
    this.#world.register(this.#market);
    this.#shoppers = new ShoppersSystem(
      this.#market,
      this.#grid.grid,
      this.#pathing,
      this.#inventory,
      this.#checkout,
      this.#economy,
    );
```

- `tests/golden/scenarios.ts` — in `shopper-trip` only, mirroring the above. Leave every other scenario untouched; they register no market and their hashes must not move.
- `src/sim/systems/shoppers/system.test.ts` and any other test constructing `ShoppersSystem`. Find them with `npx vitest run` and fix what fails to compile.
- `src/sim/index.ts` — export `MarketSystem`, and move the `Household` type export from the `shoppers/` block to the `market/` block. Move `advancePantryDay`/`deriveShoppingList` exports likewise.

- [ ] **Step 8: Run the full suite except goldens**

Run: `npx vitest run --exclude 'tests/golden/**'`
Expected: PASS. Every behavioural test must pass unchanged — this task moved code, it did not change what the code does. A behavioural test that now fails means Step 6 dropped something.

- [ ] **Step 9: Commit the move, then re-baseline separately**

First, the code, with goldens still red:

```bash
git add -A src/ tests/golden/scenarios.ts
git commit -m "refactor(sim): MarketSystem owns households; ShoppersSystem owns the agent

Phase 1.6 put households in ShoppersSystem because the in-store agent was
their only consumer. The store-choice scheduler must reason about a household
before any shopper exists, so ownership moves to the new MarketSystem.

Behaviour is unchanged. The shopper-trip golden hash moves only because
household bytes are now written by a system registered earlier in the order;
the hash body was copied field-for-field. Re-baselined in the next commit."
```

Then confirm the change is positional, not behavioural, before touching the baseline:

Run: `npx vitest run tests/golden/`
Expected: **only** `shopper-trip` fails. If any other scenario moved, stop — that is a real bug, not a positional shift.

Then re-baseline in its own commit touching nothing else:

```bash
npx vitest run tests/golden/ -u
git add tests/golden/hashes.json
git commit -m "test(golden): re-baseline shopper-trip — household bytes moved systems

Household state is now hashed by MarketSystem, registered before ShoppersSystem,
so the same bytes appear earlier in the stream. Tick count, event sequence, and
shopper behaviour are all unchanged; the other seven scenarios were confirmed
byte-identical before this baseline was rewritten."
```

- [ ] **Step 10: Verify**

Run: `npm run verify`
Expected: all green.

---

## Task 3: The pure store-choice logit

No system, no world, no state. `choice.ts` is a pure module so the model can be tested exhaustively without constructing a simulation.

**Files:**
- Create: `src/sim/systems/market/choice.ts`, `src/sim/systems/market/choice.test.ts`
- Modify: `src/sim/systems/market/index.ts`

**Interfaces:**
- Consumes: `UtilityWeights` (`market/types.ts`), `MarketConfig` (Task 1).
- Produces:

```typescript
export interface StoreTerms {
  readonly storeId: string;
  readonly priceFit: number;
  readonly assortmentFit: number;
  readonly quality: number;
  readonly service: number;
  readonly ambiance: number;
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
}

export function indexToFit(index: number, neutral: number): number;
export function storeUtility(terms: StoreTerms, weights: UtilityWeights): number;
export function softmax(utilities: readonly number[], temperature: number): number[];
export function chooseStore(probabilities: readonly number[], draw: number): number;
```

- [ ] **Step 1: Write the failing tests**

Create `src/sim/systems/market/choice.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { chooseStore, indexToFit, softmax, storeUtility, type StoreTerms } from './choice.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_SEGMENT_CONFIG } from './config.js';

const flatTerms = (storeId: string, overrides: Partial<StoreTerms> = {}): StoreTerms => ({
  storeId,
  priceFit: 0.5,
  assortmentFit: 0.5,
  quality: 0.5,
  service: 0.5,
  ambiance: 0.5,
  loyalty: 0.5,
  brandAffinity: 0,
  travelCost: 0,
  ...overrides,
});

describe('indexToFit', () => {
  it('maps an at-reference index to the neutral value', () => {
    expect(indexToFit(1, 0.5)).toBeCloseTo(0.5);
  });

  it('discriminates in both directions', () => {
    // The whole point: a loss leader must not be indistinguishable from a small discount.
    expect(indexToFit(0.7, 0.5)).toBeCloseTo(0.8);
    expect(indexToFit(1.3, 0.5)).toBeCloseTo(0.2);
    expect(indexToFit(0.7, 0.5)).toBeGreaterThan(indexToFit(0.9, 0.5));
  });

  it('clamps to [0,1] at the extremes', () => {
    expect(indexToFit(0.01, 0.5)).toBe(1);
    expect(indexToFit(5, 0.5)).toBe(0);
  });
});

describe('storeUtility', () => {
  it('subtracts travel cost rather than adding it', () => {
    const weights = DEFAULT_SEGMENT_CONFIG.get('convenience')!.weights;
    const near = storeUtility(flatTerms('a', { travelCost: 0 }), weights);
    const far = storeUtility(flatTerms('a', { travelCost: 10 }), weights);
    expect(far).toBeLessThan(near);
  });

  it('weights each term by its own beta', () => {
    const weights = DEFAULT_SEGMENT_CONFIG.get('foodie')!.weights;
    const base = storeUtility(flatTerms('a'), weights);
    const better = storeUtility(flatTerms('a', { quality: 1 }), weights);
    expect(better - base).toBeCloseTo(weights.quality * 0.5);
  });
});

describe('softmax', () => {
  it('produces a distribution summing to 1', () => {
    const p = softmax([1, 2, 3], 1);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('is numerically stable for utilities that would overflow exp', () => {
    // τ = 0.05 divides these into the hundreds. Without the max-subtraction this
    // returns NaN, which would silently corrupt every downstream choice.
    const p = softmax([40, 10], 0.05);
    expect(p.every(Number.isFinite)).toBe(true);
    expect(p[0]).toBeCloseTo(1);
  });

  it('approaches winner-take-all as temperature falls', () => {
    const decisive = softmax([1, 0.9], 0.05);
    const diffuse = softmax([1, 0.9], 10);
    expect(decisive[0]!).toBeGreaterThan(diffuse[0]!);
    expect(diffuse[0]!).toBeCloseTo(0.5, 1);
  });

  it('is uniform when every utility is equal', () => {
    expect(softmax([2, 2, 2], 1)).toEqual([1 / 3, 1 / 3, 1 / 3].map(() => expect.closeTo(1 / 3)) as never);
  });
});

describe('chooseStore', () => {
  it('walks the cumulative distribution', () => {
    expect(chooseStore([0.25, 0.5, 0.25], 0.1)).toBe(0);
    expect(chooseStore([0.25, 0.5, 0.25], 0.5)).toBe(1);
    expect(chooseStore([0.25, 0.5, 0.25], 0.9)).toBe(2);
  });

  it('returns the last index when the draw lands on the boundary', () => {
    // Guards against floating-point summation leaving a cumulative total just under 1.
    expect(chooseStore([0.5, 0.5], 1)).toBe(1);
  });
});

describe('the model end to end', () => {
  it('sends a priceHunter to the cheaper store and a foodie to the better one', () => {
    const cheap = flatTerms('cheap', { priceFit: 0.95, quality: 0.2, assortmentFit: 0.3 });
    const good = flatTerms('good', { priceFit: 0.2, quality: 0.95, assortmentFit: 0.9 });
    const config = DEFAULT_MARKET_CONFIG;
    expect(config.priceFitNeutral).toBeGreaterThan(0); // config is wired, not hardcoded

    const hunter = DEFAULT_SEGMENT_CONFIG.get('priceHunter')!.weights;
    const hunterP = softmax([storeUtility(cheap, hunter), storeUtility(good, hunter)], hunter.temperature);
    expect(hunterP[0]!).toBeGreaterThan(hunterP[1]!);

    const foodie = DEFAULT_SEGMENT_CONFIG.get('foodie')!.weights;
    const foodieP = softmax([storeUtility(cheap, foodie), storeUtility(good, foodie)], foodie.temperature);
    expect(foodieP[1]!).toBeGreaterThan(foodieP[0]!);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/systems/market/choice.test.ts`
Expected: FAIL — cannot resolve `./choice.js`.

- [ ] **Step 3: Implement `choice.ts`**

```typescript
import type { UtilityWeights } from './types.js';

/**
 * Store choice (PLAN.md §5.1) — the pure model. No world, no RNG, no state.
 *
 * ## Why there is no Gumbel ε term here
 *
 * §5.1 writes both `+ ε` (seeded Gumbel noise) and `P = exp(U/τ) / Σ exp(U/τ)`. Those
 * are the same thing written twice: the softmax IS the closed form of "add i.i.d.
 * Gumbel noise to each utility and take the argmax". Implementing both would apply the
 * noise twice and quietly widen the distribution past what τ claims.
 *
 * So `storeUtility` deliberately omits ε, and randomness enters exactly once, where
 * `chooseStore` consumes a single uniform draw. Do not "restore" the missing epsilon.
 *
 * Computing the probabilities explicitly (rather than using the Gumbel-max trick, which
 * would choose without ever materialising them) is also what lets §12.4's
 * share-of-wallet KPIs and the rival-intel panel show real numbers.
 */

/** One store's inputs to `U(h,s)`, already normalised to the units the weights expect. */
export interface StoreTerms {
  readonly storeId: string;
  readonly priceFit: number;
  readonly assortmentFit: number;
  readonly quality: number;
  readonly service: number;
  readonly ambiance: number;
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Maps a cost index (1.0 = at reference) onto a [0,1] fit.
 *
 * `clamp01(neutral + (1 - index))`, not `clamp01(2 - index)`: the latter saturates at 1
 * for every price at or below reference, which would make a loss leader look identical
 * to a modest discount — precisely the signal store choice exists to carry.
 */
export function indexToFit(index: number, neutral: number): number {
  return clamp01(neutral + (1 - index));
}

export function storeUtility(terms: StoreTerms, weights: UtilityWeights): number {
  return (
    weights.priceFit * terms.priceFit +
    weights.assortmentFit * terms.assortmentFit +
    weights.quality * terms.quality +
    weights.service * terms.service +
    weights.ambiance * terms.ambiance +
    weights.loyalty * terms.loyalty +
    weights.brandAffinity * terms.brandAffinity -
    weights.travelCost * terms.travelCost
  );
}

/**
 * `P(h → s) = exp(U/τ) / Σ exp(U/τ)`.
 *
 * The max-subtraction is required, not defensive: a decisive segment might tune τ to
 * 0.05, which scales utilities into the hundreds, and `exp(800)` is `Infinity`.
 * Subtracting the max leaves the ratios identical and the largest exponent at exactly 0.
 */
export function softmax(utilities: readonly number[], temperature: number): number[] {
  if (utilities.length === 0) return [];
  const scaled = utilities.map((u) => u / temperature);
  const max = Math.max(...scaled);
  const exponentials = scaled.map((s) => Math.exp(s - max));
  const total = exponentials.reduce((a, b) => a + b, 0);
  return exponentials.map((e) => e / total);
}

/**
 * Picks an index by walking the cumulative distribution with one uniform draw in [0,1).
 *
 * Falls through to the last index rather than returning -1: floating-point summation can
 * leave the cumulative total a hair under 1, and a draw in that sliver must still be a
 * valid store.
 */
export function chooseStore(probabilities: readonly number[], draw: number): number {
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i] ?? 0;
    if (draw < cumulative) return i;
  }
  return probabilities.length - 1;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/sim/systems/market/choice.test.ts`
Expected: PASS. Fix the `softmax` uniform-distribution assertion if the `expect.closeTo` form is awkward — a plain `p.forEach((v) => expect(v).toBeCloseTo(1/3))` is fine.

- [ ] **Step 5: Export and commit**

Add `indexToFit`, `storeUtility`, `softmax`, `chooseStore`, and `type StoreTerms` to `src/sim/systems/market/index.ts` and `src/sim/index.ts`.

```bash
git add src/sim/systems/market/choice.ts src/sim/systems/market/choice.test.ts src/sim/systems/market/index.ts src/sim/index.ts
git commit -m "feat(market): pure multinomial-logit store choice (PLAN.md §5.1)"
```

---

## Task 4: `LoyaltySystem`

A complete `System`, fully tested, **registered nowhere yet**. It therefore cannot move a golden hash.

**Files:**
- Create: `src/sim/systems/loyalty/{types.ts,system.ts,index.ts,system.test.ts}`
- Modify: `src/sim/index.ts`

**Interfaces:**
- Consumes: `MarketConfig` (Task 1), `RivalStore` (Task 1).
- Produces:

```typescript
export interface TripOutcome {
  readonly householdId: number;
  readonly storeIndex: number;   // 0 = player, 1..n rivals in roster order
  readonly satisfaction: number;
}

export class LoyaltySystem implements System {
  readonly name = 'loyalty';
  constructor(market: MarketReader, rivals: readonly RivalStore[], config?: MarketConfig);
  get(householdId: number, storeIndex: number): number;
  meanSatisfaction(householdId: number): number;
  daysSinceVisit(householdId: number, storeIndex: number): number;
  recordTrip(outcome: TripOutcome): void;
  nudge(householdId: number, storeIndex: number, delta: number): void;
  readonly storeCount: number;
}
```

`MarketReader` is the minimal read interface `LoyaltySystem` needs, declared in `loyalty/types.ts` so `loyalty/` does not import `MarketSystem` and create a cycle:

```typescript
export interface MarketReader {
  householdIds(): readonly number[];
  pendingOutcomes(): readonly TripOutcome[];
}
```

- [ ] **Step 1: Write the failing tests**

Create `src/sim/systems/loyalty/system.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from '../market/config.js';
import { LoyaltySystem } from './system.js';
import type { MarketReader, TripOutcome } from './types.js';

class FakeMarket implements MarketReader {
  outcomes: TripOutcome[] = [];
  constructor(private readonly ids: number[]) {}
  householdIds(): readonly number[] {
    return this.ids;
  }
  pendingOutcomes(): readonly TripOutcome[] {
    return this.outcomes;
  }
}

function setup(ids = [1, 2]): { world: World; market: FakeMarket; loyalty: LoyaltySystem } {
  const world = new World({ seed: 1 });
  const market = new FakeMarket(ids);
  const loyalty = new LoyaltySystem(market, DEFAULT_RIVAL_STORES);
  world.register(loyalty);
  return { world, market, loyalty };
}

describe('LoyaltySystem state', () => {
  it('indexes the player at 0 and rivals from 1', () => {
    const { loyalty } = setup();
    expect(loyalty.storeCount).toBe(DEFAULT_RIVAL_STORES.length + 1);
  });

  it('starts every household at the authored initial loyalty', () => {
    const { loyalty } = setup();
    expect(loyalty.get(1, 0)).toBeCloseTo(DEFAULT_MARKET_CONFIG.initialLoyalty);
  });
});

describe('per-trip update (§5.2)', () => {
  it('raises loyalty when satisfaction beats the household expectation', () => {
    const { loyalty } = setup();
    const before = loyalty.get(1, 0);
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.9 });
    expect(loyalty.get(1, 0)).toBeGreaterThan(before);
  });

  it('lowers loyalty when satisfaction falls short of it', () => {
    const { loyalty } = setup();
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.9 });
    const raised = loyalty.get(1, 0);
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.1 });
    expect(loyalty.get(1, 0)).toBeLessThan(raised);
  });

  it('moves the household expectation toward observed satisfaction', () => {
    // Without this, S̄ stays frozen at its initial constant and α stops meaning
    // anything after the first few trips.
    const { loyalty } = setup();
    const before = loyalty.meanSatisfaction(1);
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    expect(loyalty.meanSatisfaction(1)).toBeGreaterThan(before);
  });

  it('clamps to [0,1] under repeated delight', () => {
    const { loyalty } = setup();
    for (let i = 0; i < 500; i++) loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    expect(loyalty.get(1, 0)).toBeLessThanOrEqual(1);
    expect(loyalty.get(1, 0)).toBeGreaterThanOrEqual(0);
  });

  it('resets days-since-visit for the visited store only', () => {
    const { world, market, loyalty } = setup();
    for (let i = 0; i < 1440 * 3; i++) world.step();
    expect(loyalty.daysSinceVisit(1, 0)).toBeGreaterThan(0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.5 }];
    world.step();
    expect(loyalty.daysSinceVisit(1, 0)).toBe(0);
    expect(loyalty.daysSinceVisit(1, 1)).toBeGreaterThan(0);
  });
});

describe('daily decay (§5.2)', () => {
  it('decays loyalty monotonically across absent days and stops at zero', () => {
    const { world, loyalty } = setup();
    loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });
    const start = loyalty.get(1, 0);
    for (let i = 0; i < 1440 * 10; i++) world.step();
    const after = loyalty.get(1, 0);
    expect(after).toBeLessThan(start);
    for (let i = 0; i < 1440 * 400; i++) world.step();
    expect(loyalty.get(1, 0)).toBe(0);
  });
});

describe('word-of-mouth nudges', () => {
  it('applies a signed delta and stays clamped', () => {
    const { loyalty } = setup();
    const before = loyalty.get(2, 1);
    loyalty.nudge(2, 1, DEFAULT_MARKET_CONFIG.womDelta);
    expect(loyalty.get(2, 1)).toBeCloseTo(before + DEFAULT_MARKET_CONFIG.womDelta);
    loyalty.nudge(2, 1, -10);
    expect(loyalty.get(2, 1)).toBe(0);
  });
});

describe('determinism', () => {
  it('hashes identically for identical histories', () => {
    const a = setup();
    const b = setup();
    a.loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.7 });
    b.loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 0.7 });
    for (let i = 0; i < 1440 * 2; i++) {
      a.world.step();
      b.world.step();
    }
    expect(a.world.hash).toBe(b.world.hash);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/systems/loyalty/`
Expected: FAIL — cannot resolve `./system.js`.

- [ ] **Step 3: Write `loyalty/types.ts`**

```typescript
/**
 * A completed trip, player store or rival. The two paths converge here deliberately:
 * downstream of this type, a rival trip is not a special case.
 */
export interface TripOutcome {
  readonly householdId: number;
  /** 0 = the player's store; 1..n = rivals in authored roster order. */
  readonly storeIndex: number;
  readonly satisfaction: number;
}

/**
 * The slice of `MarketSystem` that loyalty and reputation read.
 *
 * Declared here rather than importing `MarketSystem` so `loyalty/` and `reputation/`
 * do not form an import cycle with `market/`, which depends on `loyalty/`.
 */
export interface MarketReader {
  householdIds(): readonly number[];
  pendingOutcomes(): readonly TripOutcome[];
}
```

- [ ] **Step 4: Write `loyalty/system.ts`**

```typescript
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import { DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { MarketConfig } from '../market/config.js';
import type { RivalStore } from '../market/types.js';
import type { MarketReader, TripOutcome } from './types.js';

/**
 * Loyalty (PLAN.md §5.2).
 *
 * `L'(h,s) = clamp01( L + α·(satisfaction − S̄(h)) − δ·decay(daysSinceVisit) )`
 *
 * The subtraction is the mechanic: loyalty tracks satisfaction *relative to what this
 * household has come to expect*. A consistently mediocre store keeps its regulars; a
 * good store that slips loses them.
 *
 * Sole writer of its arrays. `MarketSystem` (trip outcomes) and `ReputationSystem`
 * (diffusion) call in rather than mutating — one place to reason about clamping, and
 * one place for a boss to cheat on δ next phase.
 */
export class LoyaltySystem implements System {
  readonly name = 'loyalty';
  readonly storeCount: number;
  readonly #market: MarketReader;
  readonly #config: MarketConfig;
  /** Per-store δ, indexed like the store axis. Index 0 (player) always takes the default. */
  readonly #decay: readonly number[];
  #loyalty = new Float32Array(0);
  #meanSatisfaction = new Float32Array(0);
  #daysSinceVisit = new Uint16Array(0);
  #index = new Map<number, number>();

  constructor(market: MarketReader, rivals: readonly RivalStore[], config: MarketConfig = DEFAULT_MARKET_CONFIG) {
    this.#market = market;
    this.#config = config;
    this.storeCount = rivals.length + 1;
    this.#decay = [config.loyaltyDecayDefault, ...rivals.map((r) => r.loyaltyDecay ?? config.loyaltyDecayDefault)];
  }

  update(world: World): void {
    this.#sync();
    for (const outcome of this.#market.pendingOutcomes()) this.recordTrip(outcome);
    if (world.tick % TICKS_PER_SIM_DAY === 0) this.#decayDay();
  }

  hash(_world: World, hasher: Hasher): void {
    hasher.u32(this.#loyalty.length);
    for (const value of this.#loyalty) hasher.f64(value);
    for (const value of this.#meanSatisfaction) hasher.f64(value);
    for (const value of this.#daysSinceVisit) hasher.u32(value);
  }

  get(householdId: number, storeIndex: number): number {
    return this.#loyalty[this.#slot(householdId, storeIndex)] ?? 0;
  }

  meanSatisfaction(householdId: number): number {
    this.#sync();
    return this.#meanSatisfaction[this.#row(householdId)] ?? this.#config.initialMeanSatisfaction;
  }

  daysSinceVisit(householdId: number, storeIndex: number): number {
    return this.#daysSinceVisit[this.#slot(householdId, storeIndex)] ?? 0;
  }

  recordTrip(outcome: TripOutcome): void {
    this.#sync();
    const row = this.#row(outcome.householdId);
    const slot = row * this.storeCount + outcome.storeIndex;
    const expectation = this.#meanSatisfaction[row] ?? this.#config.initialMeanSatisfaction;
    const surprise = outcome.satisfaction - expectation;
    this.#loyalty[slot] = clamp01((this.#loyalty[slot] ?? 0) + this.#config.loyaltyAlpha * surprise);
    this.#meanSatisfaction[row] = expectation + this.#config.meanSatisfactionLambda * surprise;
    this.#daysSinceVisit[slot] = 0;
  }

  nudge(householdId: number, storeIndex: number, delta: number): void {
    const slot = this.#slot(householdId, storeIndex);
    this.#loyalty[slot] = clamp01((this.#loyalty[slot] ?? 0) + delta);
  }

  #decayDay(): void {
    for (let row = 0; row < this.#index.size; row++) {
      for (let store = 0; store < this.storeCount; store++) {
        const slot = row * this.storeCount + store;
        const days = Math.min((this.#daysSinceVisit[slot] ?? 0) + 1, 0xffff);
        this.#daysSinceVisit[slot] = days;
        const fraction = Math.min(days, this.#config.decayCapDays) / this.#config.decayCapDays;
        this.#loyalty[slot] = clamp01((this.#loyalty[slot] ?? 0) - (this.#decay[store] ?? 0) * fraction);
      }
    }
  }

  /** Grows the arrays to cover every household the market knows about. Ascending ids. */
  #sync(): void {
    const ids = this.#market.householdIds();
    if (ids.length === this.#index.size) return;
    const loyalty = new Float32Array(ids.length * this.storeCount).fill(this.#config.initialLoyalty);
    const mean = new Float32Array(ids.length).fill(this.#config.initialMeanSatisfaction);
    const days = new Uint16Array(ids.length * this.storeCount);
    const index = new Map<number, number>();
    ids.forEach((id, row) => {
      index.set(id, row);
      const old = this.#index.get(id);
      if (old === undefined) return;
      mean[row] = this.#meanSatisfaction[old] ?? this.#config.initialMeanSatisfaction;
      for (let store = 0; store < this.storeCount; store++) {
        loyalty[row * this.storeCount + store] = this.#loyalty[old * this.storeCount + store] ?? 0;
        days[row * this.storeCount + store] = this.#daysSinceVisit[old * this.storeCount + store] ?? 0;
      }
    });
    this.#loyalty = loyalty;
    this.#meanSatisfaction = mean;
    this.#daysSinceVisit = days;
    this.#index = index;
  }

  #row(householdId: number): number {
    this.#sync();
    const row = this.#index.get(householdId);
    if (row === undefined) throw new Error(`Unknown household id: ${householdId}`);
    return row;
  }

  #slot(householdId: number, storeIndex: number): number {
    if (storeIndex < 0 || storeIndex >= this.storeCount) {
      throw new Error(`Unknown store index: ${storeIndex}`);
    }
    return this.#row(householdId) * this.storeCount + storeIndex;
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
```

Create `src/sim/systems/loyalty/index.ts`:

```typescript
export { LoyaltySystem } from './system.js';
export type { MarketReader, TripOutcome } from './types.js';
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/sim/systems/loyalty/`
Expected: PASS.

- [ ] **Step 6: Confirm no golden moved**

Run: `npx vitest run tests/golden/`
Expected: PASS — nothing registers `LoyaltySystem` yet.

- [ ] **Step 7: Commit**

Export `LoyaltySystem` and `type TripOutcome` from `src/sim/index.ts`.

```bash
git add src/sim/systems/loyalty/ src/sim/index.ts
git commit -m "feat(loyalty): per-household-per-store loyalty with expectation-relative updates (§5.2)"
```

---

## Task 5: `ReputationSystem`

Also registered nowhere yet.

**Files:**
- Create: `src/sim/systems/reputation/{types.ts,system.ts,index.ts,system.test.ts}`
- Modify: `src/sim/index.ts`

**Interfaces:**
- Consumes: `MarketReader`, `TripOutcome` (Task 4), `LoyaltySystem` (Task 4), `travelCost` and `Position` (existing), `MarketConfig` (Task 1).
- Produces:

```typescript
export interface NeighborReader {
  householdIds(): readonly number[];
  householdPosition(householdId: number): Position;
  pendingOutcomes(): readonly TripOutcome[];
}

export class ReputationSystem implements System {
  readonly name = 'reputation';
  constructor(market: NeighborReader, loyalty: LoyaltySystem, catchment?: CatchmentConfig, config?: MarketConfig);
  neighborsOf(householdId: number): readonly number[];
}
```

- [ ] **Step 1: Write the failing tests**

Create `src/sim/systems/reputation/system.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { LoyaltySystem } from '../loyalty/system.js';
import type { TripOutcome } from '../loyalty/types.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from '../market/config.js';
import type { Position } from '../market/types.js';
import { ReputationSystem } from './system.js';
import type { NeighborReader } from './types.js';

class FakeMarket implements NeighborReader {
  outcomes: TripOutcome[] = [];
  constructor(private readonly positions: Map<number, Position>) {}
  householdIds(): readonly number[] {
    return [...this.positions.keys()].sort((a, b) => a - b);
  }
  householdPosition(id: number): Position {
    const p = this.positions.get(id);
    if (!p) throw new Error(`Unknown household id: ${id}`);
    return p;
  }
  pendingOutcomes(): readonly TripOutcome[] {
    return this.outcomes;
  }
}

function setup(): { world: World; market: FakeMarket; loyalty: LoyaltySystem; reputation: ReputationSystem } {
  // 1 is nearest 2, then 3, then 4, then 5 — a deliberate line so k=3 has an
  // unambiguous answer.
  const positions = new Map<number, Position>([
    [1, { x: 0, y: 0 }],
    [2, { x: 1, y: 0 }],
    [3, { x: 2, y: 0 }],
    [4, { x: 3, y: 0 }],
    [5, { x: 9, y: 0 }],
  ]);
  const world = new World({ seed: 1 });
  const market = new FakeMarket(positions);
  const loyalty = new LoyaltySystem(market, DEFAULT_RIVAL_STORES);
  world.register(loyalty);
  const reputation = new ReputationSystem(market, loyalty);
  world.register(reputation);
  return { world, market, loyalty, reputation };
}

describe('the neighbour relation', () => {
  it('picks the k nearest by catchment travel cost, excluding self', () => {
    const { reputation } = setup();
    expect(reputation.neighborsOf(1)).toEqual([2, 3, 4]);
  });

  it('breaks ties by ascending household id', () => {
    const positions = new Map<number, Position>([
      [10, { x: 0, y: 0 }],
      [7, { x: 1, y: 0 }],
      [3, { x: 0, y: 1 }],
      [5, { x: -1, y: 0 }],
      [9, { x: 0, y: -1 }],
    ]);
    const world = new World({ seed: 1 });
    const market = new FakeMarket(positions);
    const loyalty = new LoyaltySystem(market, DEFAULT_RIVAL_STORES);
    world.register(loyalty);
    const reputation = new ReputationSystem(market, loyalty);
    world.register(reputation);
    // Every neighbour is exactly one unit away, so id order decides.
    expect(reputation.neighborsOf(10)).toEqual([3, 5, 7]);
  });
});

describe('diffusion (§5.3)', () => {
  it('raises exactly k neighbours on a delighted trip', () => {
    const { world, market, loyalty } = setup();
    const before = [2, 3, 4, 5].map((id) => loyalty.get(id, 0));
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.95 }];
    world.step();
    expect(loyalty.get(2, 0)).toBeGreaterThan(before[0]!);
    expect(loyalty.get(3, 0)).toBeGreaterThan(before[1]!);
    expect(loyalty.get(4, 0)).toBeGreaterThan(before[2]!);
    expect(loyalty.get(5, 0)).toBeCloseTo(before[3]!);
  });

  it('lowers neighbours on a disgusted trip', () => {
    const { world, market, loyalty } = setup();
    const before = loyalty.get(2, 0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.1 }];
    world.step();
    expect(loyalty.get(2, 0)).toBeLessThan(before);
  });

  it('stays silent for an unremarkable trip', () => {
    const { world, market, loyalty } = setup();
    const before = loyalty.get(2, 0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.5 }];
    world.step();
    expect(loyalty.get(2, 0)).toBeCloseTo(before);
  });

  it('does not cascade — a nudged neighbour never re-emits', () => {
    // Household 5 is nobody's neighbour but 4's; if diffusion recursed, a delighted
    // trip by 1 would eventually reach it.
    const { world, market, loyalty } = setup();
    const before = loyalty.get(5, 0);
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 1 }];
    world.step();
    expect(loyalty.get(5, 0)).toBeCloseTo(before);
  });

  it('emits a wordOfMouth event naming who was affected', () => {
    const { world, market } = setup();
    const seen: unknown[] = [];
    world.events.subscribe((e) => {
      if (e.type === 'wordOfMouth') seen.push(e);
    });
    market.outcomes = [{ householdId: 1, storeIndex: 0, satisfaction: 0.95 }];
    world.step();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ sourceHouseholdId: 1, storeIndex: 0, polarity: 1 });
  });

  it('applies outcomes in ascending source-household order', () => {
    const { world, market, loyalty } = setup();
    market.outcomes = [
      { householdId: 3, storeIndex: 0, satisfaction: 0.95 },
      { householdId: 1, storeIndex: 0, satisfaction: 0.95 },
    ];
    world.step();
    // Both fire; the assertion that matters is that the result does not depend on
    // buffer order — see the determinism test below.
    expect(loyalty.get(2, 0)).toBeGreaterThan(DEFAULT_MARKET_CONFIG.initialLoyalty);
  });

  it('is independent of the order outcomes were appended', () => {
    const a = setup();
    const b = setup();
    a.market.outcomes = [
      { householdId: 3, storeIndex: 0, satisfaction: 0.95 },
      { householdId: 1, storeIndex: 0, satisfaction: 0.05 },
    ];
    b.market.outcomes = [
      { householdId: 1, storeIndex: 0, satisfaction: 0.05 },
      { householdId: 3, storeIndex: 0, satisfaction: 0.95 },
    ];
    a.world.step();
    b.world.step();
    expect(a.world.hash).toBe(b.world.hash);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/systems/reputation/`
Expected: FAIL — cannot resolve `./system.js`.

- [ ] **Step 3: Add the `wordOfMouth` event**

In `src/sim/core/events.ts`, add to the `SimEvent` union:

```typescript
  | {
      readonly type: 'wordOfMouth';
      readonly sourceHouseholdId: number;
      /** 0 = the player's store; 1..n = rivals in roster order. */
      readonly storeIndex: number;
      /** +1 for a delighted trip, -1 for a disgusted one. */
      readonly polarity: 1 | -1;
      readonly affectedHouseholdIds: readonly number[];
    }
```

- [ ] **Step 4: Write `reputation/types.ts`**

```typescript
import type { TripOutcome } from '../loyalty/types.js';
import type { Position } from '../market/types.js';

/** The slice of `MarketSystem` reputation reads. See `loyalty/types.ts` for why. */
export interface NeighborReader {
  householdIds(): readonly number[];
  householdPosition(householdId: number): Position;
  pendingOutcomes(): readonly TripOutcome[];
}
```

- [ ] **Step 5: Write `reputation/system.ts`**

```typescript
import type { Hasher } from '../../core/hash.js';
import type { System, World } from '../../core/world.js';
import type { LoyaltySystem } from '../loyalty/system.js';
import { travelCost } from '../market/catchment.js';
import { DEFAULT_CATCHMENT_CONFIG, DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { CatchmentConfig, MarketConfig } from '../market/config.js';
import type { NeighborReader } from './types.js';

/**
 * Word of mouth (PLAN.md §5.3).
 *
 * A trip with satisfaction above `delightThreshold` or below `disgustThreshold` nudges
 * the source household's k nearest catchment neighbours toward or away from that store.
 *
 * **One hop, never recursive.** §5.3 says "affecting k neighbor households", which is
 * one hop; recursive diffusion over a k-NN graph is an unbounded cascade with a tuning
 * surface nobody has asked for. A nudged neighbour does not re-emit.
 *
 * ω is an order of magnitude below α (enforced in the config schema): hearsay must not
 * outweigh having actually shopped somewhere.
 */
export class ReputationSystem implements System {
  readonly name = 'reputation';
  readonly #market: NeighborReader;
  readonly #loyalty: LoyaltySystem;
  readonly #catchment: CatchmentConfig;
  readonly #config: MarketConfig;
  #neighbors = new Map<number, readonly number[]>();
  #knownHouseholds = 0;

  constructor(
    market: NeighborReader,
    loyalty: LoyaltySystem,
    catchment: CatchmentConfig = DEFAULT_CATCHMENT_CONFIG,
    config: MarketConfig = DEFAULT_MARKET_CONFIG,
  ) {
    this.#market = market;
    this.#loyalty = loyalty;
    this.#catchment = catchment;
    this.#config = config;
  }

  update(world: World): void {
    this.#rebuildIfNeeded();
    // Sorted by source household id so the result never depends on the order
    // MarketSystem and ShoppersSystem happened to append outcomes to the buffer.
    const outcomes = [...this.#market.pendingOutcomes()].sort((a, b) => a.householdId - b.householdId);
    for (const outcome of outcomes) {
      const polarity =
        outcome.satisfaction > this.#config.delightThreshold
          ? 1
          : outcome.satisfaction < this.#config.disgustThreshold
            ? -1
            : 0;
      if (polarity === 0) continue;
      const affected = this.neighborsOf(outcome.householdId);
      for (const neighborId of affected) {
        this.#loyalty.nudge(neighborId, outcome.storeIndex, polarity * this.#config.womDelta);
      }
      world.events.emit({
        type: 'wordOfMouth',
        sourceHouseholdId: outcome.householdId,
        storeIndex: outcome.storeIndex,
        polarity,
        affectedHouseholdIds: affected,
      });
    }
  }

  hash(_world: World, hasher: Hasher): void {
    const ids = [...this.#neighbors.keys()].sort((a, b) => a - b);
    hasher.u32(ids.length);
    for (const id of ids) {
      hasher.u32(id);
      const neighbors = this.#neighbors.get(id)!;
      hasher.u32(neighbors.length);
      for (const neighborId of neighbors) hasher.u32(neighborId);
    }
  }

  neighborsOf(householdId: number): readonly number[] {
    this.#rebuildIfNeeded();
    return this.#neighbors.get(householdId) ?? [];
  }

  /** Households never move, so this only runs when the household set grows. */
  #rebuildIfNeeded(): void {
    const ids = this.#market.householdIds();
    if (ids.length === this.#knownHouseholds) return;
    this.#knownHouseholds = ids.length;
    const neighbors = new Map<number, readonly number[]>();
    for (const id of ids) {
      const origin = this.#market.householdPosition(id);
      const ranked = ids
        .filter((other) => other !== id)
        .map((other) => ({
          id: other,
          cost: travelCost(origin, this.#market.householdPosition(other), this.#catchment),
        }))
        // Ties broken by ascending id, never by scan order — this reaches the hash.
        .sort((a, b) => (a.cost === b.cost ? a.id - b.id : a.cost - b.cost))
        .slice(0, this.#config.womNeighbors)
        .map((entry) => entry.id);
      neighbors.set(id, ranked);
    }
    this.#neighbors = neighbors;
  }
}
```

Create `src/sim/systems/reputation/index.ts`:

```typescript
export { ReputationSystem } from './system.js';
export type { NeighborReader } from './types.js';
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/sim/systems/reputation/`
Expected: PASS.

- [ ] **Step 7: Confirm no golden moved, then commit**

Run: `npx vitest run tests/golden/`
Expected: PASS.

Export `ReputationSystem` from `src/sim/index.ts`.

```bash
git add src/sim/systems/reputation/ src/sim/core/events.ts src/sim/index.ts
git commit -m "feat(reputation): one-hop word-of-mouth diffusion over catchment neighbours (§5.3)"
```

---

## Task 6: Player-store utility terms

Pure extraction of `StoreTerms` from live systems. Still no wiring, so still no golden movement.

**Files:**
- Create: `src/sim/systems/market/terms.ts`, `src/sim/systems/market/terms.test.ts`
- Modify: `src/sim/systems/checkout/system.ts`, `src/sim/systems/market/index.ts`, `src/sim/index.ts`
- Test: `src/sim/systems/market/terms.test.ts`, `src/sim/systems/checkout/system.test.ts`

**Interfaces:**
- Consumes: `StoreTerms`, `indexToFit` (Task 3); `MarketConfig` (Task 1); `EconomySystem#priceOf`/`#referencePriceOf`, `InventorySystem#stockOf`/`#freshnessOf`, `BuildGrid` (existing).
- Produces:
  - `CheckoutSystem#serviceScore(): number` — staffed-open-lane ratio × mean assigned-staff skill, `0` when no lane is open.
  - `playerStoreTerms(deps: PlayerTermDeps): StoreTerms` and `rivalStoreTerms(rival: RivalStore, deps: RivalTermDeps): StoreTerms`, with the dep shapes below.

- [ ] **Step 1: Write the failing `serviceScore` test**

Append to `src/sim/systems/checkout/system.test.ts`:

```typescript
describe('serviceScore', () => {
  it('is 0 when no lane is open', () => {
    const { checkout } = buildCheckoutWorld(); // reuse this file's existing helper
    expect(checkout.serviceScore()).toBe(0);
  });

  it('rises with staff skill on an open register', () => {
    const low = buildCheckoutWorld();
    low.world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 5, y: 5, rotation: 0 });
    low.world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.2, morale: 0.8 });
    low.world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: 1 });
    low.world.step();

    const high = buildCheckoutWorld();
    high.world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 5, y: 5, rotation: 0 });
    high.world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.9, morale: 0.8 });
    high.world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: 1 });
    high.world.step();

    expect(high.checkout.serviceScore()).toBeGreaterThan(low.checkout.serviceScore());
  });

  it('falls when some registers sit unstaffed', () => {
    const { world, checkout } = buildCheckoutWorld();
    world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 5, y: 5, rotation: 0 });
    world.commands.push({ type: 'placeFixture', fixtureId: 'register', x: 8, y: 5, rotation: 0 });
    world.commands.push({ type: 'hireStaff', staffId: 1, skill: 0.8, morale: 0.8 });
    world.commands.push({ type: 'assignStaffToRegister', staffId: 1, instanceId: 1 });
    world.step();
    expect(checkout.serviceScore()).toBeLessThan(0.8);
    expect(checkout.serviceScore()).toBeGreaterThan(0);
  });
});
```

If this file has no reusable world helper, write one locally in the `describe` block following the file's existing setup pattern; do not restructure the file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/systems/checkout/`
Expected: FAIL — `serviceScore` is not a function.

- [ ] **Step 3: Implement `serviceScore`**

Add to `CheckoutSystem`, beside `cleanliness()`:

```typescript
  /**
   * §5.1's `service(s)` for the player's store: what fraction of lanes are actually open,
   * scaled by how good the people running them are. Zero when nothing is open — that is
   * the understaffing story the store-choice logit needs to be able to punish.
   */
  serviceScore(): number {
    if (this.#lanes.size === 0) return 0;
    let open = 0;
    let skillTotal = 0;
    for (const lane of this.#lanes.values()) {
      if (!this.#isOpen(lane)) continue;
      open++;
      const staff = lane.staffId === null ? null : this.#staff.get(lane.staffId);
      skillTotal += staff ? staff.skill : this.#config.selfCheckoutSkillEquivalent;
    }
    if (open === 0) return 0;
    return (open / this.#lanes.size) * (skillTotal / open);
  }
```

Add `selfCheckoutSkillEquivalent` to `content/balance/staffing.json5` and `StaffingConfigSchema` (`z.number().min(0).max(1)`), value `0.5`, with the comment: *"A self-checkout lane is open but has no cashier; §5.6 already docks it 0.08 on the service score at trip level. This is its standing contribution to the store's advertised service quality."*

- [ ] **Step 4: Run the checkout tests**

Run: `npx vitest run src/sim/systems/checkout/`
Expected: PASS.

- [ ] **Step 5: Write the failing terms tests**

Create `src/sim/systems/market/terms.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { DEFAULT_GOODS_CATALOG } from '../goods/catalog.js';
import { DEFAULT_MARKET_CONFIG, DEFAULT_RIVAL_STORES } from './config.js';
import { playerStoreTerms, rivalStoreTerms } from './terms.js';

const list = ['milk', 'bread'];

const stubDeps = (overrides: Partial<Parameters<typeof playerStoreTerms>[0]> = {}) => ({
  list,
  catalog: DEFAULT_GOODS_CATALOG,
  tick: 0,
  priceOf: () => 1,
  referencePriceOf: () => 1,
  stockOf: () => 10,
  freshnessOf: () => 1,
  serviceScore: () => 0.7,
  loyalty: 0.3,
  brandAffinity: 0.1,
  travelCost: 0,
  config: DEFAULT_MARKET_CONFIG,
  ...overrides,
});

describe('playerStoreTerms', () => {
  it('reports neutral price fit when prices match reference', () => {
    expect(playerStoreTerms(stubDeps()).priceFit).toBeCloseTo(DEFAULT_MARKET_CONFIG.priceFitNeutral);
  });

  it('rewards prices below reference', () => {
    const cheap = playerStoreTerms(stubDeps({ priceOf: () => 0.5 }));
    expect(cheap.priceFit).toBeGreaterThan(DEFAULT_MARKET_CONFIG.priceFitNeutral);
  });

  it('punishes prices above reference', () => {
    const dear = playerStoreTerms(stubDeps({ priceOf: () => 2 }));
    expect(dear.priceFit).toBeLessThan(DEFAULT_MARKET_CONFIG.priceFitNeutral);
  });

  it('scores assortment as the fraction of the list actually in stock', () => {
    const half = playerStoreTerms(stubDeps({ stockOf: (id: string) => (id === 'milk' ? 5 : 0) }));
    expect(half.assortmentFit).toBeCloseTo(0.5);
  });

  it('treats an empty list as fully served rather than dividing by zero', () => {
    expect(playerStoreTerms(stubDeps({ list: [] })).assortmentFit).toBe(1);
  });

  it('takes quality from mean freshness of in-stock goods', () => {
    expect(playerStoreTerms(stubDeps({ freshnessOf: () => 0.4 })).quality).toBeCloseTo(0.4);
  });

  it('uses the authored ambiance stub', () => {
    expect(playerStoreTerms(stubDeps()).ambiance).toBe(DEFAULT_MARKET_CONFIG.playerAmbiance);
  });
});

describe('rivalStoreTerms', () => {
  it('maps the authored price index through the same fit curve', () => {
    const savALott = DEFAULT_RIVAL_STORES[0]!;
    const terms = rivalStoreTerms(savALott, {
      loyalty: 0,
      brandAffinity: 0,
      travelCost: 0,
      config: DEFAULT_MARKET_CONFIG,
    });
    // priceIndex < 1, so the discounter must look better on price than a store at reference.
    expect(terms.priceFit).toBeGreaterThan(DEFAULT_MARKET_CONFIG.priceFitNeutral);
    expect(terms.assortmentFit).toBe(savALott.assortmentBreadth);
    expect(terms.quality).toBe(savALott.quality);
    expect(terms.storeId).toBe(savALott.id);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/sim/systems/market/terms.test.ts`
Expected: FAIL — cannot resolve `./terms.js`.

- [ ] **Step 7: Implement `terms.ts`**

```typescript
import type { GoodDef } from '../goods/types.js';
import { indexToFit, type StoreTerms } from './choice.js';
import type { MarketConfig } from './config.js';
import type { RivalStore } from './types.js';

/**
 * Turning live sim state into §5.1's utility terms.
 *
 * Kept pure and dependency-injected rather than reaching into systems directly, so the
 * mapping can be tested against stub numbers instead of a whole constructed world.
 */

export interface PlayerTermDeps {
  readonly list: readonly string[];
  readonly catalog: readonly GoodDef[];
  readonly tick: number;
  readonly priceOf: (goodId: string, tick: number) => number;
  readonly referencePriceOf: (goodId: string) => number;
  readonly stockOf: (goodId: string) => number;
  readonly freshnessOf: (goodId: string, tick: number) => number;
  readonly serviceScore: () => number;
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
  readonly config: MarketConfig;
}

export interface RivalTermDeps {
  readonly loyalty: number;
  readonly brandAffinity: number;
  readonly travelCost: number;
  readonly config: MarketConfig;
}

export const PLAYER_STORE_ID = 'player';

export function playerStoreTerms(deps: PlayerTermDeps): StoreTerms {
  // priceFit: this household's actual list, costed at live prices against catalog
  // reference. A household whose list is empty has nothing to compare, so it sees the
  // neutral index rather than a divide-by-zero.
  let actual = 0;
  let reference = 0;
  for (const goodId of deps.list) {
    actual += deps.priceOf(goodId, deps.tick);
    reference += deps.referencePriceOf(goodId);
  }
  const priceIndex = reference > 0 ? actual / reference : 1;

  // assortmentFit: fraction of the list that is stocked AND actually has units.
  const available = deps.list.filter((goodId) => deps.stockOf(goodId) > 0).length;
  const assortmentFit = deps.list.length === 0 ? 1 : available / deps.list.length;

  // quality: mean freshness across everything currently in stock. Store-level, not
  // list-level — a shopper judges the shelves they walk past, not only their own list.
  let freshnessTotal = 0;
  let stockedCount = 0;
  for (const good of deps.catalog) {
    if (deps.stockOf(good.id) <= 0) continue;
    freshnessTotal += deps.freshnessOf(good.id, deps.tick);
    stockedCount++;
  }
  const quality = stockedCount === 0 ? 0 : freshnessTotal / stockedCount;

  return {
    storeId: PLAYER_STORE_ID,
    priceFit: indexToFit(priceIndex, deps.config.priceFitNeutral),
    assortmentFit,
    quality,
    service: deps.serviceScore(),
    // STUB: no cleanliness system exists (PLAN.md §4). A real term, a fake input.
    ambiance: deps.config.playerAmbiance,
    loyalty: deps.loyalty,
    brandAffinity: deps.brandAffinity,
    travelCost: deps.travelCost,
  };
}

export function rivalStoreTerms(rival: RivalStore, deps: RivalTermDeps): StoreTerms {
  return {
    storeId: rival.id,
    priceFit: indexToFit(rival.priceIndex, deps.config.priceFitNeutral),
    assortmentFit: rival.assortmentBreadth,
    quality: rival.quality,
    service: rival.service,
    ambiance: rival.ambiance,
    loyalty: deps.loyalty,
    brandAffinity: deps.brandAffinity,
    travelCost: deps.travelCost,
  };
}
```

- [ ] **Step 8: Run, verify goldens are untouched, commit**

Run: `npx vitest run src/sim/systems/market/ src/sim/systems/checkout/ tests/golden/`
Expected: PASS across all three.

Export `playerStoreTerms`, `rivalStoreTerms`, `PLAYER_STORE_ID`, and the two dep types from `src/sim/systems/market/index.ts` and `src/sim/index.ts`.

```bash
git add src/sim/systems/market/terms.ts src/sim/systems/market/terms.test.ts src/sim/systems/checkout/ content/balance/staffing.json5 src/sim/systems/market/index.ts src/sim/index.ts
git commit -m "feat(market): derive store-choice utility terms from live sim state"
```

---

## Task 7: Wire the scheduler — the behaviour change

Everything above was inert. This task turns it on.

**Files:**
- Modify: `src/sim/systems/market/system.ts`, `src/sim/systems/shoppers/system.ts`, `src/bridge/build-bridge.ts`, `tests/golden/scenarios.ts`, `src/sim/core/events.ts`
- Test: `src/sim/systems/market/system.test.ts`, `tests/golden/golden.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces, on `MarketSystem`:

```typescript
  pendingOutcomes(): readonly TripOutcome[];
  householdPosition(householdId: number): Position;
  recordTripOutcome(outcome: TripOutcome): void;   // called by ShoppersSystem
  choiceProbabilities(householdId: number): readonly number[];  // last computed, for KPIs/tests
  storeIndexOf(storeId: string): number;
```

`MarketSystem`'s constructor becomes:

```typescript
constructor(
  deps: {
    readonly inventory: InventorySystem;
    readonly checkout: CheckoutSystem;
    readonly economy: EconomySystem;
    readonly loyalty: LoyaltySystem;
  } | null = null,
  catalog?: readonly GoodDef[],
  segments?: SegmentConfig,
  rivals?: readonly RivalStore[],
  catchment?: CatchmentConfig,
  config?: MarketConfig,
)
```

`deps: null` keeps Task 2's household-only behaviour, which is what the Task 2 unit tests construct. When `deps` is supplied, scheduling runs.

- [ ] **Step 1: Write the failing scheduler tests**

Append to `src/sim/systems/market/system.test.ts`:

```typescript
describe('trip scheduling (§5.4)', () => {
  it('schedules no trip while the list is below threshold', () => {
    const { world, market } = fullMarketWorld(); // helper added in Step 2
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    expect(market.pendingOutcomes()).toHaveLength(0);
  });

  it('spawns a shopper once the pantry drains past the threshold', () => {
    const { world, shoppers } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    world.step();
    for (let i = 0; i < 1440 * 12; i++) world.step();
    // No spawnShopper command was ever pushed. If a shopper exists, the scheduler made it.
    expect(shoppers.activeShopperIds().length + completedTrips).toBeGreaterThan(0);
  });

  it('never schedules a second trip while one is in flight', () => {
    const { world, shoppers } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 0 } });
    for (let i = 0; i < 1440 * 12; i++) world.step();
    expect(shoppers.activeShopperIds().length).toBeLessThanOrEqual(1);
  });
});

describe('store choice', () => {
  it('sends a household to the rival when the player store is far worse', () => {
    // Player store: nothing stocked, no open lane. Sav-A-Lott wins on every term.
    const { world, market } = fullMarketWorld({ stockShelf: false });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'priceHunter', position: { x: 4, y: -3 } });
    for (let i = 0; i < 1440 * 12; i++) world.step();
    const probabilities = market.choiceProbabilities(1);
    expect(probabilities[1]!).toBeGreaterThan(probabilities[0]!);
  });

  it('resolves a rival trip without spawning an agent', () => {
    const { world, market, shoppers } = fullMarketWorld({ stockShelf: false });
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'priceHunter', position: { x: 4, y: -3 } });
    let rivalTrips = 0;
    world.events.subscribe((e) => {
      if (e.type === 'rivalTripCompleted') rivalTrips++;
    });
    for (let i = 0; i < 1440 * 20; i++) world.step();
    expect(rivalTrips).toBeGreaterThan(0);
    expect(shoppers.activeShopperIds()).toHaveLength(0);
  });
});

describe('determinism', () => {
  it('two worlds with the same seed schedule identically', () => {
    const a = fullMarketWorld();
    const b = fullMarketWorld();
    for (const w of [a, b]) {
      w.world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 1, y: 1 } });
    }
    for (let i = 0; i < 1440 * 15; i++) {
      a.world.step();
      b.world.step();
    }
    expect(a.world.hash).toBe(b.world.hash);
  });
});
```

Write the `fullMarketWorld(options?: { stockShelf?: boolean })` helper at the top of the file, constructing the full stack in registration order (`grid, pathing, inventory, checkout, economy, market, shoppers, loyalty, reputation`), placing a `shelf_basic` and a `self_checkout`, stocking the shelf with `milk` and `bread` unless `stockShelf === false`, and returning `{ world, market, shoppers, loyalty }`. Track `completedTrips` by subscribing to `shopperTripCompleted`. Use `self_checkout` rather than `register` so no staffing command is needed to keep a lane open.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/sim/systems/market/system.test.ts`
Expected: FAIL — `pendingOutcomes` is not a function.

- [ ] **Step 3: Add the `rivalTripCompleted` event**

In `src/sim/core/events.ts`:

```typescript
  | {
      readonly type: 'rivalTripCompleted';
      readonly householdId: number;
      readonly storeId: string;
      readonly storeIndex: number;
      readonly satisfaction: number;
    }
```

- [ ] **Step 4: Extend `MarketSystem`**

Add fields and the scheduling body. The daily block in `update` becomes:

```typescript
  update(world: World): void {
    this.#pending = [];
    if (world.tick % TICKS_PER_SIM_DAY !== 0) return;
    for (const id of this.householdIds()) {
      this.#households.set(id, advancePantryDay(this.#households.get(id)!, this.#catalog, this.#segments));
    }
    if (this.#deps) this.#scheduleTrips(world);
  }

  #scheduleTrips(world: World): void {
    const deps = this.#deps!;
    for (const id of this.householdIds()) {
      const household = this.household(id);
      if (household.list.length < this.#config.tripListThreshold) continue;
      if (this.#tripInFlight.has(id)) continue;

      const weights = this.#segments.get(household.segment)!.weights;
      const terms = this.#termsFor(world, household, deps);
      const probabilities = softmax(
        terms.map((t) => storeUtility(t, weights)),
        weights.temperature,
      );
      this.#probabilities.set(id, probabilities);
      // One draw per scheduled trip, in ascending household id. `rivalNoise` has been
      // reserved in STREAM_NAMES since phase 1.3 and is unused until now.
      const chosen = chooseStore(probabilities, world.rng.get('rivalNoise').nextFloat());

      if (chosen === 0) {
        this.#tripInFlight.add(id);
        world.commands.push({ type: 'spawnShopper', shopperId: this.#nextShopperId++, householdId: id });
      } else {
        this.#resolveRivalTrip(world, id, chosen);
      }
    }
  }

  #termsFor(world: World, household: Household, deps: MarketDeps): StoreTerms[] {
    const affinity = this.#segments.get(household.segment)!.brandAffinity;
    const player = playerStoreTerms({
      list: household.list,
      catalog: this.#catalog,
      tick: world.tick,
      priceOf: (goodId, tick) => deps.economy.priceOf(goodId, tick),
      referencePriceOf: (goodId) => deps.economy.referencePriceOf(goodId),
      stockOf: (goodId) => deps.inventory.stockOf(goodId),
      freshnessOf: (goodId, tick) => deps.inventory.freshnessOf(goodId, tick),
      serviceScore: () => deps.checkout.serviceScore(),
      loyalty: deps.loyalty.get(household.id, 0),
      brandAffinity: affinity[PLAYER_STORE_ID] ?? 0,
      travelCost: travelCost(household.position, this.#catchmentConfig.playerStorePosition, this.#catchmentConfig),
      config: this.#config,
    });
    const rivals = this.#rivals.map((rival, i) =>
      rivalStoreTerms(rival, {
        loyalty: deps.loyalty.get(household.id, i + 1),
        brandAffinity: affinity[rival.identity] ?? 0,
        travelCost: travelCost(household.position, rival.position, this.#catchmentConfig),
        config: this.#config,
      }),
    );
    return [player, ...rivals];
  }

  /**
   * §5.8's "rivals run the same sim at reduced fidelity", demand side only: no agent, no
   * pathing, no queue, no spoilage. A weighted read of the rival's authored terms.
   */
  #resolveRivalTrip(world: World, householdId: number, storeIndex: number): void {
    const rival = this.#rivals[storeIndex - 1]!;
    const w = this.#config.rivalSatisfactionWeights;
    const satisfaction = Math.min(
      1,
      Math.max(
        0,
        w.quality * rival.quality +
          w.service * rival.service +
          w.ambiance * rival.ambiance +
          w.assortment * rival.assortmentBreadth +
          w.price * indexToFit(rival.priceIndex, this.#config.priceFitNeutral),
      ),
    );
    this.recordTripOutcome({ householdId, storeIndex, satisfaction });
    world.events.emit({
      type: 'rivalTripCompleted',
      householdId,
      storeId: rival.id,
      storeIndex,
      satisfaction,
    });
  }

  /**
   * The tick's completed trips. Populated by `#resolveRivalTrip` and by
   * `ShoppersSystem` as player trips finish; read by `LoyaltySystem` and
   * `ReputationSystem`, both registered after both writers.
   *
   * Cleared at the top of this system's own `update`, so it is still populated when the
   * world hashes at end of tick — which is why `hash` folds it in. Having the
   * last-registered system clear it instead would make correctness depend on
   * registration order in a way nothing else in this codebase does.
   */
  pendingOutcomes(): readonly TripOutcome[] {
    return this.#pending;
  }

  recordTripOutcome(outcome: TripOutcome): void {
    this.#pending.push(outcome);
    this.#tripInFlight.delete(outcome.householdId);
  }

  householdPosition(householdId: number): Position {
    return this.household(householdId).position;
  }

  choiceProbabilities(householdId: number): readonly number[] {
    return this.#probabilities.get(householdId) ?? [];
  }

  storeIndexOf(storeId: string): number {
    if (storeId === PLAYER_STORE_ID) return 0;
    const index = this.#rivals.findIndex((r) => r.id === storeId);
    if (index < 0) throw new Error(`Unknown store id: ${storeId}`);
    return index + 1;
  }
```

Extend `hash` with the new state, appended **after** the existing household block so Task 2's bytes keep their position:

```typescript
    hasher.u32(this.#nextShopperId);
    const inFlight = [...this.#tripInFlight].sort((a, b) => a - b);
    hasher.u32(inFlight.length);
    for (const id of inFlight) hasher.u32(id);
    hasher.u32(this.#pending.length);
    for (const outcome of this.#pending) {
      hasher.u32(outcome.householdId).u32(outcome.storeIndex).f64(outcome.satisfaction);
    }
```

`#probabilities` is **not** hashed — it is a derived read-model for KPIs and tests, recomputed from hashed inputs every time a trip is scheduled. Add that as a comment on the field.

- [ ] **Step 5: Report player trip outcomes from `ShoppersSystem`**

In `#stepLeaving`, immediately after the `world.events.emit({ type: 'shopperTripCompleted', ... })` call:

```typescript
    // Feeds LoyaltySystem and ReputationSystem, both registered after this system.
    // Store index 0 is the player's store — a shopper who physically walked in is by
    // definition not at a rival.
    this.#market.recordTripOutcome({ householdId: moved.householdId, storeIndex: 0, satisfaction });
```

- [ ] **Step 6: Register everything in the bridge**

In `src/bridge/build-bridge.ts`, replace the market/shoppers block:

```typescript
    this.#loyalty = new LoyaltySystem(this.#marketReader(), DEFAULT_RIVAL_STORES);
    this.#market = new MarketSystem({
      inventory: this.#inventory,
      checkout: this.#checkout,
      economy: this.#economy,
      loyalty: this.#loyalty,
    });
    this.#world.register(this.#market);
    this.#shoppers = new ShoppersSystem(
      this.#market,
      this.#grid.grid,
      this.#pathing,
      this.#inventory,
      this.#checkout,
      this.#economy,
    );
    this.#world.register(this.#shoppers);
    this.#world.register(this.#loyalty);
    this.#reputation = new ReputationSystem(this.#market, this.#loyalty);
    this.#world.register(this.#reputation);
```

`LoyaltySystem` needs a `MarketReader` before `MarketSystem` exists. Break the cycle by constructing `MarketSystem` first with `deps: null`, then assigning deps — or simpler, pass a thin closure object:

```typescript
  #marketReader(): MarketReader {
    return {
      householdIds: () => this.#market.householdIds(),
      pendingOutcomes: () => this.#market.pendingOutcomes(),
    };
  }
```

This is safe because the closure is only invoked during `update`, long after both constructors have run. Add that as a comment.

- [ ] **Step 7: Run everything except goldens**

Run: `npx vitest run --exclude 'tests/golden/**'`
Expected: PASS. Existing `build-bridge.test.ts` tests that push an explicit `spawnShopper` still work — the command survives.

- [ ] **Step 8: Add the `catchment-week` golden scenario**

In `tests/golden/scenarios.ts`, after `shopper-trip`:

```typescript
  {
    name: 'catchment-week',
    seed: 20260803,
    ticks: 14 * 1440,
    sampleEvery: 400,
    build() {
      const world = new World({ seed: this.seed });
      const grid = new GridSystem({ width: 24, height: 24 });
      world.register(grid);
      const pathing = new PathingSystem(grid.grid);
      world.register(pathing);
      const inventory = new InventorySystem();
      world.register(inventory);
      const checkout = new CheckoutSystem(grid.grid, pathing);
      world.register(checkout);
      const economy = new EconomySystem(checkout, inventory);
      world.register(economy);
      let market!: MarketSystem;
      const loyalty = new LoyaltySystem(
        {
          householdIds: () => market.householdIds(),
          pendingOutcomes: () => market.pendingOutcomes(),
        },
        DEFAULT_RIVAL_STORES,
      );
      market = new MarketSystem({ inventory, checkout, economy, loyalty });
      world.register(market);
      const shoppers = new ShoppersSystem(market, grid.grid, pathing, inventory, checkout, economy);
      world.register(shoppers);
      world.register(loyalty);
      world.register(new ReputationSystem(market, loyalty));

      world.commands.push({ type: 'placeFixture', fixtureId: 'shelf_basic', x: 10, y: 10, rotation: 0 });
      world.commands.push({ type: 'placeFixture', fixtureId: 'self_checkout', x: 20, y: 20, rotation: 0 });
      world.commands.push({ type: 'stockFixture', instanceId: 1, goodId: 'milk' });
      // Five households spread across the catchment and across segments: near the
      // player's store at the origin, near Sav-A-Lott at (4,-3), and between the two.
      // This is what exercises both trip paths, loyalty drift, and word-of-mouth in a
      // single recipe.
      const households: readonly [number, Segment, Position][] = [
        [1, 'family', { x: 0, y: 1 }],
        [2, 'priceHunter', { x: 4, y: -2 }],
        [3, 'foodie', { x: 1, y: 0 }],
        [4, 'senior', { x: 3, y: -3 }],
        [5, 'student', { x: 2, y: -1 }],
      ];
      for (const [householdId, segment, position] of households) {
        world.commands.push({ type: 'addHousehold', householdId, segment, position });
      }
      return world;
    },
  },
```

Import `LoyaltySystem`, `ReputationSystem`, `MarketSystem`, `DEFAULT_RIVAL_STORES`, and the `Segment`/`Position` types at the top of the file. Add `MarketSystem`, `LoyaltySystem`, `ReputationSystem` to `shopper-trip`'s build in the same registration order.

- [ ] **Step 9: Confirm the blast radius before re-baselining**

Run: `npx vitest run tests/golden/`
Expected: `shopper-trip` fails (real behaviour change: its household now shops on its own) and `catchment-week` fails (no baseline yet). **Every other scenario must pass.** If `pricing-and-promotions`, `grid-build`, or any other moved, stop and find out why — none of them register a market.

- [ ] **Step 10: Commit the code, then re-baseline separately**

```bash
git add -A src/ tests/golden/scenarios.ts
git commit -m "feat(market): autonomous trip scheduling and store choice (PLAN.md §5.1)

Households now decide to shop when their pantry-derived list crosses a
threshold, evaluate the logit across the player's store and Sav-A-Lott, and
either walk in or resolve a closed-form rival trip. Loyalty and word-of-mouth
are wired to both paths.

First consumer of the UtilityWeights authored in 2.0a and the travelCost and
rival terms authored in 2.0b. Re-baselined in the next commit."
```

```bash
npx vitest run tests/golden/ -u
git add tests/golden/hashes.json
git commit -m "test(golden): re-baseline shopper-trip; baseline catchment-week

shopper-trip's household now schedules its own trips instead of waiting for
the scenario's fixed-tick spawnShopper, so its behaviour genuinely changed —
unlike the previous re-baseline, which only moved bytes between systems. The
six scenarios that register no market were confirmed byte-identical before
this baseline was rewritten."
```

- [ ] **Step 11: Verify**

Run: `npm run verify && npm run check:budget`
Expected: all green. The logit is O(households × stores) once per sim day; if the budget check fails, record the finding rather than raising the threshold.

---

## Task 8: Integration tests and handoff

The tests that prove the phase did something, plus the manual check and the handoff update.

**Files:**
- Create: `src/sim/systems/market/store-choice.test.ts`
- Modify: `docs/handoff.md`

**Interfaces:**
- Consumes: everything. Adds no new production surface.

- [ ] **Step 1: Write the integration tests**

Create `src/sim/systems/market/store-choice.test.ts`. Build the same full stack as Task 7's helper; extract it into an exported helper in the test file rather than duplicating.

```typescript
describe('pricing drives store choice', () => {
  it('a priceHunter defects when the player store gets dear and returns on a loss leader', () => {
    // This is the test that finally connects phase 1.9's pricing to store choice.
    // Before 2.0c, a loss leader only affected the basket of a shopper who had already
    // decided to walk in.
    const { world, market } = fullMarketWorld();
    world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'priceHunter', position: { x: 2, y: -1 } });
    for (let i = 0; i < 1440 * 10; i++) world.step();
    const atReference = market.choiceProbabilities(1)[0]!;

    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 8 });
    for (let i = 0; i < 1440 * 10; i++) world.step();
    const whenDear = market.choiceProbabilities(1)[0]!;
    expect(whenDear).toBeLessThan(atReference);

    world.commands.push({ type: 'setPrice', goodId: 'milk', price: 0.4 });
    for (let i = 0; i < 1440 * 10; i++) world.step();
    expect(market.choiceProbabilities(1)[0]!).toBeGreaterThan(whenDear);
  });
});

describe('loyalty is stickiness', () => {
  it('a loyal household tolerates a price shock a disloyal one does not', () => {
    // If this fails, βl is not load-bearing and the model is wrong — not the test.
    const a = fullMarketWorld();
    const b = fullMarketWorld();
    for (const w of [a, b]) {
      w.world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 1, y: -1 } });
      w.world.step();
    }
    for (let i = 0; i < 20; i++) a.loyalty.recordTrip({ householdId: 1, storeIndex: 0, satisfaction: 1 });

    for (const w of [a, b]) {
      w.world.commands.push({ type: 'setPrice', goodId: 'milk', price: 6 });
      for (let i = 0; i < 1440 * 10; i++) w.world.step();
    }
    expect(a.market.choiceProbabilities(1)[0]!).toBeGreaterThan(b.market.choiceProbabilities(1)[0]!);
  });
});

describe('word of mouth reaches store choice', () => {
  it('a delighted neighbour measurably shifts a household probability', () => {
    // Diffusion that never changes a decision is dead code.
    const quiet = fullMarketWorld();
    const loud = fullMarketWorld();
    for (const w of [quiet, loud]) {
      w.world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 0, y: 1 } });
      w.world.commands.push({ type: 'addHousehold', householdId: 2, segment: 'family', position: { x: 0, y: 2 } });
      w.world.step();
    }
    for (let i = 0; i < 30; i++) {
      loud.loyalty.nudge(1, 0, 0.02); // stand-in for repeated neighbour delight
    }
    for (const w of [quiet, loud]) for (let i = 0; i < 1440 * 10; i++) w.world.step();
    expect(loud.market.choiceProbabilities(1)[0]!).toBeGreaterThan(quiet.market.choiceProbabilities(1)[0]!);
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run src/sim/systems/market/store-choice.test.ts`
Expected: PASS. If a test fails on *magnitude* rather than direction, the tuning in `market.json5` is wrong and should be adjusted there — never by weakening the assertion to `toBeGreaterThanOrEqual`.

- [ ] **Step 3: Verify replay fidelity**

Add to the same file:

```typescript
it('replays hash-identically through replay()', () => {
  const { world } = fullMarketWorld();
  world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family', position: { x: 1, y: 1 } });
  for (let i = 0; i < 1440 * 8; i++) world.step();
  // replay() rather than a hand-pushed command log: pushing a multi-tick log before any
  // step() collapses it onto tick 0 and silently shifts later commands a tick earlier.
  // Phase 1.8 learned this the hard way.
  const replayed = replay(world.seed, world.commands.log, world.tick, () => buildFullMarketSystems());
  expect(replayed.hash).toBe(world.hash);
});
```

Check `replay()`'s actual signature in `src/sim/core/world.ts` and adapt — the point is to use it rather than hand-pushing a log.

- [ ] **Step 4: Manual check in the dev server**

Run: `npm run dev`

Confirm, without pushing any command by hand:
1. Shoppers appear on their own after enough sim days pass.
2. Raising a price through the build-mode UI (or the console bridge) reduces how often they appear.
3. Nothing throws in the console over several sim days.

Phases 1.4, 1.5, 1.6, and 1.8 each shipped a bug that only running it for real caught. Do not skip this step. Record whatever you find in the handoff, including "nothing."

- [ ] **Step 5: Update the handoff**

Rewrite `docs/handoff.md`'s `## Now` section for phase 2.0c. It must state:
- What landed: the three systems, the household move, the two re-baselines and why each happened.
- The two honest stubs: `playerAmbiance` is a constant pending a cleanliness system; `brandAffinity` is authored, not learned.
- That `RivalStore.loyaltyDecay` exists and is deliberately unused until bosses arrive.
- That the phase 2.0 **gate is not met** — "harness win rates decrease monotonically with CL rank" needs the rival sim, personality vectors, and signatures (§5.8), which are the next PR.
- Whatever the manual check in Step 4 turned up.

- [ ] **Step 6: Final verify and commit**

Run: `npm run verify && npm run check:budget && npm run test:e2e`
Expected: all green.

```bash
git add src/sim/systems/market/store-choice.test.ts docs/handoff.md
git commit -m "test(market): store choice responds to pricing, loyalty, and word of mouth"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: §3 architecture → Tasks 2/4/5; §3.1 household move → Task 2; §3.2 tick order → Tasks 2 and 7; §4 scheduling → Task 7; §5 utility terms → Tasks 1 and 6; §6.1 the no-ε decision → Task 3 (both the code comment and the stability test); §6.2 the draw → Tasks 3 and 7; §6.3 rival trips → Task 7; §7 loyalty and word-of-mouth → Tasks 4 and 5; §8 determinism and re-baselines → Tasks 2, 5, and 7; §9 content → Task 1; §10 testing → distributed, with the three named integration tests in Task 8; §11 risks → mitigated by Task 2 being mechanical and Task 8 asserting direction not magnitude; §12 definition of done → Task 8 Step 6.

**Known deviation from the spec, deliberate.** The spec's §7.4 describes `ReputationSystem` as reading trip satisfactions generally; the plan narrows that to reading `MarketSystem#pendingOutcomes()` through the `NeighborReader` interface, so `reputation/` never imports `market/system.ts` and no import cycle forms. Same technique in `loyalty/`.

**Type consistency.** `TripOutcome` is defined once in `loyalty/types.ts` and imported everywhere. `StoreTerms` is defined once in `market/choice.ts`. `MarketReader` and `NeighborReader` are separate on purpose — reputation needs `householdPosition`, loyalty does not, and neither should demand more of `MarketSystem` than it uses. `storeIndex` means the same thing in every signature: 0 = player, 1..n = rivals in authored roster order.

**Two re-baselines, not one.** Task 2's is positional (bytes moved between systems, behaviour identical); Task 7's is behavioural (households now shop on their own). Splitting them means each commit message can make one true claim instead of one muddy one, and each has a specific "confirm the others are untouched first" check.
