# Gentle Surface (Phase 2.2) — Design

Companion to `PLAN.md` §12.1 and `docs/design/gentle-surface.md`. Phase 2.2's deliverable: every
declared tell in `content/design/gentle-surface.json5` actually fires and renders, for all 15 terms
(10 satisfaction + 5 impulse) — not just the ones that already had a live sim signal.

## 0. Why this is bigger than "wire the view"

`tools/check-gentle-surface.mjs` already passes — every term has a declared tell in the content
schema. But investigating the sim found two real gaps beneath that green checkmark:

1. **No per-event granularity.** `SimEvent` only carries end-of-trip aggregates
   (`shopperTripCompleted`, `cartAbandoned`). Nothing fires the moment a term's underlying thing
   actually happens.
2. **7 of the 15 terms have no live sim signal at all**: `cleanlinessLow`, `staffInteractionGood`,
   `staffInteractionAbsent`, `visibility`, `adjacencyBonus`, `promoLift`, `needState`. Satisfaction's
   `w5` (staffInteraction) and `w6` (cleanliness) terms are literally absent from the sum in
   `ShoppersSystem#stepLeaving` today; `#rollImpulse` only computes `impulseBase × elasticityMultiplier`
   — no adjacency, promo, or need-state multiplier exists.

Decision (confirmed with the user): build all 15, reusing existing infrastructure wherever it
already exists rather than inventing new systems. See §2.

## 1. Event schema

One new `SimEvent` variant, not fifteen:

```ts
| {
    readonly type: 'tellFired';
    readonly shopperId: number;
    readonly term: TellTerm;                        // the 15 ids in gentle-surface.json5
    readonly magnitude: number;                      // 0-1, what crossed threshold
    readonly worldRef?: { readonly instanceId: number }; // shelf/register this also marks, if any
  }
```

