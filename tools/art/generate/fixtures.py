"""Procedurally-drawn store fixtures (ADR 0006, house style A: chunky outlined).

Shelves are generated rather than hand-authored because they are the one thing in the game
that must exist in three stock states x two rotations x several widths. Drawing that by
hand is twenty sprites that must stay consistent with each other; drawing it from
parameters is one function that cannot drift.

The stock state is drawn into the sprite itself, never overlaid: `docs/design/gentle-surface.md`
calls the empty facing "the single most important tell in the game", and a tell that needs a
badge on top of it is not a tell.
"""

from __future__ import annotations

from PIL import Image, ImageDraw

import palette as pal

# Goods on a shelf cycle through the product hues so a full shelf reads as *stocked*
# rather than as one flat block of colour.
GOODS_CYCLE = ["red", "green", "blue", "amber", "violet"]

# How much of each shelf row is filled, per state.
FILL = {"full": 1.0, "half": 0.5, "empty": 0.0}


def _rgb(name: str) -> tuple[int, int, int, int]:
    return (*pal.PALETTE[name], 255)


def shelf(width: int, height: int, state: str, rows: int, flipped: bool) -> Image.Image:
    """A shelving unit seen in 3/4 from the front.

    `rows` product shelves stacked up the sprite. The lowest row sits just above the base,
    which is the part that meets the floor at the anchor.
    """
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    ink = _rgb("ink")
    body = _rgb("grey-500")
    body_lit = _rgb("grey-400")
    recess = _rgb("grey-600")
    plank = _rgb("grey-200")
    base = _rgb("grey-700")

    # Carcass, outlined all the way round (house style).
    draw.rectangle([0, 0, width - 1, height - 1], fill=body, outline=ink)
    # A recessed back panel. Without it an empty shelf is a dark slab that reads as a hole
    # in the floor rather than as shelving with nothing on it -- and "empty facing" is the
    # most important tell in the game, so it has to read as *empty*, not as *absent*.
    draw.rectangle([2, 2, width - 3, height - 5], fill=recess)
    # A lit edge on the side the light comes from; flipping the fixture flips the light.
    lit_x = width - 2 if flipped else 1
    draw.line([lit_x, 1, lit_x, height - 2], fill=body_lit)

    base_h = 3
    draw.rectangle([0, height - base_h, width - 1, height - 1], fill=base, outline=ink)

    usable_top = 2
    usable_bottom = height - base_h - 1
    row_h = max(4, (usable_bottom - usable_top) // rows)
    fill_ratio = FILL[state]

    for row in range(rows):
        top = usable_top + row * row_h
        bottom = min(top + row_h - 1, usable_bottom)
        if bottom - top < 3:
            break

        # The plank itself is always visible and bright -- an empty shelf is empty, not
        # absent. These horizontal lines are the whole silhouette of an out-of-stock unit.
        draw.line([1, bottom, width - 2, bottom], fill=plank)
        draw.line([1, bottom + 1, width - 2, bottom + 1], fill=_rgb("grey-600"))

        if fill_ratio <= 0:
            continue

        # Goods sit ON the plank, inset from the carcass so the outline reads.
        slot_w = 5
        inset = 2
        span = width - inset * 2
        slots = max(1, span // slot_w)
        stocked = max(1, round(slots * fill_ratio)) if fill_ratio > 0 else 0

        for slot in range(slots):
            if slot >= stocked:
                break  # the gap: this is the out-of-stock tell
            hue = GOODS_CYCLE[(row + slot) % len(GOODS_CYCLE)]
            x0 = inset + slot * slot_w
            x1 = x0 + slot_w - 2
            y1 = bottom - 1
            y0 = max(top + 1, y1 - 4)
            draw.rectangle([x0, y0, x1, y1], fill=_rgb(f"{hue}-base"), outline=ink)
            draw.line([x0 + 1, y0 + 1, x1 - 1, y0 + 1], fill=_rgb(f"{hue}-light"))

    return image


def counter(width: int, height: int, state: str, flipped: bool, self_service: bool) -> Image.Image:
    """A checkout. `self_service` gives it a screen and no cashier station."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    ink = _rgb("ink")
    top_h = height // 2

    # Counter body.
    draw.rectangle([0, top_h, width - 1, height - 1], fill=_rgb("grey-500"), outline=ink)
    # Belt / work surface, lighter so the counter reads as a horizontal plane.
    draw.rectangle([1, top_h - 3, width - 2, top_h + 1], fill=_rgb("grey-300"), outline=ink)

    if self_service:
        # A screen on a post: unmistakably not a staffed lane, even at 1x.
        post_x = width // 2 + (4 if flipped else -4)
        draw.rectangle([post_x - 1, 6, post_x + 1, top_h - 3], fill=_rgb("grey-500"), outline=ink)
        screen = _rgb("blue-light") if state == "busy" else _rgb("blue-dark")
        draw.rectangle([post_x - 6, 1, post_x + 6, 9], fill=screen, outline=ink)
        draw.line([post_x - 4, 3, post_x + 4, 3], fill=_rgb("blue-hi"))
    else:
        # Staffed lane: a register block with a lane light sitting on top of it.
        #
        # The light belongs ON the register, not floating in the corner of the frame -- a
        # detached three-pixel dot reads as a rendering artefact, not as a status. Sitting
        # on the machine it reads the way a real lane light does, and it is the fastest way
        # to see an open lane from across a zoomed-out store.
        reg_x = 3 if not flipped else width - 14
        reg_top = 8
        draw.rectangle([reg_x, reg_top, reg_x + 10, top_h - 2], fill=_rgb("grey-400"), outline=ink)
        draw.rectangle([reg_x + 2, reg_top + 2, reg_x + 8, reg_top + 5], fill=_rgb("grey-200"), outline=ink)

        lamp = _rgb("green-light") if state == "busy" else _rgb("grey-500")
        glow = _rgb("green-hi") if state == "busy" else _rgb("grey-400")
        lamp_x = reg_x + 3
        draw.line([lamp_x + 2, reg_top - 3, lamp_x + 2, reg_top - 1], fill=ink)
        draw.rectangle([lamp_x, 1, lamp_x + 4, reg_top - 4], fill=lamp, outline=ink)
        draw.line([lamp_x + 1, 2, lamp_x + 3, 2], fill=glow)

    return image


def corral(width: int, height: int, state: str) -> Image.Image:
    """A cart corral. `empty` is the rails alone; `full` has carts nested in it."""
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ink = _rgb("ink")

    # Rails.
    draw.rectangle([1, height - 12, width - 2, height - 2], outline=ink, fill=None)
    draw.line([1, height - 12, 1, height - 2], fill=_rgb("grey-400"))
    draw.line([width - 2, height - 12, width - 2, height - 2], fill=_rgb("grey-400"))

    if state == "full":
        for i in range(3):
            x = 3 + i * 8
            draw.rectangle([x, height - 18 + i, x + 7, height - 6 + i], fill=_rgb("grey-300"), outline=ink)
            draw.line([x + 1, height - 17 + i, x + 6, height - 17 + i], fill=_rgb("grey-100"))
    return image
