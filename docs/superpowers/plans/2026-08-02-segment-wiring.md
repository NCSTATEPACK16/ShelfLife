# Phase 2.0a completion — wire household segment through the sim

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish phase 2.0a. `src/sim/systems/market/` already has the `Segment`/`SegmentDef`/`SegmentConfig` data model and `content/balance/segments.json5` (committed in `955bd9f`), but nothing reads it yet — `Household` has no `segment` field, `addHousehold` doesn't accept one, and `advancePantryDay` ignores `consumptionMultiplier`. This plan wires it through so pantry depletion becomes segment-dependent, matching the already-written spec at `docs/superpowers/specs/2026-08-01-market-segments-design.md`.

**Architecture:** `Household` (in `src/sim/systems/shoppers/types.ts`) gains a required `segment: Segment` field. The `addHousehold` command (in `src/sim/core/commands.ts`) gains a required `segment` field and folds it into the world hash. `advancePantryDay` (in `src/sim/systems/shoppers/household.ts`) takes a `SegmentConfig` parameter and multiplies each good's `depletionPerDay` by `consumptionMultiplierFor(config, household.segment)`. `ShoppersSystem` passes `DEFAULT_SEGMENT_CONFIG` at its one call site and folds `segment` into its own `hash()`. Every existing `addHousehold` push (bridge, unit tests, golden scenario) gets an explicit `segment: 'family'` — `family` is already configured in `segments.json5` with `consumptionMultiplier: 1.0`, the neutral value, specifically so this change doesn't need to perturb behavior at those call sites.

**Tech Stack:** TypeScript, Vitest. No new dependencies.

## Global Constraints

- `src/sim/**` imports nothing from Phaser, the DOM, `window`, Capacitor, or Supabase (ESLint-enforced).
- No `Math.random()` / `Date.now()` in `src/sim`.
- Magic numbers live in `content/balance/*.json5`, never inlined — already satisfied; this plan only wires an existing config through.
- If a golden hash changes, it is re-baselined in its own commit explaining why — never silently alongside a behavior change. `family`'s `consumptionMultiplier: 1.0` is chosen so the `shopper-trip` golden fixture's hash should **not** move; if it does, that's a real signal to investigate before re-baselining, not something to wave through.
- Conventional commits, one logical unit per commit.
- Run `npm run verify` after the final task to confirm the whole suite (build, lint, content, unit, golden) is green.

---

## File Structure

**Modify:**
- `src/sim/systems/shoppers/types.ts` — `Household` gains `readonly segment: Segment`.
- `src/sim/systems/shoppers/household.ts` — `advancePantryDay` takes a `SegmentConfig` and applies `consumptionMultiplierFor`.
- `src/sim/systems/shoppers/household.test.ts` — every inline household literal gains a `segment`; new test proves two segments diverge.
- `src/sim/core/commands.ts` — `addHousehold` command gains `segment: Segment`; `hashCommand`'s `addHousehold` case hashes it.
- `src/sim/systems/shoppers/system.ts` — `applyCommand`'s `addHousehold` case sets `segment`; `hash()` folds it in; the `advancePantryDay` call site passes `DEFAULT_SEGMENT_CONFIG`.
- `src/sim/systems/shoppers/system.test.ts` — every `addHousehold` push gains `segment: 'family'`.
- `src/bridge/build-bridge.ts` — `addHousehold(householdId, segment)`.
- `src/bridge/build-bridge.test.ts` — both `addHousehold` calls pass `'family'`.
- `src/sim/systems/checkout/understaffing.test.ts` — `addHousehold` push gains `segment: 'family'`.
- `src/sim/systems/economy/loss-leader.test.ts` — `addHousehold` push gains `segment: 'family'`.
- `tests/golden/scenarios.ts` — the `shopper-trip` scenario's `addHousehold` push gains `segment: 'family'`.

No new files — the market system's data model already exists.

---

### Task 1: `Household` type and `advancePantryDay` take a segment

**Files:**
- Modify: `src/sim/systems/shoppers/types.ts:1-9`
- Modify: `src/sim/systems/shoppers/household.ts`
- Modify: `src/sim/systems/shoppers/household.test.ts`

**Interfaces:**
- Consumes: `Segment` (type), `SegmentConfig` (type), `consumptionMultiplierFor(config: SegmentConfig, segment: Segment): number`, `DEFAULT_SEGMENT_CONFIG: SegmentConfig` — all from `../market/index.js`.
- Produces: `Household.segment: Segment` (read by Task 2 and Task 3); `advancePantryDay(household: Household, catalog: readonly GoodDef[], segmentConfig: SegmentConfig): Household` (new third parameter — read by Task 3).

- [ ] **Step 1: Write the failing divergence test**

