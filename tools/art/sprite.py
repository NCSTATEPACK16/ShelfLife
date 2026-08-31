"""Rendering text sprite sources to images (ADR 0006).

A sprite source is a grid of single-character palette indices. `.` is transparent, every
other character maps through `palette.CHARS`. Unknown characters raise rather than render
silently wrong -- a typo in a sprite should fail the build, not ship a hole.

House style (chosen in phase S2): **chunky outlined**. Every form carries a one-pixel `K`
outline. That outline is what welds separately-authored sprites into a single world, and
it is what keeps a 16x24 shopper readable at 1x on a 390px phone.
"""

from __future__ import annotations

from PIL import Image

import palette as pal


def parse(grid: str) -> list[str]:
    """Text block to padded rows. Leading/trailing blank lines are ignored."""
    rows = [row for row in grid.strip("\n").split("\n")]
    width = max(len(row) for row in rows)
    return [row.ljust(width, ".") for row in rows]


def render(
    grid: str | list[str],
    size: tuple[int, int] | None = None,
    overrides: dict[str, str] | None = None,
    anchor: str = "bottom",
) -> Image.Image:
    """Render a sprite grid, optionally padded into a larger canvas.

    Padding matters: the manifest declares a fixed frame size, and a sprite that is
    naturally shorter must sit at the bottom of that box so its anchor still lands on the
    footprint's bottom edge (ADR 0004).
    """
    rows = parse(grid) if isinstance(grid, str) else grid
    height = len(rows)
    width = len(rows[0])

    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    px = image.load()
    for y, row in enumerate(rows):
        for x, char in enumerate(row):
            if char == " ":
                continue
            px[x, y] = pal.resolve(char, overrides)

    if size is None or (width, height) == size:
        return image

    target_w, target_h = size
    if width > target_w or height > target_h:
        raise ValueError(f"sprite is {width}x{height}, larger than its declared {target_w}x{target_h}")

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    offset_x = (target_w - width) // 2
    offset_y = target_h - height if anchor == "bottom" else (target_h - height) // 2
    canvas.paste(image, (offset_x, offset_y), image)
    return canvas


def mirror(grid: str) -> list[str]:
    """Horizontally flip a sprite grid.

    Used to get the right-facing sprite from the left-facing one, which is the oldest trick
    in the medium and halves the character art.
    """
    return [row[::-1] for row in parse(grid)]


def outline(image: Image.Image, colour_name: str = "ink") -> Image.Image:
    """Add a one-pixel outline around every opaque region.

    Applied to procedurally-generated art so it matches the house style without every
    generator having to draw its own border.
    """
    width, height = image.size
    src = image.load()
    out = image.copy()
    dst = out.load()
    ink = (*pal.PALETTE[colour_name], 255)

    for y in range(height):
        for x in range(width):
            if src[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and src[nx, ny][3] != 0:
                    dst[x, y] = ink
                    break
    return out
