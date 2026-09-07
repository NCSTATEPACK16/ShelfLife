# Gentle Surface Rendering — Design Spec

**Date:** 2026-08-31
**Phase:** Track B (surface) · S3
**Status:** approved, pre-implementation

---

## 1. Context & goal

`content/design/gentle-surface.json5` has declared a tell (bubble/animation/particle/worldMark/
threshold) for every §5.3/§5.4 term since phase 1.1, CI-validated by `check:gentle-surface.mjs` —
and nothing in `src/view` has ever drawn one (`docs/handoff.md`, "Now"). `content/asset-manifest.json`
already declares all 12 bubble icons, `bubble_frame`, `particle_flies`, `cart_abandoned`, and
`spill_decal` as S2's placeholder-first leftovers. This phase renders them for real and wires the
triggers that decide when each one fires.

**Goal:** a shopper who hits a fillRate miss, a price surprise, a spoiled item, a rising queue, a
cart abandonment, or an impulse buy visibly reacts — bubble, brief pose, world mark where declared —
within one tick of the sim computing it, with zero change to `src/sim` and zero change to any golden
hash (ADR 0007).

### 1.1 Term coverage

Not all 15 terms have a live sim signal. Two judgment calls, made during design review, are recorded
here rather than left implicit:

- **`queuePenaltyBalk` maps to the sim's `abandoned` flag, not `balked`.** The tell's own
  description — "abandons the cart in the aisle and walks out; cart persists as a world object" —
  matches `abandoned` (which emits `cartAbandoned` with the lost cart's items) and not `balked`
  (which fires when no checkout lane is open at all — no cart was ever assembled). `balked` gets no
  dedicated tell.
- **`discovery` is folded into the deferred bucket, not given its own trigger.** Both `discovery`
  (§5.3, satisfaction) and `impulsePurchase` (§5.4, impulse) trace to the same `impulseHits`
  increment in `ShoppersSystem#rollImpulse` — the sim has no signal that distinguishes an "ordinary"
  impulse buy from a "delightful discovery" one. Firing both bubbles for one event would violate
  §3's "one bubble per shopper, highest-magnitude term wins" rule and overstate what the sim actually
  knows. `impulsePurchase` — the literal, unambiguous moment — fires; `discovery`'s distinct
  sparkle/detour tell waits for a real signal.

| # | Term | Status |
|---|---|---|
| 1 | `fillRateMiss` | **Live this phase** |
| 2 | `priceSurpriseNegative` | **Live this phase** |
| 3 | `priceSurprisePositive` | **Live this phase** |
| 4 | `queuePenaltyRising` | **Live this phase** |
| 5 | `queuePenaltyBalk` | **Live this phase** (→ `abandoned`) |
| 6 | `spoiledEncounters` | **Live this phase** |
| 7 | `impulsePurchase` | **Live this phase** |
| 8 | `visibility` | Already satisfied — emergent from S2's shelf full/half/empty art. Nothing to build. |
| 9 | `discovery` | Deferred — see above |
| 10 | `staffInteractionGood` | Deferred — no sim mechanic (`ShoppersSystem` comment: "not consumed yet") |
| 11 | `staffInteractionAbsent` | Deferred — same |
| 12 | `cleanlinessLow` | Deferred — same |
| 13 | `adjacencyBonus` | Deferred — `#rollImpulse` has no adjacency term |
| 14 | `promoLift` | Deferred — `#rollImpulse` has no promo term |
| 15 | `needState` | Deferred — `#rollImpulse` has no child/needState term |

Terms 9–15's bubble/animation art is authored and manifest-declared where not already present (art
is cheap; see §3), but wired to nothing. This is the same placeholder-first-for-triggers pattern S2
used for stock levels: the renderer is ready the day a Track A change adds the mechanic, and that gap
is called out explicitly in the phase's `docs/handoff.md`/`CHANGELOG.md` entry, not silently dropped.

### 1.2 Animation fidelity

