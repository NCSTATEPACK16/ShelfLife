# 8. Projection scope: world tiles vs. hero/frame art

**Status:** Accepted
**Date:** 2026-09-08
**Related:** ADR 0004 (orthogonal projection), ADR 0006 (art as source code)

## Context

ADR 0004 locks the store world to orthogonal 3/4 top-down on a 32×32 axis-aligned grid, chosen
for `TilemapGPULayer` compatibility, halved rotation cost, and phone tap targets — all reasons
specific to *gameplay tiles the player taps and the sim positions on a grid*.

The title screen, chapter intro/outro cards, boss-intro portraits, and marketing key art
(ADR 0006's "generated image" route, reserved for hero art) are none of those things. They are
not tapped, not tile-anchored, and not simulated. Reading ADR 0004 as governing them too would
force a title screen built from 32×32 axis-aligned pieces — flattening art that should be free to
compose a scene, a portrait bust, or a wordmark however best serves that single image. Nothing in
ADR 0004 actually requires this, but nothing said it didn't either, and `docs/handoff.md` flagged
the gap as never resolved. This ADR closes it before any title-screen work lands.

## Decision

ADR 0004's projection and grid rules apply to **world art only**: fixtures, floor/wall tiles,
shoppers, staff, and anything else placed on the store's 32×32 grid and rendered through
`TilemapGPULayer` or the y-sorted sprite list.

**Hero and frame art — title screen, chapter cards, boss-intro portraits, key art — is exempt
from the grid and rotation rules**, subject to three constraints that still apply everywhere:

1. **Palette-locked.** Every pixel quantizes to `content/design/tokens.json`'s locked ramp via
   `tools/art/quantize.py` (ADR 0006). No new hues, no gradients that survive quantization.
2. **Outlined.** The shared 1px dark-ink outline convention (`docs/art-direction/gemini-concept-
   prompts.md`, Idiom block) still welds this art into the same visual world as the tiles.
3. **No isometric diamonds.** The store itself must never appear in this art rendered at a
   different projection than the game actually uses — a title-screen illustration of the store
   floor still respects orthogonal 3/4, since showing it any other way would misrepresent the
   game. Portraits, logotypes, and abstract key-art compositions have no store geometry to get
   wrong and are unconstrained by this rule.

Pixel density is not fixed at 1x for this art. `docs/art-direction/gemini-concept-prompts.md`
Prompt 10 already asks for a stated `heroArtPixelDensity` in its HANDOFF block for exactly this
reason — hero art may be authored denser than a 32px world tile, then quantized down consistently
for its actual display size.

## Consequences

**Bought:**
- Title/boot, chapter cards, and boss portraits can compose freely — a bust portrait, a full-
  bleed illustrated title scene, a wordmark — without contorting to a tile grid that has no
  bearing on how those screens are tapped or simulated.
- ADR 0004's rationale (tap targets, tilemap GPU cost, occlusion) stays scoped to what it was
  actually justified by: gameplay tiles.
- Prompt 10's Figma/Gemini output can be taken close to as-designed rather than re-gridded.

**Paid:**
- Two art regimes now exist in one game (grid-locked world art, freer hero art), which a future
  contributor could conflate. The palette/outline constraints above are the seam that keeps them
  reading as one world; any new hero-art surface must restate them.
- `content/asset-manifest.json` entries for hero art should not carry a `footprint`/`rotations`
  field the way world fixtures do — those fields don't apply and their presence would imply a
  grid relationship that doesn't exist. (No manifest schema change needed yet: hero-art entries
  simply omit those fields, matching the existing `logotype`/`title` style declarations.)

**Not affected:** `src/sim/**` and the 32×32 world grid itself. This ADR only widens what's
*allowed outside* the grid — it does not touch ADR 0004's rules for anything inside it.
