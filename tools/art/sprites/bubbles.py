"""Thought-bubble icons and the abandoned cart, authored as text (ADR 0006).

`docs/design/gentle-surface.md` §12.1 calls thought bubbles the game's primary telemetry:
the player learns the satisfaction model by watching what shoppers think, never by reading
a formula. Every icon here is therefore drawn to be read at 1x on a 390 px phone, twelve
pixels square, sitting inside `bubble_frame`'s chrome.

Two rules the whole set obeys, so twelve icons read as one vocabulary:

  * **Silhouette first.** Each icon has a distinct outer shape — a sheet, a disc, a tag, a
    cloud, a heart. Colour is confirmation, never the only difference. `exclamation` and
    `exclamationGold` are the deliberate exception, and they are the same *event* seen at
    two rarities, which is exactly what the design doc asks for.
  * **Ink outline.** Same one-pixel `K` border as every other sprite in the game, so a
    bubble over a shelf still separates from it.
"""

from __future__ import annotations

# The shopper crossed something off the list and got nothing: a sheet with a red strike.
LIST_STRIKE = """
.........e..
.KKKKKKKKr..
.KWWWWWWrWK.
.KW555Wr5WK.
.KWWWWrWWWK.
.KW555r55WK.
.KWWWrWWWWK.
.KW55r555WK.
.KWWrWWWWWK.
.KKrKKKKKKK.
..e.........
............
"""

# The queue is getting long. A plain clock face — the escalation is carried by how long
# the shopper stands there, not by the icon.
CLOCK = """
....KKKK....
..KK1111KK..
.K11WWWW11K.
.K1WWWWWW1K.
K11WWKWWW11K
K1WWWKWWWW1K
K1WWWKKWWW1K
K11WWWWWW11K
.K1WWWWWW1K.
.K11WWWW11K.
..KK1111KK..
....KKKK....
"""

# The same clock, struck out: the shopper gave up. The X replaces the hands rather than
# sitting over them, because at twelve pixels both together is mush.
CLOCK_RED_X = """
....KKKK....
..KK1111KK..
.K11WWWW11K.
.KrWWWWWWrK.
K1WrWWWWrW1K
K1WWrWWrWW1K
K1WWWrrWWW1K
K1WWrWWrWW1K
.KWrWWWWrWK.
.KrWWWWWWrK.
..KK1111KK..
....KKKK....
"""

# Price tag with a raised brow above it: this costs more than I expected.
PRICE_TAG_BROW = """
..KKKKK.....
.K.....K....
............
....KKKKKKK.
...KWaaaaaaK
..KaaaaaaaaK
.KaaaaaaaaaK
.KaaaaaaaaaK
.KabbbbbbbbK
.KabbbbbbbbK
.KKKKKKKKKKK
............
"""

# Price tag with a sparkle: a bargain. Same tag silhouette as its negative twin, so the
# player reads "price" from the shape and "good or bad" from what sits above it.
PRICE_TAG_STAR = """
.....A......
..A.AAA.A...
...AAAAA....
..A.AAA.A...
....KKKKKKK.
...KWaaaaaaK
..KaaaaaaaaK
.KaaaaaaaaaK
.KaaaaaaaaaK
.KabbbbbbbbK
.KabbbbbbbbK
.KKKKKKKKKKK
"""

# Spoiled stock. Two bumps two pixels deep along the top edge: a cloud is only a cloud
# because its outline is irregular, and one-pixel bumps read as crenellations rather than
# as vapour. Earlier passes drew wisps too — below they read as legs, above as a stem.
GREEN_STINK_CLOUD = """
............
...KK..KK...
..KggKKggK..
.KggggggggK.
KggggggggggK
KgGggggggggK
KggggggggggK
.KffffffffK.
..KKKKKKKK..
............
............
............
"""

FROWN = """
...KKKKK....
.KKAAAAAKK..
.KAAAAAAAK..
KAAKAAAKAAK.
KAAKAAAKAAK.
KAAAAAAAAAK.
KAAAAAAAAAK.
KAAAKKKAAAK.
.KAKAAAKAK..
.KKAAAAAKK..
...KKKKK....
............
"""

HEART = """
............
.KK...KK....
KrrK.KrrK...
KrRrKKrRrK..
KrrrrrrrrrK.
.KrrrrrrrK..
..KrrrrrK...
...KrrrK....
....KrK.....
.....K......
............
............
"""

QUESTION_MARK = """
...KKKK.....
..KKUUKK....
..KUKKUK....
..KKKKUK....
.....KUK....
....KUUK....
....KUK.....
....KKK.....
............
....KKK.....
....KUK.....
....KKK.....
"""

SPARKLE = """
.....K......
....KAK.....
....KAK.....
.K..KAK..K..
..KKKAKKK...
KAAAAWAAAAK.
..KKKAKKK...
.K..KAK..K..
....KAK.....
....KAK.....
.....K......
............
"""

EXCLAMATION = """
....KKK.....
...KWWWK....
...KWWWK....
...KWWWK....
...KWWWK....
...KWWWK....
....KWK.....
....KKK.....
............
...KKKK.....
...KWWK.....
...KKKK.....
"""

# Gold is the *rarity* signal, not a different event (gentle-surface.md §2: "rare enough
# to feel like a discovery"), so it is literally the same drawing in a different metal.
EXCLAMATION_GOLD = EXCLAMATION.replace("W", "A")

# bubble id (as declared in content/asset-manifest.json, minus the `bubble_` prefix) -> grid.
ICONS: dict[str, str] = {
    "listStrike": LIST_STRIKE,
    "clock": CLOCK,
    "clockRedX": CLOCK_RED_X,
    "priceTagRaisedEyebrow": PRICE_TAG_BROW,
    "priceTagStar": PRICE_TAG_STAR,
    "greenStinkCloud": GREEN_STINK_CLOUD,
    "frown": FROWN,
    "heart": HEART,
    "questionMark": QUESTION_MARK,
    "sparkle": SPARKLE,
    "exclamation": EXCLAMATION,
    "exclamationGold": EXCLAMATION_GOLD,
}

# The cart a balking shopper leaves in the aisle. Side view, so the handle reads at 16 px
# where a three-quarter basket would not. `gentle-surface.md` §1 wants it ugly on purpose:
# it is drawn empty and squat, a piece of litter rather than a piece of equipment.
CART_ABANDONED = """
................
..KKKK..........
..K55K..........
..KK5KKKKKKKKK..
...K5555555555K.
...K5KKKKKKK55K.
...K5K.....K55K.
...K5K.....K55K.
...K5K.....K55K.
...K5KKKKKKKK5K.
...K555555555K..
...KKKKKKKKKKK..
....K.......K...
...KKK.....KKK..
...K0K.....K0K..
...KKK.....KKK..
"""
