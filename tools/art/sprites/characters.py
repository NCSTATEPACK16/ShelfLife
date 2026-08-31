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
