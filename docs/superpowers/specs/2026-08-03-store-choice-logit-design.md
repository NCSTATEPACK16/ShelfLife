# Phase 2.0c — Store choice, loyalty, and word-of-mouth

*Design spec. 2026-08-03. Milestone 2, phase 2.0 (Market & rivals), third sub-phase.*

Covers `PLAN.md` §5.1 (multinomial logit store choice), §5.2 (loyalty), and §5.3's
word-of-mouth clause. Closes §4's day loop on the demand side: *households wake → choose
store → walk aisles → fill basket → queue → checkout → satisfaction → loyalty delta →
word of mouth*.

Phase 2.0's remaining work — rival sim, personality vectors, and the first three
signatures (§5.8) — is a **separate spec and a separate PR**, and is what reaches the
phase 2.0 gate ("harness win rates decrease monotonically with CL rank"). This spec does
not reach that gate and does not claim to.

---

## 1. Why now

2.0a authored household segments and their `UtilityWeights`. 2.0b authored `RivalStore`,
the catchment `Position`, and `travelCost`. Both landed deliberately inert — nothing reads
a β vector or a travel cost today.

There is also **no trip scheduler**. `spawnShopper` has been a test-driven command since
phase 1.6. Nothing in the sim ever asks "which store?", because nothing ever asks "does
this household shop today?" either.

This phase supplies the missing caller. It is the first thing that reads `UtilityWeights`,
a rival's store-level terms, and `travelCost` — and the first thing that makes phase 1.9's
loss-leader pricing affect anything beyond the basket of a shopper who already walked in.

## 2. Scope

**In:**

- `MarketSystem` — daily trip scheduling and the store-choice logit.
- `LoyaltySystem` — `L(h,s)` and `S̄(h)`, the §5.2 update, and daily decay.
- `ReputationSystem` — one-hop word-of-mouth diffusion over a k-nearest-neighbour relation.
- Relocating `Household` and its pantry model from `shoppers/` to `market/`.
- Two new authored fields on `RivalStore`; a `brandAffinity` map per segment.
- New balance content; new golden scenario; re-baseline of affected existing scenarios.

**Out:**

- Rival simulation, personality vectors, signatures (§5.8) — next PR.
- Any view-layer work. This is sim-only. Store choice, loyalty, and word-of-mouth emit
  events; phase 2.2 gives them tells and renders them.
- A cleanliness system (§4) — player `ambiance` is a balance constant, see §5.
- Multi-store *ownership*. The player has one store, fixed at the catchment origin
  (`catchment.json5`), per §1.3's non-goals.

---

## 3. Architecture

Three systems, matching `PLAN.md` §4's system inventory, which already names `market`,
`loyalty`, and `reputation` as separate entries.

| System | Directory | Owns | Reads | Writes |
|---|---|---|---|---|
| `MarketSystem` | `src/sim/systems/market/` | households, pantries, lists, trip scheduling, the logit | segment config, catchment config, rival roster, `EconomySystem`, `InventorySystem`, `CheckoutSystem`, `LoyaltySystem` | spawns `Shopper`s; resolves rival trips |
| `LoyaltySystem` | `src/sim/systems/loyalty/` | `L(h,s)`, `S̄(h)`, `daysSinceVisit(h,s)` | balance constants, per-store δ | sole writer of its arrays |
| `ReputationSystem` | `src/sim/systems/reputation/` | the k-NN relation over households | trip satisfactions | calls `LoyaltySystem` to nudge neighbours |

Each gets `index.ts`, `types.ts`, and `*.test.ts` per `CLAUDE.md`.

`LoyaltySystem` is the **single writer** of loyalty. `MarketSystem` (trip outcomes) and
`ReputationSystem` (diffusion) call into it rather than mutating arrays. One place to
reason about clamping, and one place for the next PR to make a boss cheat on δ.

### 3.1 `Household` moves from `shoppers/` to `market/`

`ShoppersSystem` has owned households since phase 1.6, when the in-store agent was the only
consumer. The scheduler inverts that: `MarketSystem` needs every household's segment,
position, and list *before* any shopper exists.

After the move:

- `market/` owns `Household`, the pantry model (`advancePantryDay`, `deriveShoppingList`),
  the `addHousehold` command, daily depletion, trip scheduling, and the logit.
