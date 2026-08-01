# The Gentle Surface

*How a player learns a multinomial logit model without ever seeing one.*

Companion to `PLAN.md` §12. This document is the **contract between the simulation and the player's
eyes**: every quantity the sim computes that affects an outcome must be expressible as something the
player can see happen.

---

## 0. The rule this document enforces

> Every term in the satisfaction formula (§5.3) and the impulse formula (§5.4) has a declared visual
> tell. A term without a tell fails content validation in CI.

This is enforced, not aspirational. The content schema for a satisfaction/impulse term requires a
`tell` object:

```ts
const TellSchema = z.object({
  bubble:    BubbleIdEnum.nullable(),   // the icon shown above the shopper
  animation: AnimIdEnum.nullable(),     // what their body does
  particle:  ParticleIdEnum.nullable(), // world FX at the location
  worldMark: z.boolean(),               // does the *shelf/register* also change appearance?
  threshold: z.number(),                // magnitude below which we stay silent
});
```

`threshold` matters as much as the tell itself — see §3.

---

## 1. Satisfaction terms (§5.3)

| Term | Bubble | Shopper animation | World mark | Notes |
|---|---|---|---|---|
| `fillRate` miss | List icon with a red strike | Stops at the empty facing, looks down at list, shrugs, moves on | The facing shows a visible gap | The single most important tell in the game — it's how you learn to reorder |
| `priceSurprise` (negative) | Price tag with raised eyebrow | Picks item up, turns it over, **puts it back** | Item briefly highlights | The put-back is the beat that sells it |
| `priceSurprise` (positive) | Price tag with a small star | Grabs a second one | — | Rewards loss-leader play visibly |
| `queuePenalty` (rising) | Clock | Foot tap, then arms crossed, then head shake | Lane length is itself the primary signal | Escalates in three stages, so the player has time to react |
| `queuePenalty` (balk) | Clock with a red X | **Abandons the cart in the aisle and walks out** | Abandoned cart persists as a world object until staff clears it | The abandoned cart is a debt: lost revenue *and* restock labor. Make it ugly on purpose |
| `spoiledEncounters` | Green stink cloud | Recoils, steps back, puts item back | Shelf item has brown tint + fly particles | The fly particle is visible from zoomed-out; the bubble is not. Both matter |
| `cleanliness` (low) | Frown | Steps around the spill, wrinkles nose | Spill decal + a slight sheen | — |
| `staffInteraction` (good) | Heart | Staff points, shopper nods and turns toward the aisle | — | Only fires above a morale threshold — this is how the player *sees* morale |
| `staffInteraction` (absent) | Question mark | Stands still, looks left and right, wanders | — | "Nobody helped me" reads as confusion, not anger |
| `discovery` | Sparkle | Detours off the flow-field path toward a shelf | Shelf gets a brief highlight | Drives Foodie segment; also the most delightful animation in the game |

## 2. Impulse terms (§5.4)

| Term | Tell |
|---|---|
| Impulse purchase fires | Small "!" bubble, item hops into the cart with a short arc |
| `visibility` (high shelf, many facings) | No bubble — instead, **the shelf is visibly well-faced**. This is a world tell, not a shopper tell |
| `adjacencyBonus` | When two adjacent categories combo, the "!" is gold instead of white. Rare enough to feel like a discovery |
| `promoLift` | Promo shelf has a physical sign; shoppers visibly slow as they pass it |
| `needState` (kids in trip) | The child agent points at a shelf; the parent's impulse roll happens *for the child's target* | 

**Design note on path exposure:** the player should never be told "path exposure increased 12%." They
should notice that moving the milk made the store *look* busier in the middle aisles. The congestion
heatmap debug overlay ships as a *player-facing* layout tool for exactly this reason.

---

## 3. Silence is a feature

If every term fired a bubble every time, the store would be visual noise and nothing would read. Three
rules keep the surface gentle:

