# Phase 1.9 — Economy & pricing: design notes

Condensed, same pattern as 1.6/1.7/1.8's notes. **Last M1 phase** — after this, the PR opens.

**Gate (PLAN.md §16):** every finance number drills to its constituent events; loss-leader strategy
is viable in the harness.
**Deliverable:** per-SKU pricing with elasticity, promotions, loss leaders, full P&L with drilldown.

## Scope cuts

- **Elasticity affects impulse demand only**, not required list items — a shopper always seeks out
  what's on their list regardless of price (that simplification has held since 1.6); a full
  price-driven substitution/store-choice model is §5.1's multinomial logit, which is M2/multi-store
  territory.
- **`priceSurprise` is a number, not a behavioral branch.** The gentle-surface tell table describes a
  shopper who "puts it back" on a bad surprise — that's an animation/view concern; the sim computes
  the term and feeds satisfaction, it doesn't add a decline-to-buy branch this phase.
- **Marketing spend is a P&L cost line only**, no demand-generating effect modeled — nothing consumes
  foot traffic yet (no rival/multi-store system exists), so a marketing budget's only effect this
  phase is showing up as an expense.
- **Shrink stays 0 in the P&L.** Only spoilage-driven write-offs exist (`InventorySystem`, 1.7);
  theft-based shrink needs `staffCoverage`-driven mechanics not built this phase (noted in 1.8 too).
- **No UI drilldown.** "Drills to constituent events" is proven at the data level: `EconomySystem`
  keeps a full ledger of tagged entries, not just daily aggregates, so a query can reconstruct exactly
  which events produced any statement line. Building the actual drilldown UI is 2.x's job.
- **Ledger grows unboundedly.** Fine for a single playthrough at M1's scale; pruning/summarization for
  a long-running save is a known, documented future concern, not solved here.

## Content

- `content/goods/catalog.json` gains a `cost` field per good (COGS) — `GoodDef`/Zod schema updated,
  and every existing `GoodDef` literal (catalog.test.ts, household.test.ts, shoppers/system.test.ts)
  gets one.
- `content/balance/economy.json5`: `rentPerDay`, `utilitiesPerDay`, `elasticityCoefficient` (impulse
  probability scales by `(referencePrice/currentPrice)^elasticityCoefficient`), `priceSurpriseWeight`
  (§5.3's w2), `lossLeaderMarginThreshold` (a good priced at or below cost × this fraction counts as
  a loss leader for harness classification).

## Sim

- `src/sim/systems/economy/`: `types.ts` (`PriceOverride`, `Promotion`, `LedgerEntry`,
  `DailyStatement`), `config.ts`, `system.ts` (`EconomySystem`).
- Commands: `setPrice(goodId, price)`, `startPromotion(goodId, discountFraction, durationTicks)`,
  `setMarketingSpend(dailyAmount)`.
- `priceOf(goodId)`: override price (if set) else catalog price, then an active promotion's discount
  on top. `recordSale(revenue, cogs)` — called directly by `ShoppersSystem` at the moment of sale
  (same direct-sibling-call pattern every system has used since 1.5), appends ledger entries.
- Daily `update()`: pulls labor cost from a new `CheckoutSystem#dailyWageCost()`, spoilage value from
  a new `InventorySystem#drainSpoilageValue()`, applies rent/utilities/marketing from config/command,
  computes `EBITDA`, appends a `DailyStatement` plus the ledger entries that produced it.
- `ShoppersSystem` gains an `EconomySystem` reference: `#stepShopping` reads `economy.priceOf(goodId)`
  instead of the catalog's static `unitPrice` (this is what makes pricing real), computes
  `priceSurprise` per item against the catalog's reference price, and scales the impulse roll's
  probability by the elasticity formula. `#stepCheckingOut`'s `sold` branch calls
  `economy.recordSale(cartTotal, cogsOfCart)`.
- Gate proof: a loss-leader test proves that pricing one good below cost, while everything else stays
  at normal margin, increases net EBITDA over the same trip volume (via the elasticity-driven impulse
  lift on adjacent goods) versus not discounting it — "viable" demonstrated directly, not asserted.
  A drilldown test proves a `DailyStatement`'s revenue line sums exactly to its ledger's sale entries.

## Explicitly out of scope, deferred to later phases (mostly M2)

Price-driven store choice/segments (§5.1), marketing's demand effect, theft-based shrink, a UI
drilldown surface, ledger pruning for long-running saves.
