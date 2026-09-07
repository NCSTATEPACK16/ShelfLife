# 6. Art as source code: text sprites, generated binaries

**Status:** Accepted
**Date:** 2026-08-26

## Context

`CLAUDE.md` and the project's pipeline research are unambiguous: **the AI must never create or
hand-edit binary assets.** Binaries are outputs; to change one, you change the text source or
the script that generates it.

That rule protects the build, and it also creates a problem. This project has one developer,
no art budget, no Aseprite license, and — by their own account — neither the access nor the
training to draw sprites by hand. If every sprite must be authored in a binary editor by a
human, the game has no art, which is precisely the state it has been in for 106 commits.

The rule and the constraint resolve together once you notice how small 16-bit sprites are. A
16×24 shopper is 384 pixels. That is not a binary blob; that is a paragraph of text.

## Decision

**Sprites are authored as text and compiled to PNG.** The source of truth for a hand-authored
sprite is a grid of single-character palette indices in a Python module:

```python
SHOPPER_BASE = """
.....kkkkk.....
....khhhhhk....
...khssssshk...
...khsWsWsshk..
"""
```

`.` is transparent; every other character maps to a name in `tools/art/palette.py`. The build
renders these to PNG. **Git diffs them. Review reads them. An agent can author them without
ever touching a binary.**

Four production routes feed one manifest, and the renderer cannot tell them apart:

| Route | Source of truth | Used for |
|---|---|---|
| Procedural | Python generator + parameters | Tiles, shelf bodies, UI 9-slices, icons, particles |
| Text sprite | Character grid in a `.py` module | Characters, bubbles, hero sprites |
| Blender | `.blend` + a render config JSON, rendered by a `bpy` CLI script | Fixtures needing consistent form across rotations and animation frames |
| Generated image | The prompt, plus a deterministic quantize pass | Hero art only — title screen, boss portraits, signage |

Every route ends in `tools/art/quantize.py`, which locks output to the palette, snaps to the
pixel grid, trims, and emits an anchor. **The palette is derived from `content/design/tokens.json`**,
so the store world and the UI keep sharing one source of colour truth and `tools/check-tokens.mjs`
continues to work untouched.

`content/asset-manifest.json` declares every visual — id, size, anchor, atlas, states — **before
it exists**. Missing art renders as a labelled placeholder box at the exact declared size, so
the game is playable and shippable at every commit and renderer work never blocks on art work.

## Consequences

**Bought:**
- An AI agent can produce game art within the never-edit-binaries rule, because the art is text.
- Every sprite is diff-able, reviewable, and regenerable from source.
- The palette-swap multiplier: one 16×24 shopper base × N palettes = N distinct shoppers, baked
  at build time. The seven segments in `content/balance/segments.json5` get visual identity for
  roughly the cost of one character. This is the authentic 16-bit technique and the single
  largest cost saving in the project.
- No Aseprite license, no proprietary tool in CI, no Git LFS.

**Paid:**
- Text sprites are slower to author per-pixel than a mouse in a paint program. Mitigated by
  keeping them small and by generating everything that can be generated.
- The generator is code, and code has bugs. `tools/validate/` therefore checks dimensions,
  anchors, filename case, atlas schema, and orphans in CI.
- Blender and image generation are **local-only** steps. Their outputs are committed as PNGs;
  Netlify runs `vite build` and nothing else.

**Licensing:** no asset may be ripped, traced, or derived from a commercial game. Style
reference only. The LPC spritesheet generator stays unused — its CC-BY-SA-3.0/GPL share-alike
terms would propagate to every derived sprite, as `ATTRIBUTION.md` already flags. Every
third-party asset is recorded in `ATTRIBUTION.md` on the commit that adds it, not later.