Add to `src/sim/systems/shoppers/household.test.ts`, alongside the existing `describe('advancePantryDay', ...)` block:

```ts
import { DEFAULT_SEGMENT_CONFIG } from '../market/index.js';

// ... inside describe('advancePantryDay', () => { ... }), add:

it('depletes faster for a segment with a higher consumptionMultiplier', () => {
  const base = { pantry: { milk: 1 }, list: [] };
  const priceHunter = advancePantryDay(
    { ...base, id: 1, segment: 'priceHunter' },
    CATALOG,
    DEFAULT_SEGMENT_CONFIG,
  );
  const convenience = advancePantryDay(
    { ...base, id: 2, segment: 'convenience' },
    CATALOG,
    DEFAULT_SEGMENT_CONFIG,
  );
  // segments.json5: priceHunter consumptionMultiplier 0.9, convenience 1.1 — convenience
  // depletes strictly faster from the same starting stock.
  expect(convenience.pantry.milk).toBeLessThan(priceHunter.pantry.milk);
});
```

Also update every existing household literal in this file to include `segment: 'family'` (they'll fail to typecheck otherwise once `Household.segment` is required):
- Line 28: `advancePantryDay({ id: 1, pantry: { milk: 0.1, bread: 1 }, list: [] }, CATALOG)` → add `segment: 'family'` and a third `DEFAULT_SEGMENT_CONFIG` argument.
- Line 34: same pattern.
- Line 40: same pattern (the `original` object and its `advancePantryDay` call).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/household.test.ts`
Expected: FAIL — `Property 'segment' is missing` (TS) or `advancePantryDay` called with wrong arity, depending on whether TS or the runtime test fails first. Either failure is correct at this point.

- [ ] **Step 3: Add `segment` to `Household`**

In `src/sim/systems/shoppers/types.ts`, add an import and field:

```ts
import type { Vec2 } from '../pathing/types.js';
import type { Segment } from '../market/types.js';

export interface Household {
  readonly id: number;
  readonly segment: Segment;
  /** Stock level (0-1) per good id. A good absent from the map is treated as fully stocked (1). */
  readonly pantry: Readonly<Record<string, number>>;
  /** Good ids below their reorderThreshold, in catalog order — deterministic, no ties to break. */
  readonly list: readonly string[];
}
```

- [ ] **Step 4: Update `advancePantryDay` to apply the multiplier**

In `src/sim/systems/shoppers/household.ts`:

```ts
import type { GoodDef } from '../goods/types.js';
import { consumptionMultiplierFor, type SegmentConfig } from '../market/index.js';
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

/** Depletes every good in `household.pantry` by one day (scaled by segment), then recomputes the shopping list. */
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

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/household.test.ts`
Expected: PASS, all tests including the new divergence test.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `household.ts`/`household.test.ts`/`types.ts` (other files in the repo will still error until later tasks land — that's expected mid-plan; ignore errors outside the files this task touched).

- [ ] **Step 7: Commit**

```bash
git add src/sim/systems/shoppers/types.ts src/sim/systems/shoppers/household.ts src/sim/systems/shoppers/household.test.ts
git commit -m "feat(sim): Household carries a segment; advancePantryDay applies its consumptionMultiplier"
```

---

### Task 2: `addHousehold` command carries a segment

**Files:**
- Modify: `src/sim/core/commands.ts:46` (command union) and `:150` (hashCommand)
- Modify: `src/sim/core/commands.test.ts` (if it has an `addHousehold` case — check before editing)

**Interfaces:**
- Consumes: `Segment` type from `../systems/market/types.js`.
- Produces: `Command` union's `addHousehold` variant now has a required `segment: Segment` field (read by Task 3 and Task 4).

- [ ] **Step 1: Check whether `commands.test.ts` exercises `addHousehold` directly**

Run: `grep -n "addHousehold" src/sim/core/commands.test.ts`

If it appears, note the line(s) — you'll need to add `segment: 'family'` to that literal in Step 4. If it doesn't appear, skip that part of Step 4.

- [ ] **Step 2: Add the `segment` field to the command union**

In `src/sim/core/commands.ts`, add an import at the top:

```ts
import type { Segment } from '../systems/market/types.js';
```

Change line 46 from:

```ts
  | { readonly type: 'addHousehold'; readonly householdId: number }
```

to:

```ts
  | { readonly type: 'addHousehold'; readonly householdId: number; readonly segment: Segment }
```

- [ ] **Step 3: Hash the new field**

In `hashCommand`'s `addHousehold` case (currently `hasher.u32(command.householdId); return;`), change to:

```ts
    case 'addHousehold':
      hasher.u32(command.householdId).str(command.segment);
      return;
```

- [ ] **Step 4: Fix any direct references in `commands.test.ts`**

If Step 1 found a reference, add `segment: 'family'` to that command literal.

- [ ] **Step 5: Typecheck to confirm every call site is now flagged**

Run: `npx tsc --noEmit 2>&1 | grep -c "addHousehold\|householdId"`
Expected: several errors — one per remaining call site that doesn't yet pass `segment` (`system.ts`, `system.test.ts`, `build-bridge.ts`, `build-bridge.test.ts`, `understaffing.test.ts`, `loss-leader.test.ts`, `tests/golden/scenarios.ts`). This is expected; Tasks 3–5 fix them.

- [ ] **Step 6: Commit**

```bash
git add src/sim/core/commands.ts
git commit -m "feat(sim): addHousehold command requires a segment, hashed into the world"
```

(Leave `commands.test.ts` out of this commit unless Step 4 changed it — if it did, include it too.)

---

### Task 3: `ShoppersSystem` sets and hashes `segment`

**Files:**
- Modify: `src/sim/systems/shoppers/system.ts`
- Modify: `src/sim/systems/shoppers/system.test.ts`

**Interfaces:**
- Consumes: `Household.segment` (Task 1), `Command`'s `addHousehold.segment` (Task 2), `DEFAULT_SEGMENT_CONFIG` from `../market/index.js`.
- Produces: nothing new for other tasks — this is the last system-level piece before call sites.

- [ ] **Step 1: Write the failing test**

Add to `src/sim/systems/shoppers/system.test.ts`, inside `describe('ShoppersSystem — commands and wiring', ...)`:

```ts
it('addHousehold stores the segment and applies its consumptionMultiplier on depletion', () => {
  const { world, shoppers } = worldWithShoppers();
  world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'convenience' });
  world.step();
  expect(shoppers.household(1).segment).toBe('convenience');
});
```

Also update every existing `addHousehold` push in this file (lines 56, 82, 94, 112, 152) to add `segment: 'family'`, e.g. `{ type: 'addHousehold', householdId: 1, segment: 'family' }`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: FAIL — TS error (missing `segment` on the command literal) surfaces as a test-run failure, or `household.segment` is `undefined`.

- [ ] **Step 3: Import `DEFAULT_SEGMENT_CONFIG` and set `segment` in `applyCommand`**

In `src/sim/systems/shoppers/system.ts`, add to the import block:

```ts
import { DEFAULT_SEGMENT_CONFIG } from '../market/index.js';
```

Change the `addHousehold` case in `applyCommand` from:

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

- [ ] **Step 4: Pass `DEFAULT_SEGMENT_CONFIG` at the `advancePantryDay` call site**

Find the day-advance loop (currently `this.#households.set(id, advancePantryDay(household, this.#catalog));`, around line 86) and change it to:

