"""The locked palette (ADR 0006).

Every pixel the game draws comes from here, and everything here is derived from
`content/design/tokens.json`. That file stays the single source of colour truth for the
store world, the UI, and the landing page -- so `tools/check-tokens.mjs` keeps working
untouched, and a token change repaints the game.

Names, not hex codes, are what sprite sources reference. A sprite says `k` for
`ink-darkest`; it never says `#141311`. That indirection is what makes the palette-swap
multiplier possible: re-map the names, re-render the same character grid, get a different
character (ADR 0006).

SNES hardware allowed 15 colours plus transparency per palette. We honour the spirit --
small, deliberate ramps -- without emulating the constraint, which ADR 0005 rejected.
"""

from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
TOKENS_PATH = REPO_ROOT / "content" / "design" / "tokens.json"

# Single-character keys used in text sprite sources. '.' is always transparent.
TRANSPARENT = "."


def _load_tokens() -> dict:
    with TOKENS_PATH.open(encoding="utf-8") as handle:
        return json.load(handle)


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16))


def _shade(rgb: tuple[int, int, int], factor: float) -> tuple[int, int, int]:
    """Scale toward black (factor < 1) or white (factor > 1), clamped.

    Used only to extend a token ramp where pixel art needs a step the design system does
    not define -- highlights and outlines. Never used to invent a hue.
    """
    if factor <= 1.0:
        return tuple(max(0, min(255, round(channel * factor))) for channel in rgb)
    t = factor - 1.0
    return tuple(max(0, min(255, round(channel + (255 - channel) * t))) for channel in rgb)


def build_palette() -> dict[str, tuple[int, int, int]]:
    """Name -> RGB. The whole game's colour vocabulary."""
    tokens = _load_tokens()
    colour = tokens["color"]
    palette: dict[str, tuple[int, int, int]] = {}

    # The warm-grey ramp: the store world's structure, and all UI chrome (PLAN.md §9.3).
    for step, value in colour["fixture"].items():
        palette[f"grey-{step}"] = _hex_to_rgb(value)

    # Saturated product families: goods, data, state. Never chrome.
    for family, shades in colour["product"].items():
        for shade_name, value in shades.items():
            if shade_name.startswith("$"):
                continue
            palette[f"{family}-{shade_name}"] = _hex_to_rgb(value)
        # Pixel art needs a highlight above `light` to read as a lit surface.
        palette[f"{family}-hi"] = _shade(_hex_to_rgb(shades["light"]), 1.35)

    # Semantic state, kept distinct from the accent on purpose.
    for name, value in colour["semantic"].items():
        if name.startswith("$"):
            continue
        palette[f"state-{name}"] = _hex_to_rgb(value)

    # Skin and hair, the one family with no design-token equivalent because the UI has no
    # use for it. Derived from the amber and grey ramps so shoppers sit in the same world
    # as the shelves rather than looking pasted on.
    amber = _hex_to_rgb(colour["product"]["amber"]["light"])
    palette["skin-hi"] = _shade(amber, 1.55)
    palette["skin"] = _shade(amber, 1.30)
    palette["skin-sh"] = _shade(amber, 0.92)
    palette["hair-hi"] = _shade(_hex_to_rgb(colour["product"]["amber"]["dark"]), 1.10)
    palette["hair"] = _hex_to_rgb(colour["product"]["amber"]["dark"])
    palette["hair-sh"] = _shade(_hex_to_rgb(colour["product"]["amber"]["dark"]), 0.55)

    # The universal outline. Every sprite is outlined in this, which is what welds a set of
    # separately-authored sprites into one visual world.
    palette["ink"] = _hex_to_rgb(colour["fixture"]["900"])
    palette["white"] = (255, 255, 255)

    return palette


PALETTE = build_palette()

# Character -> palette name, for text sprite sources (ADR 0006).
# Keep this table small and mnemonic; a sprite that needs a colour not listed here should
# say so by name in a per-sprite override rather than growing this table indefinitely.
CHARS: dict[str, str] = {
    ".": "__transparent__",
    "K": "ink",
    "W": "white",
    # greys, light to dark
    "1": "grey-50",
    "2": "grey-100",
    "3": "grey-200",
    "4": "grey-300",
    "5": "grey-400",
    "6": "grey-500",
    "7": "grey-600",
    "8": "grey-700",
    "9": "grey-800",
    "0": "grey-900",
    # skin and hair
    "s": "skin",
    "S": "skin-hi",
    "z": "skin-sh",
    "h": "hair",
    "H": "hair-hi",
    "j": "hair-sh",
    # product hues: light / base / dark
    "r": "red-base",
    "R": "red-light",
    "e": "red-dark",
    "g": "green-base",
    "G": "green-light",
    "f": "green-dark",
    "a": "amber-base",
    "A": "amber-light",
    "b": "amber-dark",
    "u": "blue-base",
    "U": "blue-light",
    "v": "blue-dark",
    "p": "violet-base",
    "P": "violet-light",
    "q": "violet-dark",
}


def resolve(char: str, overrides: dict[str, str] | None = None) -> tuple[int, int, int, int]:
    """A sprite character -> RGBA. Unknown characters fail loudly, never silently."""
    if char == TRANSPARENT:
        return (0, 0, 0, 0)
    name = (overrides or {}).get(char) or CHARS.get(char)
    if name is None:
        raise KeyError(
            f"Unknown sprite character {char!r}. Add it to CHARS in tools/art/palette.py "
            f"or pass a per-sprite override."
        )
    if name == "__transparent__":
        return (0, 0, 0, 0)
    if name not in PALETTE:
        raise KeyError(f"Character {char!r} maps to unknown palette name {name!r}.")
    return (*PALETTE[name], 255)


if __name__ == "__main__":
    print(f"{len(PALETTE)} colours from {TOKENS_PATH.relative_to(REPO_ROOT)}")
    for name, rgb in PALETTE.items():
        print(f"  {name:<16} #{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}")