- `shoppers/` owns `Shopper` only — the in-store FSM, pathing, cart, and satisfaction. It
  holds a read reference to `MarketSystem` for the spawning household's list and segment.

This is the §5.1-versus-§5.4 split the plan already draws. It moves household bytes out of
`ShoppersSystem#hash` into `MarketSystem#hash`; see §8.

`BuildModeBridge#addHousehold` and the `addHousehold` command keep their current signature
(`householdId`, `segment`, `position`) — only the system that handles them changes.

### 3.2 Tick order

`MarketSystem` is registered **before** `ShoppersSystem`; `LoyaltySystem` and
`ReputationSystem` **after** it.

At `world.tick % TICKS_PER_SIM_DAY === 0`, `MarketSystem#update` does, in order:

1. Advance every pantry by one day (segment consumption multiplier), ascending household id.
2. Re-derive each household's list.
3. For each household whose list crosses the trip threshold (§4.1), evaluate the logit and
   draw a store.
4. Player store → issue a shopper spawn. Rival → resolve a closed-form trip immediately
   (§6.3).

`ShoppersSystem` then steps in the same tick, so a household scheduled today walks in today.
`LoyaltySystem` and `ReputationSystem` step last, so a trip completing this tick is
reflected in loyalty this tick.

---

## 4. Trip scheduling

### 4.1 The threshold

A household takes a trip when its pantry-derived list reaches `tripListThreshold` items —
a single store-wide constant in `content/balance/market.json5`, not a per-segment override.
Segments already differentiate trip frequency through `consumptionMultiplier`, which sets
how fast the list fills; a second per-segment knob on the same behaviour would be two
tuning surfaces for one outcome.

Deterministic — no RNG decides *whether* a household shops. §5.4 wants weekly milk-buyers
and monthly rice-buyers to be **emergent** from per-good depletion rates and the segment's
`consumptionMultiplier`, and a threshold on the already-existing list is the direct reading
of that. RNG enters only at *where* (§6.2).

A household with an active shopper does not schedule a second trip. Enforced by checking
`ShoppersSystem` for a live shopper on that household id before scheduling.

### 4.2 `spawnShopper` survives

The command remains, for scripted arrivals, scenario fixtures, and tests that want to
exercise the in-store FSM without waiting for a pantry to drain. It is no longer the only
way a shopper appears.

---

## 5. The utility function

```
U(h,s) =  βp · priceFit(h,s)
        + βa · assortmentFit(h,s)
        + βq · quality(s)
        + βv · service(s)
        + βm · ambiance(s)
        + βl · loyalty(h,s)
        + βb · brandAffinity(h, s.identity)
        − βd · travelCost(h,s)
```

β vector and τ come from the household's `SegmentDef.weights` (2.0a, unchanged).

| Term | Player store | Rival store |
|---|---|---|
| `priceFit` | household's list costed at `EconomySystem#priceOf` ÷ the same list at `referencePriceOf` → a price index | authored `priceIndex` |
| `assortmentFit` | fraction of the household's list currently stocked **and** in stock | authored `assortmentBreadth` |
| `quality` | mean freshness across stocked goods (`InventorySystem`) | authored |
| `service` | staffed-open-lane ratio × mean staff skill (`CheckoutSystem`) | authored |
| `ambiance` | `playerAmbiance` balance constant — **stub**, see below | authored |
| `loyalty` | `LoyaltySystem#get(h, s)` | same |
| `brandAffinity` | per-segment map keyed by store `identity` | same |
| `travelCost` | `travelCost(h.position, s.position, catchmentConfig)` (2.0b) | same |

**Index-to-fit mapping**, used by `priceFit` and nothing else:

```
fit = clamp01( neutral + (1 − index) )        // neutral = 0.5, balance-authored
```

Index 1.0 (at reference price) → 0.5, and the mapping discriminates in **both** directions.
A naive `clamp01(2 − index)` saturates at 1.0 for every price at or below reference, which
would make a loss leader indistinguishable from a modest discount — precisely the signal
this phase exists to carry.

`assortmentFit` is already a [0,1] fraction and needs no mapping. It deliberately reuses the
"how much of the list is available" idea that `ShoppersSystem` computes as `fillRate`,
rather than growing a shelf-geometry model. `visibility`/facings remain deferred (phase 1.7).

### Two honest stubs, stated rather than hidden

