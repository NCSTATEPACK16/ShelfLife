# Shelf Life

*Every empire starts with a mop.*

An isometric supermarket management sim. You run one store against a ladder of ten parody grocery
chains. Difficulty isn't measured in store size — it's measured in **how much people love the
competition.** The final boss is a tiny store with a bell and a cult.

**Platforms:** Web (primary) → iOS App Store via a Capacitor shell, from one codebase.

---

## Status

**Milestone 1 — Playable Core.** Phase 1.0 (Foundations) complete.

> The full spec (`PLAN.md`) and the running status log (`docs/handoff.md`) are **local-only and
> untracked by design**. Section references like "PLAN.md §7.2" appear throughout the code comments
> and in `CLAUDE.md`; they point at that local document. Everything needed to *build* the project is
> in this repo.

## Quick start

```bash
nvm use              # or match .nvmrc
npm install
npm run dev          # game, at /
npm run dev:landing  # marketing site
npm run verify       # typecheck + lint + test + build — run this after every change
```

## The two rules that matter

1. **`src/sim/**` imports nothing** from Phaser, the DOM, `window`, Capacitor, or Supabase. The
   simulation is a pure, deterministic TypeScript library. This is what makes the iOS port a shell
   instead of a rewrite, the balance harness possible, and leaderboard replay verification possible.
2. **Every UI surface is built phone-first.** Compact (< 768 px) is the primary layout; regular is the
   expansion. A panel that only renders at regular fails review.

Both are enforced by ESLint in CI, not by good intentions. Full rules: [`CLAUDE.md`](./CLAUDE.md).

## Layout

```
content/    game data (JSON5 + Zod) and design tokens — designers edit this, not code
docs/       plan, ADRs, design docs, art bible, legal/parody review
landing/    the marketing site (separate Vite entry)
src/sim/    the deterministic simulation — no platform imports, ever
src/platform/  input intents, layout breakpoints, storage, entitlements
src/view/   Phaser isometric renderer (reads snapshots, never writes)
src/ui/     Preact overlay
tools/      headless balance harness, asset pipeline
```

## License & attribution

Third-party assets are recorded in [`ATTRIBUTION.md`](./ATTRIBUTION.md) as they're added.

All chains, brands, and products in this game are fictional parodies. Any resemblance to actual
retailers is satirical. See [`docs/legal/parody-review.md`](./docs/legal/parody-review.md).