1. **Thresholds.** A term fires a tell only when its magnitude exceeds `tell.threshold`. Mild
   dissatisfaction is silent; the shopper just doesn't come back as often. The player feels that in
   trip frequency, not in bubbles.
2. **One bubble per shopper at a time.** The highest-magnitude term wins. A shopper who waited too long
   *and* saw a spoiled item shows the queue bubble — the bigger problem.
3. **Rate limiting per screen.** Cap simultaneous bubbles (roughly 8 at `regular`, 4 at `compact`).
   Beyond that, the world marks carry the signal. On a phone this cap is what keeps the screen legible.

**Corollary:** a store where nothing is wrong should be visually *calm*. Calm is the reward.

---

## 4. Advisors — the one-click bridge

Bubbles tell you *something* is wrong. Advisors tell you *what to do about it* and give you one click
to the numbers.

Format is fixed: **one observation sentence, one diagnosis clause, one or two actions.**

> **Diane (Accountant)** — *Dairy is bleeding.* You're marking down 40% of the milk before it sells.
> `[Show me]` `[Order less milk]`

> **Marcus (Store Manager)** — *Register 2 is drowning.* Fourteen people balked yesterday afternoon.
> `[Show me]` `[Schedule a second cashier, 2–6pm]`

> **Priya (Rival Scout)** — *Aldente Markt just cut pasta 15%.* Your PriceHunter share is sliding.
> `[Show me]` `[Compare prices]`

Rules:
- `[Show me]` always opens the **specific** drilldown, pre-filtered to the cause — never a general
  dashboard. Landing the player on a generic finance screen is a failure.
- The suggested action is a real, executable command, not advice. One tap does it.
- Advisors never fire more than one card at a time, and never during the first 30 seconds of a chapter.
- Advisors are **wrong sometimes** — deliberately. Priya over-reacts to price moves. This keeps them
  advisors rather than an autopilot, and it's funnier.

---

## 5. Comparative framing

Every KPI renders against a reference. A bare number is a bug.

| Bad | Good |
|---|---|
| `Dairy margin: 22%` | `Dairy margin: 22% · Aldente Markt 31%` with a gap bar |
| `Basket size: $34.10` | `Basket size: $34.10 · ▲ $2.60 vs. your 7-day` |
| `Service score: 61` | `Service score: 61 · Hy-Glee never drops below 80` |
| `Shrink: $412` | `Shrink: $412 · 2.1% of revenue · industry-typical is 1.4%` |

Reference priority: **rival benchmark** > **your 7-day trailing** > **level target**. Use the first one
available. This is why the design system's stat tile has a benchmark slot built in — retrofitting it
into 30 tiles later is miserable.

---

## 6. Progressive disclosure

The player sees one new system per boss (`PLAN.md` §3), introduced as a ~20-second interactive moment,
never a text wall.

| Level | Panels visible | New mechanic moment |
|---|---|---|
| 1 | Pricing only | "Set the price of milk. Watch what happens." — one slider, one shopper, immediate feedback |
| 2 | + Hours/scheduling | A single overnight shift, one shopper who arrives at 11pm |
| 3 | + Assortment | Two pack sizes side by side; a Bulk shopper and a Convenience shopper choose differently, on screen |
| … | … | … |

Rule: a panel does not appear in the UI until its level unlocks it. Not greyed out — **absent**. Greyed
out is clutter that teaches nothing.

---

## 7. What we deliberately do *not* show

Restraint is part of the design. These stay hidden unless the player digs:

- The utility equation itself, and any β coefficient.
- Per-household loyalty values. (Aggregate loyalty by segment is shown; individuals are not.)
- Raw probabilities. "62% of Foodies chose you" is fine; `P(h→s) = 0.62` is not.
- The rival personality vector. Rival *behavior* is observable; the numbers are not.
- Anything requiring a hover on a touch device.

If a player wants the raw model, `docs/design/` is public and the debug overlay exists. The game itself
stays gentle.
