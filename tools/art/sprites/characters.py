"""Character sprites, authored as text (ADR 0006).

Sixteen by twenty-four pixels, chunky-outlined house style. Three facings are drawn by
hand -- down, up, left -- and `right` is the mirror of `left`, which is the oldest trick in
the medium and removes a quarter of the work.

Each facing has three poses: `stand`, and two contact poses `stepA`/`stepB` that alternate
to make a two-frame walk. Idle uses `stand` for both frames.

The colour characters that palettes swap are deliberately few:
    h/H/j   hair dark / light / shadow
    r/R/e   garment base / light / dark
Everything else -- skin, outline, shoes -- stays fixed, so seven segments read as seven
different people rather than seven different art styles.
"""

# ── facing the camera ────────────────────────────────────────────────────────
DOWN_STAND = """
....KKKKKK....
...KhhhhhhK...
..KhHHHHHHhK..
..KhssssssjK..
..KsssssssssK.
..KsKssssKssK.
..KsssssssssK.
..KszzzzzzzsK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
KsRRRRRRRRRRsK
KsRrrrrrrrrRsK
KsrrrrrrrrrrsK
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

DOWN_STEP_A = """
....KKKKKK....
...KhhhhhhK...
..KhHHHHHHhK..
..KhssssssjK..
..KsssssssssK.
..KsKssssKssK.
..KsssssssssK.
..KszzzzzzzsK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
KsRRRRRRRRRRsK
KsRrrrrrrrrRsK
.KrrrrrrrrrrsK
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
..KvvKKvvK....
..KvvKKvvK....
..KvvKKvvK....
.KKKKKKKKKK...
.K00KKKK00K...
.KKKKKKKKKK...
"""

DOWN_STEP_B = """
....KKKKKK....
...KhhhhhhK...
..KhHHHHHHhK..
..KhssssssjK..
..KsssssssssK.
..KsKssssKssK.
..KsssssssssK.
..KszzzzzzzsK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
KsRRRRRRRRRRsK
KsRrrrrrrrrRsK
Ksrrrrrrrrrr K
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
....KvvKKvvK..
....KvvKKvvK..
....KvvKKvvK..
...KKKKKKKKKK.
...K00KKKK00K.
...KKKKKKKKKK.
"""

# ── walking away from the camera ─────────────────────────────────────────────
UP_STAND = """
....KKKKKK....
...KhhhhhhK...
..KhhhhhhhhK..
..KhhhhhhhhK..
..KhhhhhhhhhK.
..KhhhhhhhhhK.
..KhhhhhhhhhK.
..KjjjjjjjjjK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
KsRRRRRRRRRRsK
KsRrrrrrrrrRsK
KsrrrrrrrrrrsK
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

UP_STEP_A = UP_STAND.replace(
    "...KvvKKvvK...\n...KvvKKvvK...\n...KvvKKvvK...\n..KKKKKKKKKK..\n..K00KKKK00K..\n..KKKKKKKKKK..",
    "..KvvKKvvK....\n..KvvKKvvK....\n..KvvKKvvK....\n.KKKKKKKKKK...\n.K00KKKK00K...\n.KKKKKKKKKK...",
)
UP_STEP_B = UP_STAND.replace(
    "...KvvKKvvK...\n...KvvKKvvK...\n...KvvKKvvK...\n..KKKKKKKKKK..\n..K00KKKK00K..\n..KKKKKKKKKK..",
    "....KvvKKvvK..\n....KvvKKvvK..\n....KvvKKvvK..\n...KKKKKKKKKK.\n...K00KKKK00K.\n...KKKKKKKKKK.",
)

# ── walking left; `right` is this mirrored ───────────────────────────────────
LEFT_STAND = """
....KKKKK.....
...KhhhhhK....
..KhHHHHhhK...
..KhsssssjK...
..KssKsssjK...
..KsssssssK...
..KszzzzzsK...
...KssssssK...
...KKKKKKKK...
..KrrrrrrrrK..
.KsRRRRRRRRK..
.KsRrrrrrrrK..
.KsrrrrrrrrK..
.KKrrrrrrrrK..
..Krrrrrrr K..
..KreeeeeerK..
..KKKKKKKKKK..
...KvvvKvvK...
...KvvvKvvK...
...KvvvKvvK...
..KKKKKKKKKK..
..K000KK00K...
..KKKKKKKKK...
"""

LEFT_STEP_A = """
....KKKKK.....
...KhhhhhK....
..KhHHHHhhK...
..KhsssssjK...
..KssKsssjK...
..KsssssssK...
..KszzzzzsK...
...KssssssK...
...KKKKKKKK...
..KrrrrrrrrK..
.KsRRRRRRRRK..
.KsRrrrrrrrK..
.KsrrrrrrrrK..
.KKrrrrrrrrK..
..Krrrrrrr K..
..KreeeeeerK..
..KKKKKKKKKK..
.KvvvK.KvvK...
.KvvvK.KvvK...
.KvvvK..KvvK..
KKKKKK..KKKK..
K000KK..K00K..
KKKKKK..KKKK..
"""

