# Rival Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static rival stores into a reactive `src/sim/systems/rivals` system — personality
vectors, an RNG-free weekly reactive tick, and three signature mechanics — read by market and loyalty
through a narrow view, with two new bosses (Grocerteria 24, BulkHaus Club) authored alongside
Sav-A-Lott.

**Architecture:** A new pure-sim `RivalsSystem` owns the evolving rival state and registers *before*
`market`. `MarketSystem` and `LoyaltySystem` stop holding a static `RivalStore[]` and instead read
current per-`(rival, segment)` terms and effective loyalty decay through a `RivalsView`. The
market↔rivals circular dependency is resolved with the same late-binding deps getters the codebase
already uses for market↔loyalty. The weekly tick is a pure function of last week's share and the
player's price level — no RNG — so it never perturbs the `rivalNoise` draw sequence store choice
consumes.

**Tech Stack:** TypeScript (`strict`, `noUncheckedIndexedAccess`), Vitest, Zod v4, JSON5 content via
Vite `?raw` imports.

## Global Constraints

- `src/sim/**` imports nothing from Phaser, DOM, `window`, Capacitor, or Supabase. `rivals` is pure sim.
- No `Math.random()` and no `Date.now()` anywhere in `src/sim`. The weekly reactive tick and all
  signatures are **RNG-free** — verified by test. Store choice remains the only `rivalNoise` consumer.
- New system → new directory under `src/sim/systems/` with `index.ts`, `types.ts`, `*.test.ts`.
- Magic numbers live in `content/balance/*.json5` (new file `rivals.json5`), never inlined. Zod-validated.
- All brand/product names fictional (§2). **Log every new rival in `docs/legal/parody-review.md`
  BEFORE implementing it.** The two new bosses satirize a *category*, never a real chain; no real
  name, logo, slogan, or trade-dress color pairing.
- After every meaningful change: `npm run verify`.
- **If a golden hash changes, STOP.** Re-baseline only in a dedicated commit that explains why. The
  `shopper-trip` + `catchment-week` hashes change legitimately here (roster growth + evolving state);
  the other seven scenarios must stay byte-identical.
- Registration order is part of the determinism contract. Target order:
  `grid → pathing → inventory → checkout → economy → rivals → market → shoppers → loyalty → reputation`.

**Spec:** `docs/superpowers/specs/2026-08-04-rival-dynamics-design.md`.

---

### Task 1: Personality schema, parody review, and rival content

**Files:**
- Modify: `src/sim/systems/market/types.ts` (add `RivalPersonality`, extend `RivalStore`)
- Modify: `src/sim/systems/market/config.ts:72-89` (extend `RivalStoreSchema`)
- Modify: `docs/legal/parody-review.md` (two new entries — written FIRST)
- Modify: `content/rivals/sav-a-lott.json5` (add `personality`)
- Create: `content/rivals/grocerteria-24.json5`
- Create: `content/rivals/bulkhaus-club.json5`
- Test: `src/sim/systems/market/config.test.ts` (create if absent, else extend)

**Interfaces:**
- Produces: `RivalPersonality` type; `RivalStore.personality?: RivalPersonality`; three parseable
  rival content files. `DEFAULT_RIVAL_STORES` still `[savALott]` at end of this task (roster grows in
  Task 7 — keeps every commit green until the consuming system exists).

- [ ] **Step 1: Write the parody-review entries FIRST (hard ordering rule).**

Append two rows to `docs/legal/parody-review.md`, each covering: real-world archetype, borrowed
*strategy*, and what is deliberately NOT borrowed (name, logo, colors, slogan, trade dress). Run the
four-part §2.2 name test on "Grocerteria 24" and "BulkHaus Club" in the entry text.
- Grocerteria 24 — archetype: 24-hour convenience grocer; borrowed strategy: never-closes, owns the
  overnight window; not borrowed: any real convenience-chain name/logo/colors.
- BulkHaus Club — archetype: warehouse membership club; borrowed strategy: membership lock-in +
  sample corridor; not borrowed: any real warehouse-club name/logo/colors.

- [ ] **Step 2: Write the failing test for the personality schema.**

