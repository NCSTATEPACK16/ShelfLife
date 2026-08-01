# Competitive Position

*What Shelf Life is, and what it deliberately is not.*

Companion to `PLAN.md` §18.5. The purpose of this document is to keep the design honest when
feature-envy strikes: when someone says "Supermarket Simulator lets you scan items yourself, should
we?", this is the answer.

---

## 1. The genre is bifurcated

Grocery-store games split cleanly into two things that share a setting and share almost nothing else:

**Moment-to-moment operators.** *Supermarket Simulator*, *Grocery Store Simulator*, and their many
imitators. First-person. You personally scan the items, stock the shelves, and mop the floor. The
pleasure is **tactile competence** — the loop is short, physical, and satisfying in the same way a
well-designed cash register is. Progression is a shop-upgrade tree.

**Strategy layers.** *RollerCoaster Tycoon*, *Two Point Hospital*, *Project Highrise*. Overhead view.
You never touch a product. The pleasure is **legible causality across time** — you made a decision on
Tuesday and on Friday you can see exactly what it cost you. Progression is understanding.

Shelf Life is unambiguously the second kind. The commercial success of the first kind is not evidence
we should move toward it; it's evidence the *setting* has an audience that no one has served with a
strategy game.

---

## 2. The gap we're aiming at

Supermarket Simulator sold enormously well while containing, essentially, no strategy. There is no
competitor. There is no catchment. Your customers are a spawn rate. Pricing is a single global
slider with an obvious optimum. Layout affects walking distance and nothing else.

That is not a criticism — it's a genuinely good game at what it does. It's an observation that a huge
number of people bought a game about running a grocery store and were then given no grocery-store
*decisions*.

**Shelf Life's bet:** those players will pay for the decisions, if the decisions are legible.

---

## 3. The three differentiators

Everything distinctive about this game reduces to three things, and every scope argument should be
tested against them.

### 3.1 Competition that can't be bought
Every other tycoon game's antagonist is a bigger wallet. Ours is measured in **Community Love** — a
loyalty-resilience stat that money cannot directly attack (`PLAN.md` §3). The final boss is a corner
store. This is the hook, it is unique in the genre, and no feature that dilutes it ships.

### 3.2 Layout as economics, not decoration
In the moment-to-moment games, shelf placement is ergonomics. Here, the shopper's **actually walked
path** determines impulse exposure (§5.4), so where you put the milk is a revenue decision with a
satisfaction cost. Flow-field pathing exists specifically to make this computable and therefore real.

### 3.3 Deterministic honesty
Same seed, same outcome (§6.3). You lost because of a decision, not a dice roll. This is a design
pillar, but it also buys three product features nothing else in the genre has: replayable bug repro,
a trustworthy balance harness, and **server-verified daily-challenge leaderboards** where cheating
requires actually finding a good strategy (§8.3).

---

## 4. What we take from whom

| Source | What we take | What we leave |
|---|---|---|
| **RollerCoaster Tycoon 2** | Peep legibility — thought bubbles as the primary telemetry channel. Scenario lists as long-tail content. Silhouette-first art clarity | Its UI density, its palette, its 1999 information architecture |
| **Two Point Hospital / Campus** | Comedy *as* mechanic rather than as decoration. Chapter pacing. Onboarding that never shows a formula. The "brutal math, friendly face" posture | Its cartoon exaggeration level — Shelf Life's satire is drier and aimed at strategy, not slapstick |
| **Supermarket Simulator** | The proof that this setting has an audience. Product and category taxonomy realism. The pleasure of a visibly full shelf | First-person control. Manual scanning/stocking. Any loop where the player does the labor |
| **OpenTTD** | Long-horizon economy tuning; demand that compounds | Its opacity. OpenTTD makes you read a wiki; we refuse |
| **Mini Motorways** *(UX only)* | One-thumb interaction discipline; how much can be removed | Its minimalism as an aesthetic — our game is dense on purpose |

---

## 5. Feature arguments, pre-settled

Recurring temptations and the standing answer:

| "Should we add…" | Answer |
|---|---|
| First-person mode / manually scanning items | **No.** It's a different game, and doing it badly is worse than not doing it. It also breaks the sim/render boundary that everything else depends on |
| Multiple stores / a chain | **v2.** It multiplies every system's complexity and dilutes the single-store spatial game that is our differentiator (§3.2) |
| Real brand names | **Never.** See §2 of the plan |
| Randomized rival behavior for "replayability" | **No.** Determinism is a pillar. Replayability comes from seeds and segment mixes, which are reproducible |
| An idle/offline earning layer | **No.** It converts the game into an idle-manager and kills the "your decision on Tuesday caused this" legibility that is the whole point. Chapters (§12.3) solve the session-length problem instead |
| Simplifying the logit model for tuning ease | **No** — but hide it harder. If the model is hard to *feel*, that's a §12 failure, not a §5 failure |

---

## 6. The elevator answer

> *Supermarket Simulator* is about **running the register**.
> **Shelf Life** is about **running the store** — and about the fact that the beloved little grocer
> down the road is going to be much harder to beat than the giant one across town.