`TellTerm` is a string union of the 15 term ids already named in `content/design/gentle-surface.json5`
(`fillRateMiss`, `priceSurpriseNegative`, ... `needState`). Each producing system computes its
magnitude where it already has the data and emits `tellFired` only when `magnitude` clears that
term's `threshold`, loaded once from `content/design/gentle-surface.json5` via the same `?raw` +
JSON5 + Zod pattern every other `content/**` file uses (new `src/content/gentle-surface-schema.ts`,
mirroring `src/content/*.ts`'s existing loaders). The view layer never re-derives thresholds — it
looks up bubble/animation/particle/worldMark by `term` from that same loaded table.

This keeps rule 1 of `EventBus` (output-only) intact: computing "did this cross threshold" doesn't
change what the system does next, it only decides whether to emit.

## 2. The 7 missing mechanics

| Term | Mechanism | New work |
|---|---|---|
| `cleanlinessLow` | `CheckoutSystem.cleanliness()` already decays/restores live (`staffing.json5`'s `cleanlinessDecayPerTick`/`cleanlinessRestorePerStaffPerTick`, unused until now). `ShoppersSystem` reads it once per trip (at `#stepLeaving`, same point `queuePenalty` etc. are read) and adds a real `w6` term to the satisfaction sum. Tell fires when `1 - cleanliness` clears `cleanlinessLow`'s threshold (0.4). | `ShoppersSystem` gains a `CheckoutSystem` read it doesn't currently need for this purpose (it already holds a reference); one new satisfaction term + weight in `shoppers.json5`. |
| `staffInteractionGood` / `staffInteractionAbsent` | At the moment `#stepCheckingOut` joins a queue: staffed lane with `staff.morale` ≥ a new `staffInteractionMoraleThreshold` (`staffing.json5`) → `staffInteractionGood`; self-checkout or unassigned lane → `staffInteractionAbsent`. Implements `w5`. | New satisfaction term + weight + threshold constant. `CheckoutSystem` needs a `staffMoraleOnLane(laneId)` accessor (or `ShoppersSystem` already resolves `laneId` → can ask `checkout.staff(id)` — check at implementation time which is cleaner). |
| `visibility` | `InventorySystem.stockOf(goodId)` already exists. World-mark only (no bubble, no satisfaction change per the content schema — `bubble: null, animation: null`). Needs a shelf-instance → goodId accessor; `ShoppersSystem`'s `#stocking` map is private with no accessor today — this is the exact one-line gap `docs/handoff.md` already flagged. Add `ShoppersSystem#stockedGoodAt(instanceId): string \| null`. | Accessor + view (draw-plan reads `inventory.stockOf` per stocked shelf each redraw — no event needed, this is a per-frame world-state read, not a per-trip tell). |
| `promoLift` | `EconomySystem` already tracks `#promotions` privately (`startPromotion` command, `endsAtTick`, `discountFraction`). Add `isPromoted(goodId, tick): boolean`. In `#rollImpulse`, an impulse hit on a promoted good tags its `tellFired` as `promoLift` instead of `impulsePurchase` — mutually exclusive per hit, not additive. | One accessor + one branch in the existing roll loop. |
| `adjacencyBonus` | Add `category` to `content/goods/catalog.json` (`milk`→`dairy`, `eggs`→`dairy`, `bread`→`bakery`, `snacks`→`snacks`) and an authored combo table in `content/balance/market.json5` (e.g. `[['dairy','bakery']]`). In `#rollImpulse`, a hit whose good shares a combo pair with another good stocked within `exposureRadius` tags `adjacencyBonus` instead of `impulsePurchase` — same mutual-exclusion pattern as `promoLift`. | Content schema field + small neighbor check reusing the loop's existing placement/distance math. |
| `needState` | No "kids in trip" schema exists anywhere and PLAN.md doesn't specify one. Reuse the existing `family` segment as the documented proxy (same style of simplification as BulkHaus's store-wide lock-in) — a `family`-segment shopper's impulse hits tag `needState` instead of `impulsePurchase`. | No new schema. One segment check, same mutual-exclusion slot as `promoLift`/`adjacencyBonus`. |
| `queuePenaltyRising` / `queuePenaltyBalk` | Already fully modeled (`checkoutWaitTicks`, `balkToleranceTicks`, `abandonToleranceTicks`) but only computed once, at trip end. Compute the same `(waitTicks/tolerance)^1.6` magnitude live, once per tick, inside `#stepCheckingOut` while a shopper is queued, and emit `tellFired` there when it crosses `queuePenaltyRising`'s threshold (0.3) or `queuePenaltyBalk`'s (0.7, i.e. actually balking/abandoning). | No new mechanic — just moving an existing formula to fire mid-trip instead of only at trip-end. |

`impulsePurchase`, `fillRateMiss`, `priceSurpriseNegative`, `priceSurprisePositive`,
`spoiledEncounters`, `discovery` need no new mechanic — a `tellFired` emit at the point each is
already computed in `#stepShopping`/`#rollImpulse`/`#stepLeaving`.

**Mutual exclusion for impulse hits:** each `#rollImpulse` hit fires exactly one tell —
`adjacencyBonus` > `promoLift` > `needState` > `impulsePurchase`, first match wins (adjacency is the
rarest/most "discovery-like", per gentle-surface.md's "rare enough to feel like a discovery" note on
adjacency). `discovery`'s satisfaction term is unchanged (still "≥1 impulse hit this trip"); it fires
its own tell independently of which impulse-hit tell fired, on the *first* hit of a trip only (§3's
"one bubble per shopper at a time" — discovery already won that arbitration at the satisfaction-term
level before this phase, so its tell keeps the same precedence here).

## 3. Golden hashes will move — expected, not a bug

Adding real `w5`/`w6` satisfaction terms changes `satisfaction`'s computed value, which is hashed
(it feeds `LoyaltySystem`/`MarketSystem` state). Any golden scenario that exercises a staffed
checkout or cleanliness decay will re-baseline. Per `CLAUDE.md`: confirm unrelated scenarios are
byte-identical first, re-baseline in its own commit explaining why. `tellFired` events themselves
are **not** hashed — `EventBus` holds no persisted state, only `computeHash()`'s per-system folds
matter, so adding the event type alone changes nothing.

## 4. View layer

New `src/view/tell-draw-plan.ts`, pure function, same convention as `shopper-draw-plan.ts` /
`pathing-debug-plan.ts`:

```ts
function buildTellDrawPlan(
  tellEvents: readonly TellFiredEvent[],
  tellTable: GentleSurfaceContent,     // loaded content/design/gentle-surface.json5
  shopperPositions: ReadonlyMap<number, { x: number; y: number }>,
  origin: { x: number; y: number },
  maxSimultaneous: number,             // 8 regular / 4 compact, caller decides via src/platform/layout
): readonly TellMarker[]  // { x, y, bubbleId, shopperId }
```

Rules from `docs/design/gentle-surface.md` §3, enforced here since the sim already resolved
per-term thresholds and mutual exclusion for impulse:

- **One bubble per shopper.** If a shopper has multiple `tellFired` events in the same tick batch
  (e.g. a satisfaction-term tell and an impulse tell), the highest-`magnitude` one wins.
- **Rate limit.** After per-shopper collapse, keep at most `maxSimultaneous` markers, highest
  magnitude first. The rest are silent this tick — world marks still carry the signal per §3's
  corollary.
- Bubbles are placeholder-art: a small colored token shape (reusing `tokens.json`'s palette, same
  as `fixture-colors.ts`/`shopper-draw-plan.ts`'s existing convention) with a 1-2 letter/glyph label
  per bubble id, not real iconography — Track A stays placeholder-rectangle by design.
- **Animation** in placeholder art = a brief state/pose swap on the shopper marker (e.g. a color
  pulse or shape change for `recoilPutBack` vs. steady circle), not a sprite frame — there is no
  sprite. Kept minimal: a `pose` field on `ShopperMarker` the scene can react to for one render tick.
- **World marks** render at the fixture/lane instance named in `worldRef`: shelf tint (spoiled item,
  well-faced/empty), a persistent "abandoned cart" marker at the last position (cleared by a
  future staff-clears-it mechanic — out of scope, matches `docs/handoff.md`'s "restock cost for
  abandoned carts" deferral; for 2.2 the marker simply persists on the grid draw plan until the
  scenario/session ends), a spill decal for low cleanliness, a promo sign on a promoted shelf.
- `BuildScene.redraw()` gains one more pass calling `buildTellDrawPlan`, drawing bubbles/pose swaps
  above shopper markers, plus the world-mark overlays. Bridge (`BuildModeBridge`) exposes a
  `pendingTells()` accessor that drains `world.events` for `tellFired` since the last read, same
  pattern any future accessor for `world.events` would need — no bridge method reads events today,
  this is the first consumer.

## 5. Out of scope, explicitly

- Real Preact advisor cards, KPI comparative framing, chapter cards — phase 2.3.
- Restock cost / staff clearing abandoned carts — pre-existing deferral, unchanged.
- Any Track B / 16-bit art concern — Track A stays placeholder rectangles throughout.
- A general "kids in household" schema dimension — `needState` uses the `family`-segment proxy
  described above, not a new field.

## 6. Testing

Same TDD/one-commit-per-task discipline as every prior phase's plan. Per new mechanic: a
characteristic-tell unit test (mirrors the rivals signatures' "focused characteristic-tell test"
pattern) proving the term fires above threshold and stays silent below it. `tell-draw-plan.test.ts`
covers rate-limiting and one-bubble-per-shopper collapse as pure-function tests, no Phaser needed
(matching `pathing-debug-plan.test.ts`'s existing pattern). A gate-proof integration test drives a
store through a scenario exercising all 15 terms at least once (short, hand-built scenario, not a
new golden hash scenario — golden scenarios are for hash-sequence regression, this is for "did the
tell actually fire," a different concern) and asserts each term's `tellFired` appears at least once
in `world.events` history collected across ticks.