- **Player `ambiance` is a constant.** The `cleanliness` system in §4's inventory does not
  exist. `playerAmbiance` lives in `market.json5` with a comment saying exactly this. It is
  a real term with a fake input, not a fake term.
- **`brandAffinity` is authored, not learned.** A small map per segment, keyed by store
  `identity` (`'player'`, `'deep-discount'`), in `segments.json5`. Enough for a foodie to
  dislike a discounter without inventing a brand model. Unknown identity → `0`, which is the
  neutral value, so adding a rival never silently perturbs existing segments.

---

## 6. Choice

### 6.1 Softmax, and why ε is not implemented

§5.1 writes both `+ ε` (seeded Gumbel noise) and `P = exp(U/τ) / Σ exp(U/τ)`. These are the
same thing written twice: the softmax **is** the closed form of "add i.i.d. Gumbel noise and
take the argmax." Implementing both applies the noise twice and quietly widens the
distribution past what τ claims.

**Decision: compute `U` without ε, take the softmax, draw from the resulting distribution.**

The spec comment in the source must say this, so that a future reader does not "fix" the
missing ε back in.

Practical benefit: the probabilities are real inspectable numbers, which §12.4's
share-of-wallet KPIs and the eventual rival-intel panel need anyway. The Gumbel-max trick
would give a choice without ever materialising them.

`exp` is evaluated after subtracting `max(U)` across stores. Required, not optional — a low
τ (0.2 is a plausible tuning for a decisive segment) divides utilities into the hundreds.

### 6.2 The draw

One `rivalNoise` uniform draw per scheduled trip, then a cumulative walk in ascending store
index (0 = player, 1..n rivals in authored roster order).

`rivalNoise` has been reserved in `STREAM_NAMES` since phase 1.3 and is unused until now —
the same pattern 1.6 (`impulse`), 1.7 (`spoilage`), and 1.8 (`checkout`) followed.

Households are evaluated in ascending id so the draw sequence is stable.

### 6.3 Rival trips

No agent spawns and no pathing runs. Satisfaction is a closed form over that rival's
authored terms:

```
satisfaction(h,s) = clamp01( wq·quality + wv·service + wm·ambiance
                           + wa·assortmentBreadth + wp·priceFit )
```

with `w*` in `market.json5` and `priceFit` being the §5 mapping applied to that rival's
authored `priceIndex` — household-independent, unlike the player-store case. This is §5.8's "rivals run the same sim at reduced fidelity"
applied to the demand side only — no rival inventory, queues, or spoilage this PR.

Emits `rivalTripCompleted { householdId, storeId, satisfaction }`. Downstream,
`LoyaltySystem` and `ReputationSystem` treat it identically to a player trip: a rival trip is
not a special case anywhere but here.

---

## 7. Loyalty and word-of-mouth

### 7.1 State

In `LoyaltySystem`:

- `L` — `Float32Array(householdCount × storeCount)`. §5.2 specifies `Float32Array`.
- `meanSatisfaction` — `Float32Array(householdCount)`, initialised to `initialMeanSatisfaction`
  (0.5, balance) so a household's first trip has a sane reference.
- `daysSinceVisit` — `Uint16Array(householdCount × storeCount)`.

Store count is fixed at world construction from the rival roster. Arrays grow on
`addHousehold`.

### 7.2 Per-trip update

On any completed trip, player or rival:

```
L'(h,s) = clamp01( L(h,s) + α · (satisfaction − S̄(h)) )
S̄'(h)  = S̄(h) + λ · (satisfaction − S̄(h))
daysSinceVisit(h,s) = 0
```

α ≈ 0.06 (§5.2). **λ is new to this spec:** without it, S̄ stays frozen at its initial
constant forever and α stops meaning anything after a household's first few trips. It goes
in `market.json5` beside α.

The subtraction is the mechanic. Loyalty tracks satisfaction *relative to what this
household has come to expect* — a consistently mediocre store keeps its regulars, and a good
store that slips loses them.

### 7.3 Daily decay

For every `(h,s)` the household did not visit that day:

```
daysSinceVisit(h,s) += 1
L'(h,s) = clamp01( L(h,s) − δ_s · decay(daysSinceVisit) )
decay(d) = min(d, decayCapDays) / decayCapDays
```