LEFT_STEP_B = """
....KKKKK.....
...KhhhhhK....
..KhHHHHhhK...
..KhsssssjK...
..KssKsssjK...
..KsssssssK...
..KszzzzzsK...
...KssssssK...
...KKKKKKKK...
..KrrrrrrrrK..
.KsRRRRRRRRK..
.KsRrrrrrrrK..
.KsrrrrrrrrK..
.KKrrrrrrrrK..
..Krrrrrrr K..
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKvvvK...
...KvvKvvvK...
..KvvK.KvvvK..
..KKKK..KKKKK.
..K00K..KK000K
..KKKK..KKKKKK
"""

# facing -> (stand, stepA, stepB). `right` is filled in by mirroring `left`.
POSES: dict[str, tuple[str, str, str]] = {
    "down": (DOWN_STAND, DOWN_STEP_A, DOWN_STEP_B),
    "left": (LEFT_STAND, LEFT_STEP_A, LEFT_STEP_B),
    "up": (UP_STAND, UP_STEP_A, UP_STEP_B),
}

# Staff read as staff by wearing the store's apron colour and a cap, not by being a
# different body -- same silhouette, so the player learns one shape.
STAFF_OVERRIDES = {"r": "green-base", "R": "green-light", "e": "green-dark", "h": "grey-50", "H": "white"}


# ── reaction poses (phase S3) ────────────────────────────────────────────────
# `docs/design/gentle-surface.md` §1 gives every satisfaction term its own body language.
# Rendering fifteen bespoke poses across four facings is not the economics of this project
# (`tools/art/manifest.py` already multiplies by rotation, frame, and seven palettes), so
# the seven live tells share three poses instead:
#
#     pause    fillRateMiss (shrug) and queuePenaltyRising (impatient stance)
#     recoil   spoiledEncounters and priceSurpriseNegative (the put-back)
#     hop      priceSurprisePositive (grab a second) and impulsePurchase (item into cart)
#
# Only one grid per pose per facing is drawn. The second animation frame is derived — see
# `pose_frame` — for the same reason `right` is the mirror of `left`: a one-pixel move is
# what separates a held pose from a frozen sprite, and it does not need a second drawing.

# Arms folded across the chest. Reads as a shrug held a beat too long and as an impatient
# wait, which is precisely the pair of tells it has to carry.
DOWN_PAUSE = """
....KKKKKK....
...KhhhhhhK...
..KhHHHHHHhK..
..KhssssssjK..
..KsssssssssK.
..KsKssssKssK.
..KsssssssssK.
..KszzzzzzzsK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
.KRRRRRRRRRRK.
.KKssssssssKK.
.KszzzzzzzzsK.
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

# Both hands up, mouth open. The put-back and the spoiled recoil are the same beat.
DOWN_RECOIL = """
....KKKKKK....
...KhhhhhhK...
..KhHHHHHHhK..
..KhssssssjK..
..KsssssssssK.
..KsKssssKssK.
..KsssssssssK.
..KsKKKKKKKsK.
...KsssssssK..
.KKKKKKKKKKKK.
KsKrrrrrrrrKsK
KsKRRRRRRRRKsK
KzKRrrrrrrRKzK
.KKrrrrrrrrKK.
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

# One arm up holding the item — two pixels of amber above the fist, which is all a 16x24
# frame has room for and enough to read as *something* rather than as an empty hand. Drawn
# crouched, one row down its canvas: `pose_frame` lifts it clear of the floor for the
# second frame, and that gap is the whole hop.
DOWN_HOP = """
..............
KAK.KKKKKK....
KAKKhhhhhhK...
KsKhHHHHHHhK..
KsKhssssssjK..
KsKsssssssssK.
KsKsKssssKssK.
KzKsssssssssK.
KKKszzzzzzzsK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
.KRRRRRRRRRRsK
.KRrrrrrrrRsK.
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

UP_PAUSE = """
....KKKKKK....
...KhhhhhhK...
..KhhhhhhhhK..
..KhhhhhhhhK..
..KhhhhhhhhhK.
..KhhhhhhhhhK.
..KhhhhhhhhhK.
..KjjjjjjjjjK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
.KRRRRRRRRRRK.
.KKssssssssKK.
.KszzzzzzzzsK.
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

