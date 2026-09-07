# 5. Pixel renderer strategy: WebGL, a 32 px logical tile, and integer zoom

**Status:** Accepted
**Date:** 2026-08-26

## Context

ADR 0004 moves the store to a 32×32 orthogonal grid in a 16-bit idiom. That raises three
questions the renderer must answer before any art exists.

**Renderer mode.** `src/view/build-mode.ts` currently forces `Phaser.CANVAS`, because Phaser
demands an explicit `renderType` when adopting a caller-supplied canvas and CANVAS was the
safe choice for drawing rectangles. `TilemapGPULayer` is WebGL-only, and pixel art needs
`NEAREST` texture filtering, which is a renderer-level setting.

**Logical resolution.** The obvious "authentic" choice is a fixed 256×224 SNES framebuffer
scaled up. On a 390×844 CSS-pixel phone in portrait, 256×224 scales by 1.52× to fit width —
a non-integer factor that destroys the pixel grid, which is the one thing pixel art cannot
survive. Letterboxing to 1× wastes two thirds of the screen.

**jsdom.** `docs/handoff.md` records that importing Phaser under jsdom crashes the test run,
so Phaser is dynamically imported only after a `getContext` probe succeeds. `tests/smoke/boot.test.ts`
asserts graceful degradation when the probe returns `null`. Switching to WebGL must not break this.

## Decision

**1. Phaser runs in `Phaser.WEBGL`** with `pixelArt: true` (which sets `antialias: false` and
`roundPixels: true`) and `powerPreference: 'low-power'`. The existing dynamic-import guard is
kept, with the probe extended to request a `webgl` context and **fall back to `Phaser.CANVAS`**
when WebGL is unavailable rather than failing. `TilemapGPULayer` is used only on the WebGL path;
the CANVAS fallback draws the floor with ordinary sprites.

**2. The logical unit is a 32 px tile, not a fixed framebuffer.** The canvas fills its container
at device resolution; the camera zoom is constrained to **integer steps** (1×, 2×, 3×, 4×) chosen
from viewport width, and camera scroll is snapped to whole pixels at the current zoom. Art is
authored at 1× and only ever displayed at integer multiples.

**3. The pure draw-plan pattern is preserved.** `src/view/*-draw-plan.ts` modules remain free of
any Phaser import and are unit-tested in a `node` environment. They now emit sprite plans —
`{ key, frame, x, y, depth, flipX }` — instead of rectangle lists. `BuildScene.ts` stays the only
file that touches Phaser objects.

## Consequences

**Bought:**
- Crisp pixels at every supported viewport, because every scale factor is an integer.
- `TilemapGPULayer` for the floor; a pooled, y-sorted sprite list for everything else.
- The most valuable property of the current `src/view` — that its logic is testable without a
  renderer — survives the rewrite unchanged.
- Devices without WebGL still boot.

**Paid:**
- A phone shows a different number of tiles than a desktop. This is a design constraint on the
  store size and the camera, not a bug, and it is why `CLAUDE.md` requires the compact layout
  to be designed first.
- Zoom is stepped, not continuous. Pinch snaps to the nearest integer step on release.
- Two floor-rendering paths (GPU layer, sprite fallback) must stay visually identical. The
  fallback is exercised by the existing smoke test.

**Rejected: a fixed 256×224 framebuffer.** Authentic, and wrong here. It forces non-integer
scaling on the primary target device, and `CLAUDE.md` makes the phone the primary target. The
16-bit read comes from palette discipline, sprite density, and animation cadence — not from
emulating a 1990 framebuffer. A CRT/scanline post-effect (ADR-free, phase S4) supplies the
nostalgia the framebuffer would have.