Bubbles (already unique per term, already declared) carry the primary signal, matching
`gentle-surface.md` §12.1's own framing ("thought bubbles are the primary telemetry"). Animations
reuse a small shared pool of reaction poses rather than one bespoke pose per term:

| Shared pose | Used for |
|---|---|
| `pause` | `fillRateMiss` (shrug), `queuePenaltyRising` (foot-tap/arms-crossed) |
| `recoil` | `spoiledEncounters`, `priceSurpriseNegative` (put-back) |
| `hop` | `priceSurprisePositive` (grab second), `impulsePurchase` (item hops into cart) |
| — (existing walk cycle) | `queuePenaltyBalk` — the shopper's existing walk-to-exit *is* "walks out"; the new part is the cart marker (§4.3), not a new pose |

Each pose is a new `shopper` asset state (extending `['idle','walk']`), carried through the existing
facing × segment-palette multiplier — the same economics as S2's walk cycle, just three more states
instead of nine.

---

## 2. Architecture

```
World.events (src/sim — existing, un-consumed today)
Shopper counters (src/sim — existing: spoiledEncounters, priceSurpriseSum, impulseHits,
                  balked, abandoned, checkoutJoinedAtTick, remainingList, cart)
        │
        │  read-only accessor appends (ADR 0007: "Track B appends read-only
        │  accessors only (events, animation state)")
        ▼
BuildModeBridge (src/bridge/build-bridge.ts)
  + drainEvents(): readonly SimEvent[]
  + shoppersSnapshot(): [...existing fields, listRemaining, cartSize, spoiledEncounters,
      priceSurpriseSum, impulseHits, balked, abandoned, checkoutJoinedAtTick]
  + currentTick(): number
        │
        ▼
gentleSurfaceDrawPlan()   (src/view/gentle-surface-draw-plan.ts — new, pure, tested without
                            a renderer, same shape as draw-plan.ts / shopper-draw-plan.ts)
  in:  events, current shoppersSnapshot, previous-tick shoppersSnapshot (cached by caller),
       currentTick, gentle-surface.json5 tell table, gentle-surface-view.json5 tuning,
       active abandoned-cart markers
  out: { bubbles: SpritePlan[], animationOverrides: Map<shopperId, Pose>,
         worldMarks: SpritePlan[], particles: SpritePlan[], cartMarkers: SpritePlan[] }
        │
        ▼
BuildScene.redraw()  (src/view/BuildScene.ts — extended)
  draws gentle-surface plan output through the existing pooled-sprite mechanism;
  shopper-draw-plan.ts consults animationOverrides when picking a frame instead of the
  normal walk/idle cycle.
```

`gentleSurfaceDrawPlan` owns no sim-facing state and never calls into `World`; `BuildScene` owns the
one piece of cross-tick state it needs (the previous snapshot, for delta detection, plus the
abandoned-cart marker list — both view-local, neither touches the world hash).

---

## 3. Content additions (Track B-owned: `content/design/**`)

`content/design/gentle-surface-view.json5` — new, holds display tuning the design doc specifies in
prose but never quantifies:

```json5
{
  bubbleDurationTicks: 12,       // ~1.2s at 10Hz — float up, fade
  bubbleCapRegular: 8,           // §3's "roughly 8 at regular"
  bubbleCapCompact: 4,           // §3's "roughly 4 at compact"
  abandonedCartLifetimeTicks: 60, // view-local simplification — see §4.3
  animationPoseTicks: 6,          // how long a reaction pose overrides the walk/idle cycle
  // Same-tick priority when one shopper trips two terms at once (rare: a purchase can carry
  // both a priceSurprise and an impulse hit in the same #stepShopping call). Highest first.
  priority: [
    'spoiledEncounters', 'queuePenaltyBalk', 'priceSurpriseNegative',
    'queuePenaltyRising', 'fillRateMiss', 'priceSurprisePositive', 'impulsePurchase',
  ],
}
```