UP_RECOIL = """
....KKKKKK....
...KhhhhhhK...
..KhhhhhhhhK..
..KhhhhhhhhK..
..KhhhhhhhhhK.
..KhhhhhhhhhK.
..KhhhhhhhhhK.
..KjjjjjjjjjK.
...KsssssssK..
.KKKKKKKKKKKK.
KsKrrrrrrrrKsK
KsKRRRRRRRRKsK
KzKRrrrrrrRKzK
.KKrrrrrrrrKK.
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

UP_HOP = """
..............
KAK.KKKKKK....
KAKKhhhhhhK...
KsKhhhhhhhhK..
KsKhhhhhhhhK..
KsKhhhhhhhhhK.
KsKhhhhhhhhhK.
KzKhhhhhhhhhK.
KKKjjjjjjjjjK.
...KsssssssK..
..KKKKKKKKKK..
.KrrrrrrrrrrK.
.KRRRRRRRRRRsK
.KRrrrrrrrRsK.
KKrrrrrrrrrrKK
..Krrrrrrrr K.
..KreeeeeerK..
..KKKKKKKKKK..
...KvvKKvvK...
...KvvKKvvK...
...KvvKKvvK...
..KKKKKKKKKK..
..K00KKKK00K..
..KKKKKKKKKK..
"""

LEFT_PAUSE = """
....KKKKK.....
...KhhhhhK....
..KhHHHHhhK...
..KhsssssjK...
..KssKsssjK...
..KsssssssK...
..KszzzzzsK...
...KssssssK...
...KKKKKKKK...
..KrrrrrrrrK..
..KRRRRRRRRK..
..KssssssssK..
..KszzzzzzsK..
.KKrrrrrrrrK..
..Krrrrrrr K..
..KreeeeeerK..
..KKKKKKKKKK..
...KvvvKvvK...
...KvvvKvvK...
...KvvvKvvK...
..KKKKKKKKKK..
..K000KK00K...
..KKKKKKKKK...
"""

LEFT_RECOIL = """
....KKKKK.....
...KhhhhhK....
..KhHHHHhhK...
..KhsssssjK...
..KssKsssjK...
..KsssssssK...
..KsKKKKKsK...
...KssssssK...
...KKKKKKKK...
KsKrrrrrrrrK..
KsKRRRRRRRRK..
KzKRrrrrrrrK..
..KrrrrrrrrK..
.KKrrrrrrrrK..
..Krrrrrrr K..
..KreeeeeerK..
..KKKKKKKKKK..
...KvvvKvvK...
...KvvvKvvK...
...KvvvKvvK...
..KKKKKKKKKK..
..K000KK00K...
..KKKKKKKKK...
"""

LEFT_HOP = """
..............
KAK.KKKKK.....
KAKKhhhhhK....
KsKhHHHHhhK...
KsKhsssssjK...
KsKssKsssjK...
KzKsssssssK...
KKKszzzzzsK...
...KssssssK...
...KKKKKKKK...
..KrrrrrrrrK..
..KRRRRRRRRK..
.KsRrrrrrrrK..
.KsrrrrrrrrK..
.KKrrrrrrrrK..
..Krrrrrrr K..
..KreeeeeerK..
..KKKKKKKKKK..
...KvvvKvvK...
...KvvvKvvK...
...KvvvKvvK...
..KKKKKKKKKK..
..K000KK00K...
..KKKKKKKKK...
"""

# pose -> facing -> grid. `right` is mirrored from `left`, exactly like the walk cycle.
REACTION_POSES: dict[str, dict[str, str]] = {
    "pause": {"down": DOWN_PAUSE, "up": UP_PAUSE, "left": LEFT_PAUSE},
    "recoil": {"down": DOWN_RECOIL, "up": UP_RECOIL, "left": LEFT_RECOIL},
    "hop": {"down": DOWN_HOP, "up": UP_HOP, "left": LEFT_HOP},
}

# The row the head sits on top of, per facing. `down`/`up` carry a nine-row head; `left`
# is a row shorter because the profile head is narrower and needs less of it.
NECK_ROW: dict[str, int] = {"down": 9, "up": 9, "left": 8}


def _pad(rows: list[str]) -> list[str]:
    width = max(len(row) for row in rows)
    return [row.ljust(width, ".") for row in rows]


def pose_frame(pose: str, facing: str, frame: int) -> list[str]:
    """One animation frame of a reaction pose, as padded sprite rows.

    Frame 0 is the drawing. Frame 1 is derived, because the difference between a held
    pose and a frozen sprite is one pixel, not a second drawing:

      pause / recoil  the head sinks a pixel into the shoulders — a shrug, and a flinch
      hop             the whole body lifts a pixel clear of the floor

    Both transforms preserve the canvas height, so the frame still matches the size the
    manifest declares (`tools/art/build.py` rejects it otherwise).
    """
    rows = _pad([line for line in REACTION_POSES[pose][facing].strip("\n").split("\n")])
    if frame % 2 == 0:
        return rows

    blank = "." * len(rows[0])
    if pose == "hop":
        # Everything moves up one row and the floor row goes blank. The pose is drawn with
        # a blank top row precisely so this costs no pixels off the top of the head.
        return rows[1:] + [blank]
    neck = NECK_ROW[facing]
    return [blank] + rows[:neck] + rows[neck + 1 :]
