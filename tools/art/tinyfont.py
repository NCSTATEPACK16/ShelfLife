"""A 3x5 pixel font, just large enough to label a placeholder.

Not the game's font -- that is a real bitmap face chosen in phase S4. This exists so a
32x32 placeholder can say `SHLF` instead of being an anonymous coloured square, which is
the difference between a useful placeholder and a confusing one.
"""

from __future__ import annotations

GLYPHS: dict[str, tuple[str, ...]] = {
    "A": ("010", "101", "111", "101", "101"),
    "B": ("110", "101", "110", "101", "110"),
    "C": ("011", "100", "100", "100", "011"),
    "D": ("110", "101", "101", "101", "110"),
    "E": ("111", "100", "110", "100", "111"),
    "F": ("111", "100", "110", "100", "100"),
    "G": ("011", "100", "101", "101", "011"),
    "H": ("101", "101", "111", "101", "101"),
    "I": ("111", "010", "010", "010", "111"),
    "J": ("001", "001", "001", "101", "010"),
    "K": ("101", "101", "110", "101", "101"),
    "L": ("100", "100", "100", "100", "111"),
    "M": ("101", "111", "111", "101", "101"),
    "N": ("101", "111", "111", "111", "101"),
    "O": ("010", "101", "101", "101", "010"),
    "P": ("110", "101", "110", "100", "100"),
    "Q": ("010", "101", "101", "111", "011"),
    "R": ("110", "101", "110", "101", "101"),
    "S": ("011", "100", "010", "001", "110"),
    "T": ("111", "010", "010", "010", "010"),
    "U": ("101", "101", "101", "101", "011"),
    "V": ("101", "101", "101", "010", "010"),
    "W": ("101", "101", "111", "111", "101"),
    "X": ("101", "101", "010", "101", "101"),
    "Y": ("101", "101", "010", "010", "010"),
    "Z": ("111", "001", "010", "100", "111"),
    "0": ("111", "101", "101", "101", "111"),
    "1": ("010", "110", "010", "010", "111"),
    "2": ("110", "001", "010", "100", "111"),
    "3": ("110", "001", "010", "001", "110"),
    "4": ("101", "101", "111", "001", "001"),
    "5": ("111", "100", "110", "001", "110"),
    "6": ("011", "100", "110", "101", "010"),
    "7": ("111", "001", "010", "010", "010"),
    "8": ("010", "101", "010", "101", "010"),
    "9": ("010", "101", "011", "001", "110"),
    "?": ("110", "001", "010", "000", "010"),
    " ": ("000", "000", "000", "000", "000"),
}

WIDTH = 3
HEIGHT = 5
ADVANCE = WIDTH + 1


def text_width(text: str) -> int:
    return max(0, len(text) * ADVANCE - 1)


def draw(pixels, text: str, x: int, y: int, colour, bounds: tuple[int, int]) -> None:
    """Blit `text` into a Pillow PixelAccess at (x, y), clipped to `bounds`."""
    max_x, max_y = bounds
    for index, char in enumerate(text.upper()):
        glyph = GLYPHS.get(char, GLYPHS["?"])
        origin_x = x + index * ADVANCE
        for row, bits in enumerate(glyph):
            for col, bit in enumerate(bits):
                if bit != "1":
                    continue
                px, py = origin_x + col, y + row
                if 0 <= px < max_x and 0 <= py < max_y:
                    pixels[px, py] = colour
