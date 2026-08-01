# Shelf Life — Agent Rules

Read `PLAN.md` before starting. This file is the short version of the rules you must not break.

> **`PLAN.md` and `docs/handoff.md` are local-only and untracked** (see `.gitignore`). They exist in
> the working directory but are deliberately kept off the public repository. Never commit them, and
> never paste their contents into a commit message, an issue, or a PR description. Section references
> like "§7.2" throughout this file and the code point at that local document.

---

## Architecture (violations = revert, not discuss)

### The sim boundary
- `src/sim/**` imports **nothing** from Phaser, the DOM, `window`, Capacitor, or Supabase.
  Enforced by ESLint. This is what makes the iOS port a shell, the balance harness possible, and
  leaderboard replay verification possible. It is not negotiable.
- No `Math.random()` and no `Date.now()` anywhere in `src/sim`. Use the injected RNG streams and the
  sim clock.
- New system → new directory under `src/sim/systems/` with `index.ts`, `types.ts`, `*.test.ts`.

### The platform boundary
- No raw `pointer*` / `mouse*` / `touch*` listeners outside `src/platform/input`. Everything else
  consumes semantic intents (`tap`, `drag`, `pinch`, `longpress`, `hover`). Enforced by ESLint.
- **`hover` is never load-bearing.** If something is only discoverable by hovering, it does not exist
  on a phone. Tooltips are tap-to-open popovers.
- Never call `idb-keyval` or `@capacitor/preferences` directly — go through `src/platform/storage`.
- Every level and chapter transition calls `entitlements.canPlay()`. It returns `true` today; that is
  not a reason to skip the call.

### The LOD / determinism trap
Mobile **draws** fewer agents than it **simulates**. Agent count must never vary inside `src/sim`.
If it does, determinism dies and cross-device leaderboard verification becomes impossible. Golden
tests run at two LOD settings and the hashes must be identical.

### Data, not code
Magic numbers live in `content/balance/*.json5`. Never inline a tuning constant. Colors and spacing
come from `content/design/tokens.json` — a hardcoded hex in `src/ui` or `landing/` fails CI.

---

## Every UI surface is phone-first

This is the rule most likely to be broken by accident and the most expensive to fix late.

- Design and build the **compact** (< 768 px) layout **first**, then expand to `regular`.
- A panel that renders only at `regular` fails review. The compact form is part of the contract.
- Never place an interactive control in the bottom 34 px of a phone screen — the home-indicator swipe
  wins that fight.
- Playwright E2E runs at 1440×900 **and** 390×844 with touch emulation. Both must pass.
- Use `/screen <name>` to scaffold panels — it creates both variants.

---

## Deep sim, gentle surface

- Every term in the satisfaction (§5.3) and impulse (§5.4) formulas **must** have a declared visual
  tell in the content schema. A term without one fails content validation. See
  `docs/design/gentle-surface.md`.
- The player learns the model by watching shoppers, never by reading a formula.
- Depth is always **exactly one click away** — an advisor sentence with a "Show me" button, never a
  wall of numbers and never a hidden five-level drilldown.
- Every KPI displays against a rival benchmark or a 7-day trailing average. A bare number is a bug.

---

## Modes

Campaign, sandbox, scenarios, and daily challenge are the **same level schema with different flags**.
If a mode needs a code path of its own, the schema is wrong — fix the schema, not the mode.

---

## Backend

- The game is fully playable **offline, with no account, forever**. Local IndexedDB is the source of
  truth; Supabase is a sync target. A CI test completes a level with the network disabled.
- Never insert directly into `daily_runs` from the client. Scores are written only by the
  verification edge function, which replays the command log. That replay *is* the anti-cheat.
- RLS on every table. Write the policy test with the policy.

---

## Content rules

- All brand and product names are fictional. See `PLAN.md` §2.
- Never use a real retailer's name, logo, slogan, or color pairing — **not even as a placeholder**.
  Placeholders leak.
- Log every new rival in `docs/legal/parody-review.md` **before** implementing it.
- Record every third-party asset in `ATTRIBUTION.md` when you add it, not later.

---

## Workflow

- One phase at a time, per `PLAN.md` §16. Announce the phase and its gate before starting.
- Before editing an existing system, read its tests first.
- After every meaningful change: `npm run verify`.
- **If a golden hash changes, STOP.** Either it's a bug, or you re-baseline in a dedicated commit that
  explains exactly why the behavior changed. Never re-baseline as a side effect of another change.
- Commit per logical unit, conventional commits. Tag `phase/<id>` at each gate.
- Update `docs/handoff.md` at every gate: what's done, what's next, what's weird.

## When stuck

Don't invent a workaround that violates the architecture. Write an ADR in `docs/adr/` proposing the
change, and ask.