δ is **per store**, defaulting from `market.json5`, overridable by an optional
`loyaltyDecay` on `RivalStore`. That is the seam for §5.2's "bosses get lower δ —
Trailblazer Jim's runs δ/5." Sav-A-Lott takes the default in this PR; the override exists
and is unused, deliberately.

Decay is bounded below by the `clamp01`, so a household that stops shopping decays toward
zero rather than through it.

### 7.4 Word-of-mouth

`ReputationSystem` precomputes, per household, its `k` (≈3, balance) nearest neighbours by
catchment `travelCost`, ties broken by ascending household id. Computed once, invalidated on
`addHousehold`. Households do not move.

A completed trip with `satisfaction > delightThreshold` (0.85) or `< disgustThreshold`
(0.25) emits `wordOfMouth { sourceHouseholdId, storeId, polarity, affectedHouseholdIds }`
and nudges each neighbour's loyalty toward that store by `±ω`.

`ω` is an order of magnitude below α: hearsay must not outweigh having actually shopped
somewhere. Thresholds, `k`, and `ω` all live in `market.json5`.

**Diffusion is one hop.** A nudged neighbour does not re-emit. §5.3 says "affecting `k`
neighbor households," which is one hop; recursive diffusion over a k-NN graph is an
unbounded cascade with a tuning surface nobody has asked for.

Ordering: the system collects the tick's trip outcomes, sorts by source household id, then
applies. Never dependent on which system stepped first.

---

## 8. Determinism and the world hash

Sim-boundary rules are unchanged and non-negotiable: no `Math.random()`, no `Date.now()`,
no DOM, no Phaser, in any of the three new directories.

Sources of nondeterminism and their controls:

- **Iteration order** — every household loop is over ascending id. Every store loop is over
  ascending store index. Never over `Map` insertion order.
- **RNG** — one `rivalNoise` draw per scheduled trip, in household id order. No other new
  stream. No existing stream's draw count changes.
- **Float32 storage** — arithmetic is `f64`, stored to `f32`. IEEE-754 rounding is
  deterministic across platforms; the golden suite already runs on Ubuntu and Windows in CI
  and will catch any surprise here.
- **k-NN ties** — broken by ascending household id, never by scan order.

New `hash()` contributions:

- `MarketSystem#hash` — the household set (id, segment, position, pantry, list) that
  `ShoppersSystem#hash` writes today, moved verbatim in field order to keep the diff
  reviewable, plus scheduling state.
- `LoyaltySystem#hash` — `L`, `meanSatisfaction`, `daysSinceVisit`, in array order.
- `ReputationSystem#hash` — the k-NN relation only. It holds no state across ticks.

**Trip outcomes are hashed.** `MarketSystem` owns a `pendingOutcomes` buffer: it clears the
buffer at the top of its own `update`, appends rival-trip outcomes there, and
`ShoppersSystem` appends player-trip outcomes as they complete. `LoyaltySystem` and
`ReputationSystem`, registered after both, read it.

The buffer is therefore still populated when the world hashes at end of tick, so
`MarketSystem#hash` folds it in. The alternative — having the last system clear it so the
hash never sees it — makes correctness depend on registration order in a way nothing else
in the codebase does. State that exists at hash time gets hashed.

### Golden re-baseline

Autonomous trips are a genuine behaviour change for any scenario containing a household. It
is not avoidable by choosing a neutral value, and no `autoTrips` flag will be added to
protect old fixtures — a flag whose only purpose is to keep goldens still is a second code
path pretending to be schema (`CLAUDE.md`, "Modes").

Procedure, matching phases 1.7 and 2.0b:

1. Land the systems and confirm exactly which scenarios move.
2. Confirm the scenarios that should *not* move are byte-identical **before** rewriting
   anything.
3. Re-baseline in a **dedicated commit** whose message states what changed behaviourally and
   why, touching `tests/golden/hashes.json` and nothing else.

A new scenario, `catchment-week`, is added: several households across segments over ~7 sim
days with Sav-A-Lott present, exercising scheduling, both trip paths, loyalty drift, decay,
and at least one word-of-mouth emission.

---

## 9. Content

New file `content/balance/market.json5`, Zod-validated on load following `market/config.ts`'s
existing pattern:

