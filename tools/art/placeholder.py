"""Placeholder art, so the game is playable before any real art exists (ADR 0006).

A placeholder is not a grey box. It is the declared size, carries the asset's layer colour,
is visibly hatched so nobody mistakes it for finished art, and is labelled when it is big
enough to hold letters. That combination is what lets `src/view` be developed, reviewed and
screenshotted against the manifest contract rather than against pixels that do not exist.
"""

from __future__ import annotations

from PIL import Image

import palette as pal
import tinyfont

# Layer -> fill colour name. Deliberately drawn from the same palette as real art so a
# placeholder screenshot still reads as one world.
LAYER_COLOURS = {
    "floor": "grey-200",
    "fixture": "grey-400",
    "agent": "blue-light",
    "overlay": "violet-light",
    "ui": "grey-300",
}


def _abbreviate(asset_id: str, max_chars: int) -> str:
    """`shelf_basic` -> `SHBA`. Stable, and readable at 3px tall."""
    if max_chars <= 0:
        return ""
    parts = [part for part in asset_id.split("_") if part]
    if len(parts) >= 2:
        per = max(1, max_chars // len(parts))
        out = "".join(part[:per] for part in parts)
    else:
        out = asset_id
    return out[:max_chars].upper()


def render(asset_id: str, width: int, height: int, layer: str, label: str | None = None) -> Image.Image:
    """One placeholder frame at exactly the declared size."""
    fill = (*pal.PALETTE[LAYER_COLOURS.get(layer, "grey-400")], 255)
    ink = (*pal.PALETTE["ink"], 255)

    image = Image.new("RGBA", (width, height), fill)
    px = image.load()

    # Hatch: diagonal stripes say "not real art" at any zoom, and survive downscaling in a
    # way that a text watermark does not.
    hatch = (*pal.PALETTE["grey-500"], 255)
    for y in range(height):
        for x in range(width):
            if (x + y) % 6 == 0:
                px[x, y] = hatch

    # Border, so adjacent placeholders remain distinguishable on the tile grid.
    for x in range(width):
        px[x, 0] = ink
        px[x, height - 1] = ink
    for y in range(height):
        px[0, y] = ink
        px[width - 1, y] = ink

    # Label, only when it genuinely fits. A clipped label is worse than none.
    text = (label or _abbreviate(asset_id, max(0, (width - 4) // tinyfont.ADVANCE)))
    if text and height >= tinyfont.HEIGHT + 4 and tinyfont.text_width(text) <= width - 4:
        tx = (width - tinyfont.text_width(text)) // 2
        ty = (height - tinyfont.HEIGHT) // 2
        # Knock out a contrasting plate behind the text so it reads over the hatch.
        plate = (*pal.PALETTE["grey-50"], 255)
        for y in range(ty - 1, ty + tinyfont.HEIGHT + 1):
            for x in range(tx - 1, tx + tinyfont.text_width(text) + 1):
                if 0 < x < width - 1 and 0 < y < height - 1:
                    px[x, y] = plate
        tinyfont.draw(px, text, tx, ty, ink, (width, height))

    return image
