# 2. The sim boundary and the platform boundary

**Status:** Accepted
**Date:** 2026-07-31

## Context

Shelf Life ships to the web and, from the same codebase, to iOS inside a Capacitor shell. It also
needs a headless balance harness that can run 500 simulations without a renderer, and a server-side
verifier that replays a player's command log to confirm a leaderboard score.

Those three requirements share one root cause: **the simulation must run anywhere, with nothing
attached to it.** A single `import Phaser` or `document.querySelector` inside the sim would break all
three at once, and the breakage would be discovered late — at the iOS milestone, or worse, when the
first cheated leaderboard score can't be disproven.

Separately, the iOS build makes touch a first-class input. Code that listens for `mousemove` directly
works on a laptop and silently fails on a phone. Retrofitting input at the end of a project is one of
the most reliable ways to ship an unusable mobile app.

## Decision

Two ESLint boundary rules, enforced in CI from the first commit.

### 1. The sim boundary

`src/sim/**` may not import from Phaser, the DOM, `window`, `document`, Capacitor, Supabase, or any
other platform API. It may import from `src/sim/**` and from pure utility packages only.

Additionally, `Math.random()` and `Date.now()` are banned inside `src/sim` — determinism requires the
injected RNG streams and the sim clock (`PLAN.md` §6.3).

### 2. The platform boundary

Raw `pointer*`, `mouse*`, `touch*`, and `wheel` event listeners may appear only in
`src/platform/input/**`. Everything else consumes semantic intents (`tap`, `drag`, `pinch`,
`longpress`, `hover`).

A corollary that the linter cannot check, so it lives in `CLAUDE.md` and in review: **`hover` is never
load-bearing.** Anything discoverable only by hovering does not exist on a phone.

## Consequences

**Bought:**
- The Capacitor iOS port is a shell and a config file, not a port.
- `tools/sim-harness` runs the real simulation headlessly; balance numbers are trustworthy.
- Leaderboard scores are verifiable by replaying command logs in a Deno edge function, because the sim
  compiles there unmodified.
- Touch and mouse are the same code path, so the phone build is never a second-class citizen.

**Paid:**
- The renderer cannot reach into sim state; it reads snapshots across the bridge. This is more code
  and occasionally more awkward.
- Anything the sim needs from the platform (time, randomness, storage) must be injected.
- New contributors will hit the rules before they understand them. That is what this ADR is for.

**Related trap:** mobile draws fewer agents than it simulates (`PLAN.md` §10.2). That LOD decision
must live entirely in the renderer. If agent count ever varies inside `src/sim`, determinism dies and
cross-device replay verification becomes impossible. Golden tests run at two LOD settings and must
produce identical world hashes.
