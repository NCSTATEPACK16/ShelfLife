# Phase 1.7 — Inventory & suppliers: design notes

Condensed, same pattern as the 1.6 notes — decisions recorded here, executed directly with TDD.

**Gate (PLAN.md §16):** an unattended store runs out of milk on the correct day; harness confirms
spoilage economics within 2%.
**Deliverable:** SKUs, facings, `(s,S)` ordering, lead times, deliveries, spoilage, markdowns, shrink.

## Scope cuts

- **Inventory is tracked per good, not per physical shelf instance.** The store's total stock of
  "milk" is one ledger regardless of which fixture displays it. Splitting stock per shelf instance is
  real future work (multi-shelf-per-good routing) but not required by the gate, and it's a clean,
  documented simplification rather than a silent one.
- **No "facings" as a distinct visual/geometry concept.** §5.4's `visibility(shelfHeight, facings)`
  impulse term already exists as a content-schema tell (`gentle-surface.json5`'s `visibility` entry,
  authored in 1.6) with no mechanic behind it yet — that's an art/UI-geometry feature, not inventory
  math, and stays deferred.
- **Shrink is spoilage-only.** §5.5's theft-based shrink (`∝ (1 − staffCoverage) × storeSize ×
  segmentMix`) needs `staffCoverage`, which doesn't exist until 1.8. Only spoilage-driven shrink is
  implemented this phase.
- **Supplier reliability is a simple full/half roll**, not a continuous distribution: a reliable
  delivery (probability = `supplierReliability`) arrives in full; an unreliable one arrives at half
  the ordered quantity. Enough to make reliability a real, testable lever without inventing a richer
  distribution the spec doesn't ask for.
- **No markdown UI/pricing panel.** A markdown-eligible sale applies a fixed discount at the point of
  sale (a real economic effect, computed and testable) — full dynamic pricing/promotions is 1.9.

## Content

- `content/inventory/policy.json` (Zod-validated, cross-references `content/goods/catalog.json`'s ids
  — an unknown `goodId` fails validation): `goodId`, `reorderPoint` (s), `orderUpToLevel` (S),
  `leadTimeTicks`, `supplierReliability` (0-1), `spoilageTauDays` (§5.5's `τ_sku`, in days for
  authoring readability — converted to ticks internally).
- `content/balance/inventory.json5`: `dockCapacity` (max concurrent in-transit orders, store-wide),
  `markdownThreshold` (0.35 per §5.5), `shrinkThreshold` (0.15 per §5.5), `markdownDiscount` (fraction
  off at the point of sale for a markdown-eligible unit).

## Sim

- `src/sim/systems/inventory/`: `types.ts` (`SupplyPolicy`, `Batch`, `PendingOrder`, `StockedGood`),
  `catalog.ts` (policy loader), `config.ts` (balance loader), `freshness.ts` (pure:
  `freshnessAt(deliveredAtTick, now, tauTicks) = exp(-(now-deliveredAtTick)/tauTicks)` — §5.5's exact
  closed-form formula, so there's no discretization error for a "harness" to catch within tolerance;
  a test asserts the implementation matches the formula directly), `system.ts` (`InventorySystem`).
- `InventorySystem` seeds every policy's good at `orderUpToLevel` units at construction (tick 0) and
  is otherwise fully autonomous — no commands. Each tick: (1) land any pending order whose
  `arrivesAtTick <= world.tick` as a new FIFO batch; (2) for every good at or below its
  `reorderPoint` with no order already in transit and store-wide in-transit count under
  `dockCapacity`, place one — roll `world.rng.get('spoilage')` (reserved since phase 1.3, unused
  until now) against `supplierReliability` for full vs. half delivery.
- Public API for `ShoppersSystem` to call directly (same direct-sibling-call pattern
  `ShoppersSystem` already uses for `PathingSystem`): `stockOf(goodId)`, `consume(goodId, tick)` —
  returns `'sold' | 'markdown' | 'spoiled' | 'outOfStock'`, mutating the FIFO batch it drew from.
  `'spoiled'` finally gives real behavior to the `spoiledEncounters` satisfaction term (stubbed at 0
  since 1.6) and counts as a fillRate miss (§5.3's single most important tell) rather than a sale.
  `'markdown'` sells at a discount, still fulfilling the list item.
- `ShoppersSystem#stepShopping` calls `inventory.consume(goodId, world.tick)` at the same point it
  used to unconditionally add the good to the cart; branches on the result. Sale total accounts for
  markdown discounts.
- Golden-test-locked: a scenario with no supplier deliveries (`dockCapacity: 0`, forcing "runs out")
  proving stock hits exactly zero at the tick the `(s,S)` math predicts.

## Explicitly out of scope, deferred to later phases

Per-shelf inventory splitting, facings/visibility geometry, theft-based shrink (1.8), dynamic
pricing/promotions UI (1.9), a dedicated balance-harness CLI (the spoilage-formula test substitutes
for it, since freshness is closed-form).