```ts
        this.#households.set(id, advancePantryDay(household, this.#catalog, DEFAULT_SEGMENT_CONFIG));
```

- [ ] **Step 5: Fold `segment` into `hash()`**

In `hash()`, the household loop currently reads:

```ts
    for (const id of householdIds) {
      const household = this.#households.get(id)!;
      hasher.u32(id);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
      hasher.u32(household.list.length);
      for (const goodId of household.list) hasher.str(goodId);
    }
```

Change to fold `segment` in right after `id`:

```ts
    for (const id of householdIds) {
      const household = this.#households.get(id)!;
      hasher.u32(id).str(household.segment);
      for (const good of this.#catalog) hasher.f64(household.pantry[good.id] ?? 1);
      hasher.u32(household.list.length);
      for (const goodId of household.list) hasher.str(goodId);
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/sim/systems/shoppers/system.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/sim/systems/shoppers/system.ts src/sim/systems/shoppers/system.test.ts
git commit -m "feat(sim): ShoppersSystem sets household segment from the command and hashes it"
```

---

### Task 4: bridge and remaining call sites pass a segment

**Files:**
- Modify: `src/bridge/build-bridge.ts`
- Modify: `src/bridge/build-bridge.test.ts:83,95`
- Modify: `src/sim/systems/checkout/understaffing.test.ts:57`
- Modify: `src/sim/systems/economy/loss-leader.test.ts:64`