Create/extend `src/sim/systems/market/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import grocerteria from '../../../../content/rivals/grocerteria-24.json5?raw';
import bulkhaus from '../../../../content/rivals/bulkhaus-club.json5?raw';
import { parseRivalStore } from './config.js';

describe('rival personality schema', () => {
  it('parses all three authored rivals with a personality block', () => {
    for (const raw of [savALott, grocerteria, bulkhaus]) {
      const rival = parseRivalStore(JSON5.parse(raw));
      expect(rival.personality).toBeDefined();
      expect(rival.personality!.reactivity).toBeGreaterThanOrEqual(0);
      expect(rival.personality!.reactivity).toBeLessThanOrEqual(1);
    }
  });

  it('rejects an unknown signature id', () => {
    const bad = { ...JSON5.parse(savALott), personality: { ...JSON5.parse(savALott).personality, signature: 'nope' } };
    expect(() => parseRivalStore(bad)).toThrow();
  });

  it('rejects a personality axis outside [0,1]', () => {
    const bad = { ...JSON5.parse(savALott), personality: { ...JSON5.parse(savALott).personality, priceAggression: 1.5 } };
    expect(() => parseRivalStore(bad)).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.**

Run: `npx vitest run src/sim/systems/market/config.test.ts`
Expected: FAIL — content files lack `personality` / schema has no `personality`.

- [ ] **Step 4: Add the type.**

In `src/sim/systems/market/types.ts`, above `RivalStore`:

```ts
export const RIVAL_SIGNATURES = ['oneRegister', 'neverCloses', 'membershipLockIn'] as const;
export type RivalSignatureId = (typeof RIVAL_SIGNATURES)[number];

export interface RivalPersonality {
  readonly priceAggression: number;   // [0,1]
  readonly qualityInvestment: number; // [0,1]
  readonly marketingSpend: number;    // [0,1]
  readonly expansionRate: number;     // [0,1] — authored now; consumer deferred (spec §6)
  readonly reactivity: number;        // [0,1]
  readonly signature: RivalSignatureId;
}
```

Add to `RivalStore`: `readonly personality?: RivalPersonality | undefined;` (the explicit `| undefined`
is what `exactOptionalPropertyTypes` requires for Zod `.optional()` output — match the existing
`loyaltyDecay` field's pattern).

- [ ] **Step 5: Extend the Zod schema.**

In `config.ts`, add before `RivalStoreSchema` and reference it:

```ts
import { RIVAL_SIGNATURES } from './types.js';

const unit = z.number().min(0).max(1);
const RivalPersonalitySchema = z.object({
  priceAggression: unit,
  qualityInvestment: unit,
  marketingSpend: unit,
  expansionRate: unit,
  reactivity: unit,
  signature: z.enum(RIVAL_SIGNATURES),
});
```

Add `personality: RivalPersonalitySchema.optional(),` to `RivalStoreSchema`.

- [ ] **Step 6: Author the content.**

Add a `personality` block to `content/rivals/sav-a-lott.json5` (`signature: 'oneRegister'`; high
`priceAggression`, low everything else — a failing discounter that only knows how to cut price).
Create `grocerteria-24.json5` (CL 35, `identity: 'convenience-24h'`, `signature: 'neverCloses'`,
authored baseline terms per §3, mid `reactivity`) and `bulkhaus-club.json5` (CL 48,
`identity: 'warehouse-club'`, `signature: 'membershipLockIn'`, high `assortmentBreadth`, an explicit
low `loyaltyDecay` baseline for lock-in). Each file opens with the same parody comment header
`sav-a-lott.json5` uses, pointing at its parody-review row.

- [ ] **Step 7: Run the test to verify it passes.**

Run: `npx vitest run src/sim/systems/market/config.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add docs/legal/parody-review.md content/rivals src/sim/systems/market/types.ts \
        src/sim/systems/market/config.ts src/sim/systems/market/config.test.ts
git commit -m "feat(rivals): personality vector schema + Grocerteria 24 and BulkHaus Club content

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Rivals balance config + system types

**Files:**
- Create: `content/balance/rivals.json5`
- Create: `src/sim/systems/rivals/config.ts`
- Create: `src/sim/systems/rivals/types.ts`
- Create: `src/types/json5.d.ts` entry — already exists project-wide; no change needed.
- Test: `src/sim/systems/rivals/config.test.ts`

**Interfaces:**
- Produces: `RivalsConfig` type + `parseRivalsConfig` + `DEFAULT_RIVALS_CONFIG`. `RivalState`,
  `RivalShare`, `RivalsView`, `RivalDeps`, `RivalSignature` interfaces.

- [ ] **Step 1: Write the failing config test.**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_RIVALS_CONFIG, parseRivalsConfig } from './config.js';

describe('rivals config', () => {
  it('loads defaults with a positive weekly window and a price floor in (0,1]', () => {
    expect(DEFAULT_RIVALS_CONFIG.weeklyWindowDays).toBeGreaterThan(0);
    expect(DEFAULT_RIVALS_CONFIG.minPriceIndex).toBeGreaterThan(0);
    expect(DEFAULT_RIVALS_CONFIG.minPriceIndex).toBeLessThanOrEqual(1);
  });
  it('rejects a non-positive weekly window', () => {
    expect(() => parseRivalsConfig({ ...raw(), weeklyWindowDays: 0 })).toThrow();
  });
});
function raw() { return JSON.parse(JSON.stringify(DEFAULT_RIVALS_CONFIG)); }
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run src/sim/systems/rivals/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Author `content/balance/rivals.json5`.**