```
tripListThreshold, priceFitNeutral, playerAmbiance,
loyaltyAlpha (α), meanSatisfactionLambda (λ), loyaltyDecayDefault (δ),
decayCapDays, initialMeanSatisfaction,
womNeighbors (k), womDelta (ω), delightThreshold, disgustThreshold,
rivalSatisfactionWeights { quality, service, ambiance, assortment, price }
```

Changes to existing content:

- `content/rivals/sav-a-lott.json5` — add `priceIndex` (low) and `assortmentBreadth`
  (narrow). Mechanically what "dying deep-discounter" means, and what §5.8's
  `priceAggression` will move next PR. Optional `loyaltyDecay` omitted.
- `content/balance/segments.json5` — add a `brandAffinity` map per segment.

No magic numbers in TypeScript. No new brand or product names: Sav-A-Lott is already logged
in `docs/legal/parody-review.md` and no second rival appears here.

Every schema addition is required-with-no-default where a silent default would hide an
authoring mistake, following 2.0a's stance on segments and 2.0b's on positions.

---

## 10. Testing

Test-driven throughout, per `CLAUDE.md`. Read each existing system's tests before editing it.

**Unit**

- Softmax: sums to 1; numerically stable at τ = 0.05 and utilities spanning ±50; low τ
  approaches winner-take-all, high τ approaches uniform.
- Index-to-fit mapping discriminates in both directions around 1.0.
- Each utility term in isolation, player and rival source.
- Trip threshold fires on the correct sim day for a known depletion rate.
- Loyalty: satisfaction above S̄ raises `L`; below lowers it; clamped at both ends; S̄ tracks.
- Decay: `L` falls monotonically across absent days and stops at 0.
- k-NN: correct neighbours, ties broken by id, recomputed on `addHousehold`.
- Word-of-mouth: exactly `k` neighbours nudged, correct sign, no second hop.

**Integration — the ones worth the phase**

- *Defection and return.* A `priceHunter` household shopping the player store defects to
  Sav-A-Lott as player prices rise, and returns when a loss leader lands. This is the test
  that finally connects phase 1.9's pricing to store choice, and it is the closest thing
  this PR has to a gate proof.
- *Loyalty is stickiness.* Two identical households, one with high prior loyalty, facing an
  identical price shock: the loyal one defects later. If it does not, βl is not load-bearing
  and the model is wrong.
- *Word-of-mouth is visible in choice.* A delighted trip measurably shifts a neighbour's
  subsequent store-choice probability. Diffusion that never changes a decision is dead code.

**Determinism**

- `catchment-week` replays hash-identical across three runs and at both LOD settings.
- A replay through `core/world.js`'s `replay()` — not a hand-pushed command log, per phase
  1.8's lesson.

**Manual check before calling it done**

Run the dev server, drive several sim days, confirm shoppers appear without any manual
`spawnShopper` and that arrival rate responds to price changes. Phases 1.4, 1.5, 1.6, and
1.8 each had a bug that only this step or a full end-to-end test caught; 1.7 did not. The
step is not optional.

**Budget**

The logit is O(households × stores) once per sim day, not per tick. `npm run check:budget`
must stay green; if it does not, that is a finding worth writing down, not a threshold to
raise.

---

## 11. Risks

- **Blast radius of the household move.** It touches `shoppers/`, the bridge, several test
  files, and every golden fixture. Mitigation: move it as its own commit, mechanical and
  behaviour-free, with the hash field order preserved verbatim so the golden diff is
  attributable to the scheduler and nothing else.
- **Tuning is not correctness.** Nine terms and a temperature per segment can produce a
  model that is deterministic, well-tested, and still no fun. The integration tests above
  assert *directional* behaviour, not specific numbers, precisely so tuning stays free.
- **Player-side terms are thin.** `ambiance` is constant and `quality` reduces to mean
  freshness. Both are real inputs to a real formula, but neither is yet a lever the player
  pulls deliberately. Worth revisiting when `cleanliness` exists.

---

## 12. Definition of done

- `npm run verify` green, including `check:content`, `check:tokens`, and the gentle-surface
  validator.
- `npm run check:budget` green.
- Golden re-baseline landed in its own commit with a written justification; unaffected
  scenarios confirmed untouched beforehand.
- `docs/handoff.md` updated: what landed, what is stubbed (`ambiance`, `brandAffinity`,
  unused `loyaltyDecay` override), and that the phase 2.0 gate belongs to the next PR.
