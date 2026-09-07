"""Floor and wall tiles (ADR 0006).

Floors are the largest sprite population in any frame -- four hundred of them in a 20x20
store -- so they must be quiet. Contrast here competes directly with the shoppers and the
stock tells, which are the two things the player actually needs to read. These tiles are
therefore near-flat, with variation carried by a single subtle speckle.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

import palette as pal


def _rgb(name: str) -> tuple[int, int, int, int]:
    return (*pal.PALETTE[name], 255)


def floor(size: int, variant: int) -> Image.Image:
    """A tile of store floor. `variant` shifts the speckle, never the base value."""
    image = Image.new("RGBA", (size, size), _rgb("grey-100"))
    draw = ImageDraw.Draw(image)

    # Grout on two edges only. Drawing all four doubles the line weight where tiles meet,
    # which reads as a heavy grid rather than as a floor.
    draw.line([0, 0, size - 1, 0], fill=_rgb("grey-200"))
    draw.line([0, 0, 0, size - 1], fill=_rgb("grey-200"))

    # A few fixed speckles per variant: deterministic, and quiet enough to tile without
    # producing a visible repeating pattern.
    speckles = [
        [(7, 11), (19, 6), (25, 22)],
        [(5, 24), (14, 15), (28, 9)],
        [(11, 4), (22, 18), (9, 27)],
    ][variant % 3]
    for x, y in speckles:
        image.putpixel((x % size, y % size), _rgb("grey-200"))

    return image


def entrance(size: int) -> Image.Image:
    """The doormat tile. The one floor tile allowed to be loud -- it is wayfinding."""
    image = floor(size, 0)
    draw = ImageDraw.Draw(image)
    draw.rectangle([3, 6, size - 4, size - 7], fill=_rgb("grey-500"), outline=_rgb("ink"))
    for y in range(9, size - 8, 3):
        draw.line([5, y, size - 6, y], fill=_rgb("grey-400"))
    return image


def wall(width: int, height: int, side: bool) -> Image.Image:
    """A wall segment, anchored at its bottom edge like any other fixture."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ink = _rgb("ink")

    draw.rectangle([0, 0, width - 1, height - 1], fill=_rgb("grey-200"), outline=ink)
    # A skirting band at the foot: it is what makes a wall read as vertical rather than as
    # a very tall floor tile.
    draw.rectangle([0, height - 6, width - 1, height - 1], fill=_rgb("grey-400"), outline=ink)

    if side:
        draw.line([width - 2, 1, width - 2, height - 7], fill=_rgb("grey-300"))
    else:
        draw.line([1, 2, width - 2, 2], fill=_rgb("grey-50"))
    return image


def spill(width: int, height: int) -> Image.Image:
    """A floor spill: the cleanliness tell (docs/design/gentle-surface.md §1)."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse([1, 2, width - 2, height - 2], fill=_rgb("blue-dark"), outline=_rgb("ink"))
    draw.ellipse([5, 4, width - 8, height - 5], fill=_rgb("blue-base"))
    # A highlight, so it reads as wet rather than as a hole in the floor.
    draw.line([7, 5, 11, 5], fill=_rgb("blue-hi"))
    return image
