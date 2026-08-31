"""Real art generators, keyed by asset id (ADR 0006).

`tools/art/build.py` consults this table: an asset listed here gets generated art, and an
asset absent from it gets a labelled placeholder at exactly the same declared size. That is
the whole placeholder-first mechanism -- adding art is adding an entry here, and nothing
downstream changes.
"""

from __future__ import annotations

from PIL import Image

import manifest as manifest_mod
import sprite
from sprites import bubbles, characters

from . import fixtures, overlays, tiles

# The four rendered facings, in the order `src/view/shopper-draw-plan.ts` indexes them.
FACINGS = ["down", "left", "right", "up"]


def _character(asset, key, man, overrides: dict[str, str] | None = None) -> Image.Image:
    selector = manifest_mod.parse_key(asset, key)
    facing = FACINGS[int(selector["rotation"]) % len(FACINGS)]
    source_facing = "left" if facing == "right" else facing
    state = str(selector["state"])
    frame = int(selector["frame"])

    if state in characters.REACTION_POSES:
        # The gentle-surface reaction poses (phase S3). Only `shopper` declares them;
        # `staff` has no tells, so it never reaches this branch.
        grid: str | list[str] = characters.pose_frame(state, source_facing, frame)
    else:
        stand, step_a, step_b = characters.POSES[source_facing]
        grid = (step_a if frame % 2 == 0 else step_b) if state == "walk" else stand

    parsed = sprite.parse(grid) if isinstance(grid, str) else grid
    rows = sprite.mirror(parsed) if facing == "right" else parsed

    palette_overrides = dict(overrides or {})
    palette_name = selector["palette"]
    if palette_name is not None:
        palette_overrides.update(man.palettes.get(str(palette_name), {}))

    return sprite.render(rows, size=asset.size, overrides=palette_overrides, anchor="bottom")


def _shopper(asset, key, man) -> Image.Image:
    return _character(asset, key, man)


def _staff(asset, key, man) -> Image.Image:
    return _character(asset, key, man, characters.STAFF_OVERRIDES)


def _shelf(rows: int):
    def generate(asset, key, man) -> Image.Image:
        selector = manifest_mod.parse_key(asset, key)
        return fixtures.shelf(
            *asset.size,
            state=str(selector["state"]),
            rows=rows,
            flipped=int(selector["rotation"]) % 2 == 1,
        )

    return generate


def _counter(self_service: bool):
    def generate(asset, key, man) -> Image.Image:
        selector = manifest_mod.parse_key(asset, key)
        return fixtures.counter(
            *asset.size,
            state=str(selector["state"]),
            flipped=int(selector["rotation"]) % 2 == 1,
            self_service=self_service,
        )

    return generate


def _corral(asset, key, man) -> Image.Image:
    selector = manifest_mod.parse_key(asset, key)
    return fixtures.corral(*asset.size, state=str(selector["state"]))


def _floor(asset, key, man) -> Image.Image:
    selector = manifest_mod.parse_key(asset, key)
    return tiles.floor(asset.size[0], int(selector["variant"]))


def _entrance(asset, key, man) -> Image.Image:
    return tiles.entrance(asset.size[0])


def _wall(side: bool):
    def generate(asset, key, man) -> Image.Image:
        return tiles.wall(*asset.size, side=side)

    return generate


def _spill(asset, key, man) -> Image.Image:
    return tiles.spill(*asset.size)


def _bubble_frame(asset, key, man) -> Image.Image:
    return overlays.bubble_frame(*asset.size)


def _bubble_icon(asset, key, man) -> Image.Image:
    # `bubble_greenStinkCloud` -> `greenStinkCloud`, the id `content/design/gentle-surface.json5`
    # uses for the tell. One naming rule, checked by `tools/validate/assets.mjs`.
    return sprite.render(bubbles.ICONS[asset.id[len("bubble_") :]], size=asset.size, anchor="centre")


def _flies(asset, key, man) -> Image.Image:
    selector = manifest_mod.parse_key(asset, key)
    return overlays.flies(*asset.size, frame=int(selector["frame"]))


def _cart_abandoned(asset, key, man) -> Image.Image:
    return sprite.render(bubbles.CART_ABANDONED, size=asset.size, anchor="bottom")


GENERATORS = {
    "floor_tile": _floor,
    "floor_entrance": _entrance,
    "wall_back": _wall(side=False),
    "wall_side": _wall(side=True),
    "shelf_basic": _shelf(rows=3),
    "shelf_endcap": _shelf(rows=2),
    "register": _counter(self_service=False),
    "self_checkout": _counter(self_service=True),
    "cart_corral": _corral,
    "spill_decal": _spill,
    "shopper": _shopper,
    "staff": _staff,
    "cart_abandoned": _cart_abandoned,
    "bubble_frame": _bubble_frame,
    "particle_flies": _flies,
    **{f"bubble_{name}": _bubble_icon for name in bubbles.ICONS},
}