`content/asset-manifest.json` gains the three new `shopper` states (`pause`, `recoil`, `hop`) and any
still-missing bubble/particle entries for the deferred terms (art authored now, triggers later).
Existing bubble/particle/decal declarations from S2 are unchanged.

---

## 4. Trigger detection

All of the following are pure computations over data the sim already produces — no new `src/sim`
behavior, no new hashed state.

### 4.1 Per-pickup terms (delta against the previous-tick snapshot)

| Term | Condition this tick |
|---|---|
| `spoiledEncounters` | `Δ spoiledEncounters > 0` |
| `impulsePurchase` | `Δ impulseHits > 0` |
| `priceSurpriseNegative` / `Positive` | `Δ cartSize == +1` (a real purchase happened) and the resulting `Δ priceSurpriseSum` is ≤ −0.1 or ≥ +0.1 (the term's declared threshold) |
| `fillRateMiss` | `Δ listRemaining == −1`, `Δ cartSize == 0`, `Δ spoiledEncounters == 0` — the list shrank without a sale or a spoilage, which only `outOfStock` in `#stepShopping` produces |

### 4.2 Queue terms

- **`queuePenaltyRising`** has no live sim counter (`checkoutWaitTicks` is written once, at trip
  resolution, not incremented per tick). It's computed client-side, reusing the sim's own formula and
  constant rather than duplicating tuned numbers:
  ```ts
  import { DEFAULT_STAFFING_CONFIG } from '../sim/index.js';
  // shopper.state === 'checkingOut' && shopper.checkoutJoinedAtTick !== null
  const waited = currentTick - shopper.checkoutJoinedAtTick;
  const penalty = Math.min(1, (waited / DEFAULT_STAFFING_CONFIG.balkToleranceTicks) ** 1.6);
  ```
  Edge-triggered against the term's `threshold: 0.3` — fires once when `penalty` crosses the
  threshold, not on every tick above it, so it doesn't spam a bubble every frame of a long wait.
- **`queuePenaltyBalk`** fires directly off `drainEvents()`: a `cartAbandoned` event this tick, for
  a given `shopperId`, is the trigger. Position comes from that shopper's entry in the *current*
  `shoppersSnapshot()` (same tick — the shopper is still at the checkout lane when the event fires,
  since it transitions to `'leaving'` and walks out over subsequent ticks).

### 4.3 The abandoned cart's lifetime

`cartAbandoned`'s tell says the cart "persists as a world object until staff clears it" — there is no
staff-clearing mechanic in the sim. Modeling one is out of scope (it would be a `src/sim` change).
Instead, the marker is a view-local object with a fixed lifetime (`abandonedCartLifetimeTicks`,
§3) that fades out on its own. This is a documented simplification, the same category as 1.7's
per-good (not per-shelf) inventory tracking — a real future mechanic, not modeled here because
nothing requires it yet.

### 4.4 World marks

- `fillRateMiss`, `visibility` — already rendered (S2's shelf full/half/empty states).
- `priceSurpriseNegative` — "item briefly highlights": a short tint flash on the nearest placed
  fixture to the shopper's position at trigger time. No shelf→good accessor is needed (that gap is
  still S2's noted one-line Track A task, unrelated to this); proximity to the shopper's own already-
  exposed position is precise enough for a momentary flash.
- `spoiledEncounters` — brown tint on the same nearest-fixture basis, plus the `flies` particle: 2–3
  pooled overlay sprites cycling two frames near the fixture for a fixed duration, using the same
  sprite-pool pattern `BuildScene` already has (no Phaser particle emitter — ADR 0005's pixel-perfect,
  integer-position discipline argues against one).
- `queuePenaltyBalk` — the `cart_abandoned` fixture sprite, placed per §4.3.

### 4.5 Rate limiting (`gentle-surface.md` §3)

`gentleSurfaceDrawPlan` collects every term that triggered this tick across all shoppers, resolves
same-shopper conflicts via the `priority` list (§3), then caps the total bubble count at
`bubbleCapRegular`/`bubbleCapCompact` (breakpoint passed in by the caller, same `compact`/`regular`
source `src/platform/layout` already provides elsewhere), dropping lowest-priority overflow silently
— consistent with "silence is a feature": a dropped bubble for a same-tick spike isn't persisted or
retried, matching the design doc's explicit tolerance for that.

---

## 5. Components

### 5.1 `src/bridge/build-bridge.ts` (append-only, per ADR 0007)

```ts
drainEvents(): readonly SimEvent[];   // forwards world.events.drain() — confirmed no existing consumer
currentTick(): number;

shoppersSnapshot(): readonly {
  id: number; x: number; y: number; state: ShopperState; segment: Segment;
  listRemaining: number; cartSize: number; spoiledEncounters: number;
  priceSurpriseSum: number; impulseHits: number; balked: boolean; abandoned: boolean;
  checkoutJoinedAtTick: number | null;
}[];
```

### 5.2 `src/view/gentle-surface-draw-plan.ts` (new, pure)

```ts
export interface GentleSurfacePlan {
  readonly bubbles: readonly SpritePlan[];
  readonly worldMarks: readonly SpritePlan[];
  readonly particles: readonly SpritePlan[];
  readonly cartMarkers: readonly SpritePlan[];
  readonly animationOverrides: ReadonlyMap<number, 'pause' | 'recoil' | 'hop'>;
}

export function gentleSurfaceDrawPlan(
  events: readonly SimEvent[],
  current: readonly ShopperSnapshot[],
  previous: ReadonlyMap<number, ShopperSnapshot>,
  currentTick: number,
  breakpoint: 'compact' | 'regular',
  state: GentleSurfaceState,   // mutable: active bubbles/markers with their expiry tick — owned
                                // and threaded by the caller (BuildScene), not by this module
): GentleSurfacePlan;
```

### 5.3 `src/view/shopper-draw-plan.ts` (extended)

`buildShopperDrawPlan` gains an optional `animationOverrides` parameter; when a shopper has an active
override, frame selection reads from the pose's frame set for `animationPoseTicks` instead of the
normal walk/idle cycle, then falls back automatically once expired.

### 5.4 `src/view/BuildScene.ts` (extended)

`redraw()` calls `bridge.drainEvents()` and the extended `shoppersSnapshot()`, threads them plus its
own cached previous-snapshot map and `GentleSurfaceState` into `gentleSurfaceDrawPlan`, and draws the
result through the existing `#draw`/pool mechanism alongside floor/fixture/shopper sprites.

---

## 6. Testing

- `gentle-surface-draw-plan.test.ts` — pure, event/delta fixtures → expected plan. Covers: each of
  the 7 live terms firing on its exact condition and not on adjacent non-triggering deltas; the
  same-tick priority resolution; the bubble cap at both breakpoints; the abandoned-cart marker's
  lifetime expiry.
- Golden hashes: unaffected by construction (nothing here touches `src/sim`); `npx vitest run
  tests/golden` is still the boundary check ADR 0007 names.
- Playwright, both viewports: force a fillRateMiss, a spoiled pickup, and a checkout abandonment in a
  scripted scenario and screenshot the result — the actual "does it read" proof, matching every prior
  Track B phase's manual/E2E check.

---

## 7. Definition of done

- All 7 live terms fire on their documented condition, visible in a real browser at both 390×844 and
  1440×900.
- The 8 deferred terms (§1.1) have manifest-declared art (not placeholder-hatched) but no live
  trigger, and the gap is recorded in `CHANGELOG.md`/`docs/handoff.md` the way S2 recorded the
  stock-level gap.
- Golden hashes byte-identical.
- `npm run verify` green, including `check:gentle-surface` (now with three new asset-manifest states
  wired) and `check:budget` (new sprite states + view code against the existing bundle margin).