**Interfaces:**
- Consumes: `Segment` type from `../sim/systems/market/types.js` (for `build-bridge.ts`'s new parameter).
- Produces: nothing new — this is the last call-site cleanup before the golden scenario (Task 5).

- [ ] **Step 1: Update `BuildModeBridge#addHousehold`'s signature**

In `src/bridge/build-bridge.ts`, add an import:

```ts
import type { Segment } from '../sim/systems/market/types.js';
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

- [ ] **Step 2: Update both call sites in `build-bridge.test.ts`**

Change both `bridge.addHousehold(1);` (lines 83 and 95) to `bridge.addHousehold(1, 'family');`.

- [ ] **Step 3: Update `understaffing.test.ts` and `loss-leader.test.ts`**

In `src/sim/systems/checkout/understaffing.test.ts:57`, change:

```ts
    world.commands.push({ type: 'addHousehold', householdId: i + 1 });
```

to:

```ts
    world.commands.push({ type: 'addHousehold', householdId: i + 1, segment: 'family' });
```

Apply the identical change in `src/sim/systems/economy/loss-leader.test.ts:64`.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: only remaining errors, if any, are in `tests/golden/scenarios.ts` (fixed in Task 5). Everything else should be clean.

- [ ] **Step 5: Run the affected test files**

Run: `npx vitest run src/bridge/build-bridge.test.ts src/sim/systems/checkout/understaffing.test.ts src/sim/systems/economy/loss-leader.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/bridge/build-bridge.ts src/bridge/build-bridge.test.ts src/sim/systems/checkout/understaffing.test.ts src/sim/systems/economy/loss-leader.test.ts
git commit -m "feat(bridge): addHousehold requires a segment; update non-golden call sites"
```

---

### Task 5: golden `shopper-trip` scenario, full verify, and re-baseline if needed

**Files:**
- Modify: `tests/golden/scenarios.ts:172`
- Possibly modify: `tests/golden/hashes.json` (only if the hash actually changes — see below)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — this is the closing task.

- [ ] **Step 1: Update the `shopper-trip` scenario's `addHousehold` push**

In `tests/golden/scenarios.ts:172`, change:

```ts
      world.commands.push({ type: 'addHousehold', householdId: 1 });
```

to:

```ts
      world.commands.push({ type: 'addHousehold', householdId: 1, segment: 'family' });
```

- [ ] **Step 2: Run the golden test and observe the outcome**

Run: `npx vitest run tests/golden/golden.test.ts`

Two possible outcomes:
- **PASS** — `family`'s `consumptionMultiplier: 1.0` and the new `hasher.str(household.segment)` call didn't change the recorded hash because... actually, note: `hasher.str(household.segment)` **does** add new bytes to the hash stream unconditionally, regardless of the multiplier being neutral. So this **will** fail with a hash mismatch — that's expected, not a bug. Proceed to Step 3.
- **FAIL** with `${scenario.name}: simulation behaviour changed` — expected, see above.

- [ ] **Step 3: Re-baseline only if the diff is exactly the expected `shopper-trip` change**

Run: `npx vitest run tests/golden/golden.test.ts 2>&1 | grep -A5 "shopper-trip"`

Confirm the failure is isolated to `shopper-trip` (the only scenario whose `addHousehold` push changed) and no other scenario's hash moved. If any other scenario's hash changed, STOP — that indicates an unintended behavior change elsewhere and must be investigated before re-baselining, per `CLAUDE.md`'s golden-hash rule.

- [ ] **Step 4: Run the golden test again to confirm it's green**

Run: `UPDATE_GOLDEN=1 npx vitest run tests/golden/golden.test.ts`
Then: `npx vitest run tests/golden/golden.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the re-baseline separately, explaining why**

```bash
git add tests/golden/hashes.json
git commit -m "test(golden): re-baseline shopper-trip — segment now folds into the world hash

hashCommand and ShoppersSystem#hash both now fold in household.segment
(phase 2.0a wiring). family's consumptionMultiplier is 1.0 so the
depletion *behavior* is unchanged, but the new hasher.str(segment) call
itself shifts every downstream hash. No other scenario's hash moved."
```

- [ ] **Step 6: Update the market-segments plan's checkboxes**

Open `docs/superpowers/plans/2026-08-01-market-segments.md` and check off (`- [x]`) every step that this plan just completed (Task 1 of that plan was already done in commit `955bd9f`; the remaining steps correspond to Tasks 2–5 here). This keeps that plan's tracking honest for anyone reading it later.

- [ ] **Step 7: Run the full verify suite**

Run: `npm run verify`
Expected: PASS — typecheck, lint, `check:content` (including `check:tokens` and the gentle-surface tell validator), unit tests, golden tests, and the production build all green.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/plans/2026-08-01-market-segments.md
git commit -m "docs: close out phase 2.0a — segment wiring complete"
```

---

## Gate

Content validation still passes (`segments.json5` was already valid — this plan didn't touch it). Two households with different segments and identical starting pantries deplete at measurably, deterministically different rates (proved in `household.test.ts` and `system.test.ts`). Every existing test call site compiles and passes with an explicit `segment`. `npm run verify` is green end to end. The golden `shopper-trip` re-baseline is isolated in its own commit with a stated reason, per `CLAUDE.md`.
