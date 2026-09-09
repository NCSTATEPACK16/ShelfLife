"""Overlay art: the bubble chrome and the fly particle (ADR 0006).

These are the two pieces of the gentle surface that are shapes rather than drawings, so
they are generated. Everything that is a *drawing* — the twelve tell icons, the abandoned
cart — is authored as text in `tools/art/sprites/bubbles.py` instead.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

import palette as pal


def _rgb(name: str) -> tuple[int, int, int, int]:
    return (*pal.PALETTE[name], 255)


# How many rows at the foot of the frame the tail occupies. The icon is centred in what
# is left, and `src/view/gentle-surface-draw-plan.ts` uses the same number to place it.
TAIL_HEIGHT = 5


def bubble_frame(width: int, height: int) -> Image.Image:
    """The speech-bubble chrome every tell icon sits inside.

    Bottom-anchored (manifest anchor `[0.5, 1]`): the tail is the point that touches the
    shopper's head, so anchoring there means the renderer positions the bubble by the one
    pixel that has to be right.
    """
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ink = _rgb("ink")
    body_bottom = height - TAIL_HEIGHT

    # Rounded rather than square: a hard rectangle over a store full of hard rectangles
    # reads as another fixture instead of as somebody thinking.
    draw.rounded_rectangle(
        [0, 0, width - 1, body_bottom],
        radius=4,
        fill=_rgb("grey-50"),
        outline=ink,
    )
    # A one-pixel top highlight, the same trick the shelf planks use, so the bubble sits
    # in the same light as the world underneath it.
    draw.line([3, 1, width - 4, 1], fill=(255, 255, 255, 255))

    centre = width // 2
    draw.polygon(
        [(centre - 4, body_bottom - 2), (centre + 3, body_bottom - 2), (centre, height - 1)],
        fill=_rgb("grey-50"),
        outline=ink,
    )
    # Erase the body's bottom edge where the tail meets it, so the two shapes read as one
    # bubble rather than as a triangle stuck under a box.
    draw.line([centre - 3, body_bottom, centre + 2, body_bottom], fill=_rgb("grey-50"))
    draw.line([centre - 3, body_bottom - 1, centre + 2, body_bottom - 1], fill=_rgb("grey-50"))
    return image


# Three flies per frame, orbiting. Fixed positions rather than a random walk: the art build
# is idempotent by contract (ADR 0006), and `assets/src` is committed.
_FLY_ORBIT = [
    ((0, 2), (4, 5), (6, 1)),
    ((3, 1), (1, 6), (6, 4)),
    ((5, 3), (2, 0), (0, 5)),
]


def flies(width: int, height: int, frame: int) -> Image.Image:
    """The spoiled-stock particle.

    `gentle-surface.md` §1: "the fly particle is visible from zoomed-out; the bubble is
    not. Both matter." Which is why this is three pixels of ink and nothing else — at 1x
    across a whole store, motion is the only thing that reads, and anything more detailed
    just becomes a smudge on the shelf.
    """
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    ink = _rgb("ink")
    for x, y in _FLY_ORBIT[frame % len(_FLY_ORBIT)]:
        if not (0 <= x < width and 0 <= y < height):
            continue
        image.putpixel((x, y), ink)
        # A body two pixels tall and a one-pixel wing smear beside it. Any less and the
        # fly disappears against a shelf at 1x; any more and it stops reading as an insect.
        if y + 1 < height:
            image.putpixel((x, y + 1), ink)
        if x + 1 < width:
            image.putpixel((x + 1, y), _rgb("grey-600"))
    return image
