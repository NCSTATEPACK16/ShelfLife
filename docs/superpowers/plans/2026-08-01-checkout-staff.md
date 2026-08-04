# Phase 1.8 — Checkout & staff: design notes

Condensed, same pattern as 1.6/1.7's notes.

**Gate (PLAN.md §16):** understaffing produces visible queues, balking, abandonment, and a
measurable satisfaction drop.
**Deliverable:** registers, lanes, hiring, shifts, wages, morale, training, cleanliness,
self-checkout.

## Scope cuts

- **One combined `src/sim/systems/checkout/` system**, not separate staff/checkout systems — lane
  openness depends directly on staff assignment, and splitting them would just mean one calling the
  other's methods every tick anyway.
- **Morale is static per hire**, not a dynamic simulation (no fatigue/overwork/burnout mechanics).
  It's a real lever — `hireStaff` takes a morale value and it genuinely affects service speed and the
  `staffInteraction` tell — just not one that changes on its own yet. Segment-specific balk
  tolerances (§5.6) don't exist either, matching 1.6's "no household segments" cut.
- **Service time is not a true Gamma distribution.** `serviceTicks = round(items × baseTicksPerItem ÷
  (skill × moraleFactor))` with a small uniform jitter — the mean scales the way §5.6 describes
  (items, scannerSpeed × cashierSkill), but the distribution's exact shape doesn't matter for the
  gate (queue length/balking/satisfaction vs. staffing level), and a real Gamma sampler is more
  numerical machinery than that's worth right now.
- **No wage ledger.** Wages emit a `wagesPaid` event with the daily total; there's no P&L to post it
  to until 1.9.
- **No restock-cost mechanic for abandoned carts.** A `cartAbandoned` event carries the lost items for
  whoever wants to react to it later; nothing consumes it yet.
- **Self-checkout's "+theft" isn't wired into `InventorySystem`'s shrink.** That would be the first
  real use of §5.5's `staffCoverage` theft term, which is a genuine and worthwhile follow-up, but
  isn't literally required by this phase's gate (which is about queues/balking/satisfaction, not
  shrink numbers) — noted as a real gap, not silently dropped.

## Content

- `content/fixtures/catalog.json` gains `self_checkout` (walkable: false, same footprint shape as
  `register`) — self-checkout is a distinct fixture, not a flag on `register`.
- `content/balance/staffing.json5`: `serviceTicksPerItem`, `wagePerStaffPerDay`,
  `balkToleranceTicks`, `abandonToleranceTicks` (§5.6: abandon at 2× the balk tolerance),
  `trainingSkillIncrement`, `selfCheckoutServiceMultiplier`, `selfCheckoutServiceScorePenalty`
  (§5.6's flat −0.08), `cleanlinessDecayPerTick`, `cleanlinessRestorePerStaffPerTick`.

## Sim

- `src/sim/systems/checkout/`: `types.ts` (`StaffMember`, `Lane`, `CheckoutOutcome`), `config.ts`,
  `system.ts` (`CheckoutSystem`).
- Commands: `hireStaff` (staffId, skill, morale), `assignStaffToRegister` (staffId, instanceId),
  `trainStaff` (staffId, +skill capped at 1).
- `CheckoutSystem` tracks a `Lane` per placed `register`/`self_checkout` instance (refreshed on grid
  version change, same pattern `ShoppersSystem`/`PathingSystem` already use). A `register` lane is
  open only with an assigned staff member; a `self_checkout` lane is always open. Each open lane
  gets its own pathing destination (`checkout:<instanceId>`) via direct `PathingSystem.applyCommand`
  calls — the same direct-sibling-call pattern every system in this codebase uses since 1.5.
- Public API for `ShoppersSystem` (same direct-call pattern, not commands/events — events are for
  external consumers, not inter-system signaling): `shortestOpenLane()`, `laneDestinationId(id)`,
  `isSelfCheckout(id)`, `joinQueue(shopperId, laneId, itemCount, tick)`, `statusOf(shopperId)` →
  `'waiting' | 'beingServed' | 'sold' | 'balked' | 'abandoned' | 'notInQueue'`, `cleanliness()`.
- `ShoppersSystem#stepCheckingOut` is rewritten: pick the shortest open lane (or balk immediately if
  none are open — that *is* the understaffing story), route to it, join its queue on arrival, then
  poll `statusOf` each tick instead of instantly completing. Satisfaction gains §5.3's `queuePenalty`
  term (superlinear in wait time, `(t/tolerance)^1.6`, finally live) plus fixed penalties for
  balking/abandonment, and self-checkout's flat service-score penalty.

## Explicitly out of scope, deferred to later phases

Dynamic morale, a real Gamma service-time sampler, wage ledger/P&L (1.9), restock cost for abandoned
carts, theft-based shrink wired to `staffCoverage`.
