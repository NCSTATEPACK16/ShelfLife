# 7. Two tracks in one repository: sim depth and surface, in parallel

**Status:** Accepted
**Date:** 2026-08-26

## Context

Milestone 2 has two independent bodies of work. **Track A (depth)** continues the simulation:
Rival Dynamics, per `docs/superpowers/plans/2026-08-04-rival-dynamics.md`, which closes the
phase 2.0 gate. **Track B (surface)** is the 16-bit revamp: projection, renderer, art pipeline,
gentle-surface rendering, and the console shell.

Run sequentially, one blocks the other for weeks. Run carelessly in parallel, they collide on
the handful of files that sit between the simulation and the screen — and one of those files
is `tests/golden/hashes.json`, where a careless merge silently destroys the determinism
guarantee that `docs/design/competitive-position.md` §3.3 names as a design pillar.

The boundary rules from ADR 0002 make parallelism unusually safe here: the sim cannot import
from the view, and the view reads snapshots rather than state. The file sets are nearly disjoint
by construction.

## Decision

Track A stays on `milestone/m2-depth` in the primary working directory. Track B runs on
`milestone/m2-surface` in a **sibling git worktree** at `../ShelfLife-surface` — deliberately
outside the repository tree, because the existing `.claude/worktrees/market-segments/` checkout
sits inside it and pollutes every repository-wide search.

**Ownership:**

| Path | Owner |
|---|---|
| `src/sim/**`, `content/balance/**`, `content/rivals/**` | Track A |
| `tools/art/**`, `tools/validate/**`, `assets/**`, `src/view/**`, `src/ui/**`, `content/design/**`, `content/asset-manifest.json`, `landing/**` | Track B |

**The five shared files:**

| File | Rule |
|---|---|
| `package.json` | Track B lands **all** new dependencies and scripts in one commit, first. Track A does not touch it. |
| `src/bridge/build-bridge.ts` | Track B **appends read-only accessors only** (events, animation state). Track A owns everything else, including the missing `setPrice`/`startPromotion` methods. |
| `tests/golden/hashes.json` | **Track A only.** |
| `content/design/tokens.json` | Track B only. |
| `CHANGELOG.md`, `docs/handoff.md` | Append-only, one section per track. Conflicts here are trivial and expected. |

**The invariant that makes this safe:**

> **A Track B change may never alter a world hash.**

`src/view` and `src/ui` are downstream of the simulation and cannot affect it. If a surface
change moves a golden hash, view logic has leaked into the sim: that is a boundary violation
to fix, **never a re-baseline.** This is a strictly stronger rule than `CLAUDE.md`'s general
"if a golden hash changes, STOP", and it applies only to Track B.

Merge direction is one-way: Track B rebases onto `milestone/m2-depth` at each of its own phase
gates. Track A never rebases onto Track B.

## Consequences

**Bought:**
- Both tracks progress without blocking, and the visible one starts producing screenshots
  immediately.
- `npx vitest run tests/golden` becomes a precise boundary check for Track B, not just a
  regression test.
- Rebasing at gates keeps the merge small and frequent rather than large and terminal.

**Paid:**
- Two `node_modules` and two dev servers. Disk, not complexity.
- Context-switching cost for a solo developer. Real, and the reason the tracks have separate
  directories rather than separate branches in one checkout.
- `src/bridge/build-bridge.ts` will conflict occasionally. Append-only on one side keeps the
  resolution mechanical.