```json5
// Phase 2.0 (M2) rival dynamics constants — PLAN.md §5.8. See
// docs/superpowers/specs/2026-08-04-rival-dynamics-design.md.
{
  weeklyWindowDays: 7,        // reactivity cadence — "checked weekly, not daily"
  minPriceIndex: 0.7,         // rivals cut toward viability, never below (no money cheat)
  reactionRate: 0.05,         // base step size before personality scaling
  // derivation: how personality shifts the authored baseline into initial terms
  derive: {
    qualityFromInvestment: 0.25,  // quality += qualityInvestment * this
    priceFromAggression: 0.20,    // priceIndex -= priceAggression * this
    ambianceFromMarketing: 0.15,  // ambiance += marketingSpend * this
    decayFloorFromLove: 0.5,      // effective loyaltyDecay scaled down as CL/100 rises
  },
  signatures: {
    oneRegister: { serviceCongestion: 0.4 },   // service -= share * this
    neverCloses: { segmentBump: 0.2 },         // service/ambiance += this for convenience/student
    membershipLockIn: { decayMultiplier: 0.3, assortmentBump: 0.15 },
  },
}
```

- [ ] **Step 4: Write `src/sim/systems/rivals/config.ts`** with a Zod schema mirroring the file
(`weeklyWindowDays` positive int; `minPriceIndex` in `(0,1]`; all coefficients finite/non-negative),
`parseRivalsConfig`, and `DEFAULT_RIVALS_CONFIG = parseRivalsConfig(JSON5.parse(raw))` importing
`../../../../content/balance/rivals.json5?raw`. Follow `market/config.ts` exactly for structure.

- [ ] **Step 5: Write `src/sim/systems/rivals/types.ts`.**

```ts
import type { Segment } from '../market/types.js';
import type { RivalStore } from '../market/types.js';
import type { RivalsConfig } from './config.js';

/** Per-store trip tallies over the current weekly window. */
export interface RivalShare {
  readonly playerShare: number; // player's fraction of window trips
  readonly ownShare: number;    // this rival's fraction of window trips
}

/** A rival's evolving state: authored baseline + current derived terms + signature scratch. */
export interface RivalState {
  readonly base: RivalStore;    // authored, immutable
  derived: RivalStore;          // current effective terms (segment-independent parts)
  signature: Record<string, number>; // per-signature scalar scratch (e.g. congestion)
}

export interface RivalsView {
  effectiveStore(rivalIndex: number, segment: Segment): RivalStore;
  effectiveDecay(rivalIndex: number): number;
  stores(): readonly RivalStore[];
  count(): number;
}

export interface RivalDeps {
  outcomes(): readonly { readonly storeIndex: number }[]; // market.pendingOutcomes()
  playerPriceLevel(): number;                             // economy.priceLevel()
}

export interface RivalSignature {
  readonly id: string;
  weeklyTick(state: RivalState, share: RivalShare, config: RivalsConfig): void;
  shapeTerms(base: RivalStore, segment: Segment, state: RivalState, config: RivalsConfig): RivalStore;
}
```

- [ ] **Step 6: Run to verify pass; typecheck.**

Run: `npx vitest run src/sim/systems/rivals/config.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit.**

```bash
git add content/balance/rivals.json5 src/sim/systems/rivals/config.ts \
        src/sim/systems/rivals/types.ts src/sim/systems/rivals/config.test.ts
git commit -m "feat(rivals): balance config + system interfaces

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `deriveInitialTerms` (pure)

**Files:**
- Create: `src/sim/systems/rivals/derive.ts`
- Test: `src/sim/systems/rivals/derive.test.ts`

**Interfaces:**
- Consumes: `RivalStore`, `RivalPersonality` (Task 1); `RivalsConfig` (Task 2).
- Produces: `deriveInitialTerms(base: RivalStore, config: RivalsConfig): RivalStore` — returns the
  run's initial derived terms. A rival without `personality` returns `base` unchanged.

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import { deriveInitialTerms } from './derive.js';

const base = parseRivalStore(JSON5.parse(savALott));

