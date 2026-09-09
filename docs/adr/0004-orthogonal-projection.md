# 4. Orthogonal 3/4 top-down projection, 32×32 tiles

**Status:** Accepted
**Date:** 2026-08-26
**Supersedes:** `PLAN.md` §9.1 (2:1 dimetric, 128×64 tiles, 35.264°/45° camera)

## Context

`PLAN.md` §9.1 opens with "lock this at the start — changing it later is a full re-render."
That warning is correct, and this is the last moment it costs nothing: after ten sim systems
and 391 tests, the renderer is `src/view/iso.ts` (28 lines of projection math) and a single
`Phaser.GameObjects.Graphics` drawing rectangles. **There is no art to re-render.** Zero PNGs
exist in the repository.

Three facts forced the question:

1. **Phaser 4's GPU tilemap layers are orthographic-only.** `TilemapGPULayer` does not support
   isometric or hex projection. Staying dimetric means hand-writing a depth-sorted sprite
   renderer for the floor and forgoing the one piece of Phaser 4 built for exactly this job.
2. **Art cost scales with rotation count.** A dimetric fixture needs 4 rendered directions;
   an axis-aligned one needs 2 (and symmetric decor needs 1). With a solo developer and no
   art budget, halving the sprite count halves the schedule.
3. **Diamonds are bad tap targets.** `CLAUDE.md` makes phone-first non-negotiable and sets a
   44 px minimum hit target. A 128×64 diamond's hit region is a rotated rectangle whose corners
   belong to neighbouring tiles. On a 390 px-wide screen, tall dimetric shelves also occlude
   the shoppers behind them — and shopper legibility *is* the game's telemetry channel
   (`docs/design/gentle-surface.md`).

## Decision

The store renders in **orthogonal 3/4 top-down projection on a 32×32 px axis-aligned grid**,
in the visual idiom of 16-bit console management and RPG games.

- Tile: 32×32 px. Fixtures occupy whole tiles; tall fixtures extend upward on a 32×48 or
  32×64 sprite canvas with the anchor at **bottom-centre of the footprint tile**, unchanged
  in spirit from §9.1.
- Depth: **y-sort.** `depth = worldY * 1000 + layer * 10 + subOrder`. The `(x+y)` term of the
  dimetric formula is gone.
- Rotations: 2 per rotatable fixture (facing the aisle, facing away). Symmetric props: 1.
- `src/view/iso.ts` is deleted and replaced by `src/view/projection.ts`.

## Consequences

**Bought:**
- `TilemapGPULayer` renders the floor and walls at near-zero CPU cost, freeing frame budget
  for the 400 agents the sim already supports.
- Sprite count per fixture halves.
- Tap targets are axis-aligned rectangles; `screenToWorld` becomes two divisions.
- Nothing occludes an aisle, so shopper tells stay readable at 390×844.
- The projection is the native idiom of the 16-bit era the game is now targeting.

**Paid:**
- `PLAN.md` §9.1 is void and this ADR replaces it. `README.md` and `landing/index.html` both
  describe the game as "isometric" and must be reworded.
- The RollerCoaster Tycoon *projection* reference is dropped. The RollerCoaster Tycoon
  *legibility* reference — silhouette-first clarity, thought bubbles as the primary telemetry
  channel, per `docs/design/competitive-position.md` §4 — is retained in full, and gets
  easier without occlusion.
- Depth bugs move from "wrong sort key" to "wrong anchor". The anchor rule is therefore
  validated in CI against the asset manifest (ADR 0006).

**Not affected:** `src/sim/**`. The simulation has never known about projection — the grid is
integer tile coordinates and always was. This ADR touches `src/view/**` only, and no world
hash may change as a result. See ADR 0007.