describe('deriveInitialTerms', () => {
  it('pushes priceIndex down for an aggressive discounter but never below the floor', () => {
    const d = deriveInitialTerms(base, DEFAULT_RIVALS_CONFIG);
    expect(d.priceIndex).toBeLessThanOrEqual(base.priceIndex);
    expect(d.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
  });
  it('keeps every term inside its domain', () => {
    const d = deriveInitialTerms(base, DEFAULT_RIVALS_CONFIG);
    for (const t of [d.quality, d.service, d.ambiance, d.assortmentBreadth]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
  it('is a no-op for a rival without a personality', () => {
    const { personality, ...noPersona } = base;
    expect(deriveInitialTerms(noPersona as typeof base, DEFAULT_RIVALS_CONFIG)).toEqual(noPersona);
  });
  it('lowers effective loyaltyDecay as community love rises', () => {
    const low = deriveInitialTerms({ ...base, communityLove: 10 }, DEFAULT_RIVALS_CONFIG);
    const high = deriveInitialTerms({ ...base, communityLove: 90 }, DEFAULT_RIVALS_CONFIG);
    expect(high.loyaltyDecay!).toBeLessThan(low.loyaltyDecay!);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run src/sim/systems/rivals/derive.test.ts`
Expected: FAIL — `deriveInitialTerms` undefined.

- [ ] **Step 3: Implement `derive.ts` (pure, clamped).**

```ts
import type { MarketConfig } from '../market/config.js';
import { DEFAULT_MARKET_CONFIG } from '../market/config.js';
import type { RivalStore } from '../market/types.js';
import type { RivalsConfig } from './config.js';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function deriveInitialTerms(
  base: RivalStore,
  config: RivalsConfig,
  market: MarketConfig = DEFAULT_MARKET_CONFIG,
): RivalStore {
  const p = base.personality;
  if (!p) return base;
  const d = config.derive;
  const priceIndex = Math.max(config.minPriceIndex, base.priceIndex - p.priceAggression * d.priceFromAggression);
  const authoredDecay = base.loyaltyDecay ?? market.loyaltyDecayDefault;
  const loyaltyDecay = authoredDecay * (1 - (base.communityLove / 100) * d.decayFloorFromLove);
  return {
    ...base,
    quality: clamp01(base.quality + p.qualityInvestment * d.qualityFromInvestment),
    ambiance: clamp01(base.ambiance + p.marketingSpend * d.ambianceFromMarketing),
    priceIndex,
    loyaltyDecay,
  };
}
```

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/sim/systems/rivals/derive.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/sim/systems/rivals/derive.ts src/sim/systems/rivals/derive.test.ts
git commit -m "feat(rivals): pure deriveInitialTerms from personality + community love

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Weekly reactivity (pure)

**Files:**
- Create: `src/sim/systems/rivals/reactivity.ts`
- Test: `src/sim/systems/rivals/reactivity.test.ts`

**Interfaces:**
- Consumes: `RivalStore`, `RivalPersonality`, `RivalsConfig`, `RivalShare`.
- Produces: `reactWeekly(current: RivalStore, share: RivalShare, playerPriceLevel: number, config): RivalStore`
  — pure, RNG-free, returns adjusted terms. `playerPriceLevel` is the player's basket price index
  (1.0 = at reference). Undercutting means moving `priceIndex` below `playerPriceLevel`.

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import savALott from '../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from './config.js';
import { reactWeekly } from './reactivity.js';

const base = parseRivalStore(JSON5.parse(savALott));

describe('reactWeekly', () => {
  it('cuts price toward undercutting the player when losing share, never below the floor', () => {
    const losing = { playerShare: 0.8, ownShare: 0.2 };
    const next = reactWeekly(base, losing, 1.0, DEFAULT_RIVALS_CONFIG);
    expect(next.priceIndex).toBeLessThanOrEqual(base.priceIndex);
    expect(next.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
  });
  it('lifts ambiance when the player is taking share', () => {
    const losing = { playerShare: 0.9, ownShare: 0.1 };
    expect(reactWeekly(base, losing, 1.0, DEFAULT_RIVALS_CONFIG).ambiance)
      .toBeGreaterThanOrEqual(base.ambiance);
  });
  it('keeps all terms in domain across extreme inputs', () => {
    for (const s of [{ playerShare: 1, ownShare: 0 }, { playerShare: 0, ownShare: 1 }]) {
      const n = reactWeekly(base, s, 2, DEFAULT_RIVALS_CONFIG);
      for (const t of [n.quality, n.service, n.ambiance]) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1); }
      expect(n.priceIndex).toBeGreaterThanOrEqual(DEFAULT_RIVALS_CONFIG.minPriceIndex);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run src/sim/systems/rivals/reactivity.test.ts`
Expected: FAIL — `reactWeekly` undefined.

- [ ] **Step 3: Implement `reactivity.ts`** — pure, no RNG. Scale each move by
`personality.reactivity × config.reactionRate`. Price moves toward
`min(current.priceIndex, playerPriceLevel)` when `playerShare > ownShare`, floored at
`config.minPriceIndex`. Ambiance rises with `marketingSpend` when losing share. `qualityInvestment`
splits the reaction between `quality` and price. Clamp all terms. Return a rival without
`personality` unchanged.

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/sim/systems/rivals/reactivity.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/sim/systems/rivals/reactivity.ts src/sim/systems/rivals/reactivity.test.ts
git commit -m "feat(rivals): pure RNG-free weekly reactivity with price floor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Signatures + registry

**Files:**
- Create: `src/sim/systems/rivals/signatures/one-register.ts`
- Create: `src/sim/systems/rivals/signatures/never-closes.ts`
- Create: `src/sim/systems/rivals/signatures/membership-lock-in.ts`
- Create: `src/sim/systems/rivals/signatures/index.ts`
- Test: `src/sim/systems/rivals/signatures/signatures.test.ts`

**Interfaces:**
- Consumes: `RivalSignature`, `RivalState`, `RivalShare`, `RivalsConfig`, `Segment`, `RivalStore`.
- Produces: `signatureFor(id: RivalSignatureId): RivalSignature`. Each signature's `weeklyTick`
  mutates `state.derived`/`state.signature`; `shapeTerms` returns a per-segment-adjusted copy.

- [ ] **Step 1: Write the failing tests (one characteristic tell each).**

```ts
import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import bulkhaus from '../../../../../content/rivals/bulkhaus-club.json5?raw';
import savALott from '../../../../../content/rivals/sav-a-lott.json5?raw';
import { parseRivalStore } from '../../market/config.js';
import { DEFAULT_RIVALS_CONFIG } from '../config.js';
import type { RivalState } from '../types.js';
import { signatureFor } from './index.js';

const stateOf = (raw: string): RivalState => {
  const base = parseRivalStore(JSON5.parse(raw));
  return { base, derived: { ...base }, signature: {} };
};

describe('signatures', () => {
  it('oneRegister degrades service under sustained high own-share', () => {
    const sig = signatureFor('oneRegister');
    const s = stateOf(savALott);
    const before = s.derived.service;
    sig.weeklyTick(s, { playerShare: 0.1, ownShare: 0.9 }, DEFAULT_RIVALS_CONFIG);
    expect(s.derived.service).toBeLessThan(before);
  });

  it('neverCloses bumps service for convenience but not foodie', () => {
    const sig = signatureFor('neverCloses');
    const s = stateOf(savALott);
    const conv = sig.shapeTerms(s.derived, 'convenience', s, DEFAULT_RIVALS_CONFIG);
    const food = sig.shapeTerms(s.derived, 'foodie', s, DEFAULT_RIVALS_CONFIG);
    expect(conv.service).toBeGreaterThan(food.service);
  });

  it('membershipLockIn lowers effective decay and bumps assortment for bulk', () => {
    const sig = signatureFor('membershipLockIn');
    const s = stateOf(bulkhaus);
    sig.weeklyTick(s, { playerShare: 0.5, ownShare: 0.5 }, DEFAULT_RIVALS_CONFIG);
    expect(s.derived.loyaltyDecay!).toBeLessThan(s.base.loyaltyDecay ?? 1);
    const bulk = sig.shapeTerms(s.derived, 'bulk', s, DEFAULT_RIVALS_CONFIG);
    expect(bulk.assortmentBreadth).toBeGreaterThan(s.derived.assortmentBreadth);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run src/sim/systems/rivals/signatures/signatures.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the three signatures + registry.**

`one-register.ts` — `weeklyTick`: `state.derived.service = clamp01(base.service - ownShare *
config.signatures.oneRegister.serviceCongestion)` (recovers when share falls because it reads from
`base.service` each week, not the previous derived value); `shapeTerms`: identity.
`never-closes.ts` — `weeklyTick`: no-op; `shapeTerms`: for `convenience`/`student`, add
`config.signatures.neverCloses.segmentBump` to `service` and `ambiance` (clamped), else return base.
`membership-lock-in.ts` — `weeklyTick`: `state.derived.loyaltyDecay = (base.loyaltyDecay ?? default) *
config.signatures.membershipLockIn.decayMultiplier`; `shapeTerms`: for `bulk`/`family`, add
`assortmentBump` to `assortmentBreadth` (clamped), else base.
`index.ts` — a frozen `Record<RivalSignatureId, RivalSignature>` and
`signatureFor(id)` that throws on an unknown id.

- [ ] **Step 4: Run to verify pass.**

Run: `npx vitest run src/sim/systems/rivals/signatures/signatures.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/sim/systems/rivals/signatures
git commit -m "feat(rivals): oneRegister, neverCloses, membershipLockIn signatures

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `RivalsSystem` + barrel + sim export

**Files:**
- Create: `src/sim/systems/rivals/system.ts`
- Create: `src/sim/systems/rivals/index.ts`
- Modify: `src/sim/index.ts` (export the new surface)
- Test: `src/sim/systems/rivals/system.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–5; `System`, `World`, `Hasher`, `TICKS_PER_SIM_DAY`; `RivalDeps`.
- Produces: `class RivalsSystem implements System, RivalsView`. Constructor:
  `new RivalsSystem(deps: RivalDeps, rivals: readonly RivalStore[] = DEFAULT_RIVAL_STORES, config = DEFAULT_RIVALS_CONFIG)`.
  Also `staticRivalsView(rivals, config): RivalsView` for tests/wiring that need a view without the
  live system (derives once, never evolves).

- [ ] **Step 1: Write the failing test.**

```ts
import { describe, expect, it } from 'vitest';
import { World } from '../../core/world.js';
import { TICKS_PER_SIM_DAY } from '../../core/clock.js';
import { DEFAULT_RIVAL_STORES } from '../market/config.js';
import { RivalsSystem } from './system.js';

function make(outcomes: () => { storeIndex: number }[]) {
  return new RivalsSystem({ outcomes, playerPriceLevel: () => 1.0 }, DEFAULT_RIVAL_STORES);
}

describe('RivalsSystem', () => {
  it('exposes a derived effective store for each rival at construction', () => {
    const r = make(() => []);
    expect(r.count()).toBe(DEFAULT_RIVAL_STORES.length);
    const s = r.effectiveStore(0, 'family');
    expect(s.priceIndex).toBeGreaterThan(0);
  });

  it('reacts on the weekly boundary: sustained player wins push a rival to cut price', () => {
    // Every recorded trip goes to the player (storeIndex 0) → rival is losing share.
    const r = make(() => [{ storeIndex: 0 }]);
    const world = new World({ seed: 1 });
    world.register(r);
    const before = r.effectiveStore(0, 'family').priceIndex;
    for (let t = 1; t <= TICKS_PER_SIM_DAY * 7; t++) world.step();
    expect(r.effectiveStore(0, 'family').priceIndex).toBeLessThanOrEqual(before);
  });

  it('draws no RNG (rivalNoise cursor unchanged over a weekly tick)', () => {
    const r = make(() => [{ storeIndex: 0 }]);
    const world = new World({ seed: 1 });
    world.register(r);
    const cursorBefore = world.rng.get('rivalNoise').cursor; // see note in Step 3
    for (let t = 1; t <= TICKS_PER_SIM_DAY * 7; t++) world.step();
    expect(world.rng.get('rivalNoise').cursor).toBe(cursorBefore);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run src/sim/systems/rivals/system.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `RivalsSystem`.**

State: `RivalState[]` (one per rival), built at construction via `deriveInitialTerms(base, config)`
into `derived`. `#tally: number[]` sized `count()+1` (index 0 = player) reset each weekly window.
`update(world)`:
1. For each `deps.outcomes()` entry, `this.#tally[o.storeIndex]++`.
2. If `world.tick > 0 && world.tick % (TICKS_PER_SIM_DAY * config.weeklyWindowDays) === 0`: compute
   total, derive `RivalShare` per rival (`playerShare`, `ownShare`), run
   `reactWeekly(state.derived, share, deps.playerPriceLevel(), config)` → assign back to
   `state.derived`, then `signatureFor(base.personality.signature).weeklyTick(state, share, config)`,
   then reset `#tally` to zeros.

`hash(_world, hasher)`: `hasher.u32(count)`; per rival in index order, fold `derived.quality/service/
ambiance/priceIndex/assortmentBreadth/(loyaltyDecay ?? default)` as `f64`, each `signature` scratch
value sorted by key, and each `#tally` slot as `u32`.

`RivalsView`: `stores()` returns `state.derived` array; `count()`; `effectiveStore(i, segment)` =
`signatureFor(base.personality.signature).shapeTerms(state.derived, segment, state, config)` (or
`state.derived` when no personality); `effectiveDecay(i)` = `state.derived.loyaltyDecay ??
market.loyaltyDecayDefault`.

> **RNG note for Step 1's cursor test:** confirm the actual accessor on the `Stream` class (it may be
> `#cursor` private). If no public cursor exists, assert RNG-freedom differently: run the same
> `RivalsSystem` weekly tick twice from equal state and assert byte-identical `hash` output *and*
> that a sibling counter-system reading `rivalNoise` produces the same sequence with and without the
> `RivalsSystem` registered. Adjust the test to whatever the `Stream` API actually exposes — do not
> add a public cursor just for the test.

`staticRivalsView(rivals, config)`: same view semantics over `deriveInitialTerms`-once state, no
`update`.

`index.ts` barrel exports `RivalsSystem`, `staticRivalsView`, `deriveInitialTerms`, `reactWeekly`,
`signatureFor`, `DEFAULT_RIVALS_CONFIG`, `parseRivalsConfig`, and the types. Add the same names to
`src/sim/index.ts`.

- [ ] **Step 4: Run to verify pass; typecheck; boundary test.**

Run: `npx vitest run src/sim/systems/rivals/ tests/boundaries && npx tsc --noEmit`
Expected: PASS — including `tests/boundaries` (rivals is pure sim).

- [ ] **Step 5: Commit.**

```bash
git add src/sim/systems/rivals/system.ts src/sim/systems/rivals/index.ts src/sim/index.ts \
        src/sim/systems/rivals/system.test.ts
git commit -m "feat(rivals): RivalsSystem — share accumulation, weekly tick, RivalsView

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Wire the view into market, loyalty, bridge, and scenarios

**Files:**
- Modify: `src/sim/systems/market/system.ts` (constructor param + `#termsFor` + `#resolveRivalTrip` + `storeIndexOf`)
- Modify: `src/sim/systems/market/config.ts:95-97` (`DEFAULT_RIVAL_STORES` → all three)
- Modify: `src/sim/systems/loyalty/system.ts:34-38,88-98` (read count + effective decay via view)
- Modify: `src/sim/systems/economy/system.ts` (add `priceLevel(tick)` accessor)
- Modify: `src/bridge/build-bridge.ts` (construct + register `RivalsSystem`)
- Modify: `tests/golden/scenarios.ts` (register rivals in `shopper-trip` + `catchment-week`)
- Modify affected unit tests: `market/store-choice.test.ts`, `market/system.test.ts`,
  `loyalty/system.test.ts`, `reputation/system.test.ts`, `shoppers/system.test.ts`,
  `economy/*.test.ts` construction sites that build a full market.

**Interfaces:**
- Consumes: `RivalsSystem`/`staticRivalsView` (Task 6).
- Produces: `MarketSystem` constructed with `rivalsView: RivalsView | null` in place of the old
  `rivals: readonly RivalStore[]` positional param; `EconomySystem.priceLevel(tick): number`;
  `LoyaltySystem` constructed with `(market, rivalsView, config)`.

- [ ] **Step 1: Add the economy accessor (test-first).**

In `economy/system.test.ts`, assert `priceLevel(tick)` returns `1` when every good is at reference
price and `<1` after a `setPrice` below reference. Implement `priceLevel(tick)` on `EconomySystem`:
mean of `priceOf(id, tick) / referencePriceOf(id)` over the catalog. Run the test → PASS.

- [ ] **Step 2: Refactor `MarketSystem` to read the view (test-first).**

Change the constructor's 4th positional from `rivals` to `rivalsView: RivalsView | null = null`. In
`#termsFor`, replace `this.#rivals.map(...)` with iteration over `rivalsView.stores()`, calling
`rivalStoreTerms(rivalsView.effectiveStore(i, household.segment), { loyalty: deps.loyalty.get(household.id, i+1), brandAffinity: affinity[store.identity] ?? 0, travelCost: travelCost(household.position, store.position, this.#catchmentConfig), config: this.#config })`.
In `#resolveRivalTrip`, read `rivalsView.effectiveStore(storeIndex-1, household.segment)` (pass the
household's segment — look it up from the household map). In `storeIndexOf`, iterate
`rivalsView.stores()`. When `rivalsView` is null, `#termsFor` returns only the player term and
`#resolveRivalTrip` is never reached (no rival can be chosen). Update `market/store-choice.test.ts`
and `market/system.test.ts` to pass `staticRivalsView(DEFAULT_RIVAL_STORES, DEFAULT_RIVALS_CONFIG)`;
re-assert expected probabilities against derived (not raw authored) terms. Run those files → PASS.

- [ ] **Step 3: Refactor `LoyaltySystem` to read the view (test-first).**

Constructor becomes `(market: MarketReader, rivals: RivalsView, config?)`; `storeCount =
rivals.count() + 1`. Replace the cached `#decay` array: in `#decayDay`, read decay per store as
`store === 0 ? config.loyaltyDecayDefault : rivals.effectiveDecay(store - 1)`. Update
`loyalty/system.test.ts` and `reputation/system.test.ts` construction to pass a
`staticRivalsView(...)`. Run those files → PASS.

- [ ] **Step 4: Grow the roster + wire the bridge & scenarios.**

Set `DEFAULT_RIVAL_STORES` to `[savALott, grocerteria24, bulkhausClub]` (parse all three raw files,
ascending CL). In `build-bridge.ts` and both full golden scenarios (`shopper-trip`, `catchment-week`),
construct `RivalsSystem` with deps `{ outcomes: () => market.pendingOutcomes(), playerPriceLevel: () =>
economy.priceLevel(world.tick) }` (use the same `marketBox` late-binding already present), register it
**before** market, and pass the `RivalsSystem` instance as `MarketSystem`'s `rivalsView` and
`LoyaltySystem`'s `rivals`. `playerPriceLevel` needs the current tick — capture it via a closure over
the world or read `world.tick` inside the getter.

- [ ] **Step 5: Run the full unit suite (golden excluded).**

Run: `npx vitest run --exclude tests/golden`
Expected: PASS. Fix any remaining construction sites the compiler/tests flag.

- [ ] **Step 6: Commit (no golden re-baseline yet).**

```bash
git add src/sim/systems/market src/sim/systems/loyalty/system.ts src/sim/systems/economy \
        src/bridge/build-bridge.ts tests/golden/scenarios.ts \
        src/sim/systems/**/system.test.ts src/sim/systems/market/store-choice.test.ts
git commit -m "feat(rivals): read rivals through RivalsView in market, loyalty, bridge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Golden — new scenario + dedicated re-baseline

**Files:**
- Modify: `tests/golden/scenarios.ts` (add `rival-reaction` scenario)
- Modify: `tests/golden/hashes.json` (re-baseline `shopper-trip`, `catchment-week`; add `rival-reaction`)

**Interfaces:**
- Consumes: the fully wired world (Task 7).

- [ ] **Step 1: Add the `rival-reaction` scenario** to `SCENARIOS` — a ≥3-week run
(`ticks: 21 * 1440`, `sampleEvery: 400`) with all three rivals present and households spread across
segments near each store (reuse `catchment-week`'s household layout, extended). It exercises the
weekly reactive tick and all three signatures together.

- [ ] **Step 2: Confirm the seven unrelated scenarios are byte-identical.**

Run: `npx vitest run tests/golden 2>&1 | tee /tmp/golden.txt` — expect FAIL only on `shopper-trip`,
`catchment-week`, and `rival-reaction` (missing baseline). If `empty-world`, `single-system`,
`three-systems`, `speed-and-pause`, `grid-build`, `grid-and-pathing`, or `pricing-and-promotions`
differ, **STOP** — that's a real bug, not a re-baseline.

- [ ] **Step 3: Re-baseline in this dedicated commit.**

Regenerate `hashes.json` (via the project's baseline script, or `runScenario` output). Verify the diff
touches only the three expected scenario keys.

- [ ] **Step 4: Full verify.**

Run: `npm run verify`
Expected: PASS end to end.

- [ ] **Step 5: Commit the re-baseline alone, with rationale.**

```bash
git add tests/golden/scenarios.ts tests/golden/hashes.json
git commit -m "test(golden): add rival-reaction; re-baseline shopper-trip + catchment-week

Rivals now carry hashed evolving state and the roster grew 1->3 (Grocerteria 24,
BulkHaus Club). shopper-trip and catchment-week hashes change for that reason and
are re-baselined here; the other seven scenarios are confirmed byte-identical.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Manual sanity check + handoff

**Files:**
- Modify: `docs/handoff.md`

- [ ] **Step 1: Dev-server sanity check.** `npm run dev`, place a shelf + self-checkout, add
households across `priceHunter`/`family`/`convenience`/`student` segments near different stores,
fast-forward via the bridge, and confirm rival share shifts over weeks and Sav-A-Lott's service
degrades as it captures share. Note any surprises.

- [ ] **Step 2: Update `docs/handoff.md`** — what landed (rival dynamics, 3 signatures, 2 new
bosses), the golden re-baseline rationale, the deferred items from spec §6 (`expansionRate` inert,
per-household membership reduced to store-wide decay, intra-day timing), and that the **2.0 monotonic
gate is still open pending the Balance Harness sub-project**.

- [ ] **Step 3: Commit.**

```bash
git add docs/handoff.md
git commit -m "docs(handoff): rival dynamics complete; 2.0 gate pending harness

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §2 architecture (new system, registration order, seam, circular dep, share accumulation, loyalty
  roster, determinism) → Tasks 6, 7, 8. ✓
- §3 schema + derivation + two bosses + parody review → Tasks 1, 3. ✓
- §4 weekly reactive tick + `minPriceIndex` invariant → Tasks 4, 6. ✓
- §5 signature interface + three signatures → Task 5. ✓
- §6 deferred items → recorded in Task 9 handoff. ✓
- §7 testing (unit, golden, boundary, verify) → Tasks 3–8. ✓
- §8 definition of done → Tasks 1–9 collectively. ✓

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Larger implementations
(Steps in Tasks 5–7) are described with exact field-level operations and signatures rather than full
literal bodies, and every test step has real assertions. The one runtime unknown (the `Stream`
cursor accessor) is called out explicitly with a concrete fallback rather than assumed.

**Type consistency:** `RivalsView` (`effectiveStore`, `effectiveDecay`, `stores`, `count`),
`RivalState` (`base`/`derived`/`signature`), `RivalShare` (`playerShare`/`ownShare`),
`deriveInitialTerms(base, config, market?)`, `reactWeekly(current, share, playerPriceLevel, config)`,
`signatureFor(id)`, and `RivalsSystem(deps, rivals?, config?)` are used consistently across Tasks
2–8. `EconomySystem.priceLevel(tick)` defined in Task 7 Step 1 before its Task 7 Step 4 use.
`DEFAULT_RIVAL_STORES` stays length 1 through Task 6 and grows to 3 in Task 7 — deliberate, noted at
both points.
