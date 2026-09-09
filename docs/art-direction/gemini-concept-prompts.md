# Gemini concept-art & layout prompts

Ten prompts that turn Gemini into the art director and UI/UX designer for Shelf Life, so the
visual decisions come back as **concept art plus a machine-readable spec** that drops straight
into `content/design/tokens.json`, `content/asset-manifest.json`, and `tools/art/sprites/*.py`.

Reference images go in `reference/NN-*/`. See `reference/README.md` for the two hard rules.

> **There is a copy-paste page for this file.** `planogram.html` is the same ten prompts as a
> published Artifact where one button copies the shared blocks *and* the prompt *and* the HANDOFF
> schema in a single clipboard write — the right blocks only, no assembling by hand. Use the page to run the set; use this
> file to read, review, and edit the prompts in version control. Both are numbered the same way.

---

## Reading order

The prompts are ordered against the surface roadmap, so each targets the next thing Track B builds.

| # | Prompt | What it decides |
|---|---|---|
| 1 | Art Direction Board | Visual thesis, material ramps, light direction, detail budget. Run first — everything inherits it |
| 2 | Archetype → Store Vocabulary | Known US grocery-format archetypes → fixture taxonomy, tile footprints, palette mapping, manifest entries |
| 3 | The Store Scene | The money shot at three zooms, plus a self-critique at phone scale |
| 4 | Gentle Surface Tell Sheet | **S3, up next.** 12 bubbles, 13 animations, world marks, rate-limit and silence studies |
| 5 | Shopper & Staff Cast | One 16×24 base × 7 segment palettes, silhouette collision test |
| 6 | The Responsive HUD | Compact-first HUD, both breakpoints, component inventory with hit targets |
| 7 | Build & Planogram Mode | Fixture tray, placement feedback, gestures, congestion heatmap, the milk before/after |
| 8 | Advisors & the KPI System | Three advisors with portraits and voices; a stat tile with a mandatory benchmark slot |
| 9 | The Rival Brand Kit | All 12 chains: palettes, 32×32 marks, storefronts, taunts — legal rules inline |
| 10 | Title, Chapter Cards & Key Art | Logotype, portrait title screen, boss intro, marketing crops |

---

## How to use this file

1. **Open a fresh Gemini chat per prompt.** Mixing prompt 6 (HUD) and prompt 9 (rival logos) in
   one thread produces mush.
2. **Paste the blocks named on the prompt's `Sends:` line**, then the prompt itself.
3. **Attach the images** from the matching `reference/` folder. Every prompt has an
   `IF I ATTACHED IMAGES` clause that tells Gemini what to extract from them and what to ignore.
4. **Every prompt asks for two outputs:** the images, *and* a fenced `HANDOFF` block of JSON.
   The images are for you. The HANDOFF block is what you paste back to Claude Code — it is the
   part that becomes code.
5. **Iterate on the HANDOFF, not the picture.** If the art is 80% right, the fix is usually one
   value in the spec, not a re-roll.

### Where the output lands

| Gemini gives you | You (or Claude Code) put it in |
|---|---|
| Token deltas | `content/design/tokens.json` (Track B owns this file — ADR 0007) |
| New/changed asset declarations | `content/asset-manifest.json` |
| Sprite designs | character grids in `tools/art/sprites/*.py`, compiled by `npm run art:build` |
| Hero art (title, portraits, signage) | `assets/src/`, through `tools/art/quantize.py` |
| Layout & component specs | `src/ui/**` panels, both breakpoints |

Prompts 1 and 2 are the foundation: run them first and keep both winners, then attach them as
references from 3 on — 1 carries the objects, 2 carries the world.

**Never hand-edit a PNG.** ADR 0006: the art is text, PNGs are build output.

---

## The shared blocks

Six blocks. **A prompt carries only the ones it needs** — the cast sheet never sends the KPI
benchmark rule, and the advisor panel never sends the fixture rotation budget. Each prompt below
names its blocks on a `Sends:` line; paste those, then the prompt.

| Block | Chars | Used by | What it fixes |
|---|---|---|---|
| **Game** | 771 | all ten | What Shelf Life is, and the one pillar every visual decision answers to. |
| **Idiom** | 528 | all ten | The 16-bit look, the shared outline, integer zoom, and the legibility reference. |
| **Projection** | 428 | 1–5, 7, 9, 10 | Orthogonal 3/4 on 32px, y-sort, anchors, and the 2-rotation budget. |
| **Palette** | 906 | all ten | The locked ramp and the desaturated-fixtures rule. |
| **Platform** | 1454 | 6, 7, 8, 10 | Phone-first, 44px targets, safe areas, no load-bearing hover, the benchmark rule. |
| **Legal** | 544 | 2, 9, 10 | Parody guardrails. Only on the prompts that can actually trip them. |

If you are staying in one chat, paste a block once and skip it on later prompts.

### Game

```
SHELF LIFE — a 2D supermarket tycoon game. You run one grocery store against ten fictional rival chains, ranked by how much their community LOVES them, not by how big they are. Money can beat scale; money cannot beat a chain where the cashier knows your kid's name. Underneath is a real retail simulation: a store-choice logit model, per-trip shopper satisfaction, spoilage, queueing, and loyalty that compounds slowly.

THE PILLAR — "deep sim, gentle surface". The math is brutal; the interface never makes the player read it. The player learns the model by WATCHING SHOPPERS, never by reading a formula. Every quantity the simulation computes has a visual tell. Depth is always exactly one click away. A store where nothing is wrong must look CALM — calm is the reward.
```

### Idiom

```
VISUAL IDIOM (locked — do not propose alternatives)
16-bit SNES-era console-management idiom. Warm, crisp, hand-placed. Not retro-for-its-own-sake, not modern flat-vector.
Every sprite carries a 1px outline in the darkest ink. That shared outline is what welds separately-authored art into one world.
Authored at 1x, displayed only at integer zoom (1x/2x/3x/4x), nearest-neighbour.
Legibility reference only — not palette, not projection: RollerCoaster Tycoon 2. Silhouette-first clarity, every state readable without a tooltip.
```

### Projection

```
PROJECTION (locked)
ORTHOGONAL 3/4 TOP-DOWN on a 32x32 axis-aligned grid. NOT isometric. NOT diamond tiles. Axis-aligned, straight on, slightly above eye level.
Tall fixtures extend upward on a 32x48 or 32x64 canvas, anchored at bottom-centre of the footprint tile. Depth is y-sort.
Maximum 2 rotations per rotatable fixture (facing the aisle, facing away); symmetric props get 1. A hard art-budget constraint, not a preference.
```

### Palette

```
LOCKED PALETTE — the only colours in the game. Do not invent hues.
Warm-grey ramp, used for ALL structure: fixtures, floor, walls, and UI chrome.
  #F4F3F0  #E8E6E1  #D6D3CB  #B4B0A6  #8A867C  #615E56  #403E38  #2A2926  #1E1D1A  #141311
Product family, used ONLY for goods, data, and state — never for chrome.
  red #E23D2E (markdowns, primary accent) | green #1F7A4D (fresh, positive) | amber #D9931B (spoilage warning) | blue #2C6BA8 (dairy/frozen, informational) | violet #6B4A9E (rival identity, loyalty) | brown #7A5C2E (spoiled)
THE CENTRAL RULE: desaturated warm-grey fixtures, fully saturated products. That is what makes a shelf read as FULL or EMPTY at a glance from zoomed out — which on a 6-inch screen is not a nice-to-have, it is the whole design.
If a surface genuinely needs a value the ramp lacks, say so explicitly as a proposed addition with a hex and a reason. Do not slip in a new hue.
```

### Platform

```
PLATFORM RULES (a design that breaks these is unusable)
PHONE-FIRST. Design the compact layout (390x844) FIRST, then expand to regular (>=768px). A desktop-first answer will be rejected.
Two breakpoints and only two: compact <768px, regular >=768px.
44px minimum hit target for every interactive element, at BOTH sizes.
Nothing interactive in the bottom 34px — the iOS home-indicator swipe wins that fight. Respect safe-area insets.
Hover is NEVER load-bearing. Tooltips are tap-to-open popovers.
Compact: panels are bottom sheets, not floating windows; the HUD is one top bar plus one bottom action bar; multi-column dashboards become tabbed single columns; the fixture palette is a horizontally scrolling tray.
The world animates; the UI mostly doesn't. Durations 80/140/220/380ms.
UI chrome uses only the warm-grey ramp. Saturated colour in the UI means data or state, never decoration, and never overload the red accent to mean "good".
Light theme: ground #E8E6E1, surface #F4F3F0, ink #1A1917, muted #615E56, line #D6D3CB, accent #E23D2E.
Dark theme:  ground #141311, surface #1E1D1A, ink #F0EEE9, muted #A8A49A, line #33312C, accent #F05243.
Type: signage is heavy and tight; body is a neutral sans; every NUMBER is monospace, because prices and receipts are monospaced in the real world. Radii are restrained — fixtures are metal shelving, not pills.
EVERY KPI renders against a rival benchmark or a 7-day trailing average. A bare number is a bug.
```

### Legal

```
LEGAL GUARDRAILS (hard fail if broken)
All chains, brands, and products in this game are FICTIONAL PARODIES. Never reproduce, evoke, or adapt a real retailer's name, logo, wordmark, slogan, mascot, or a colour pairing that functions as trade dress — not even as a placeholder, not even distorted. Satirize business STRATEGY (pallet pricing, membership lock-in, cult products), which is not ownable. Never depict a chain doing something defamatory. No real product brands on shelves — the SKU brands are invented too, and it is funnier that way.
```

---

# Prompt 1 — The Art Direction Board

**Run this first.** Everything else inherits its answer. Keep the resulting board open in a tab.

**Attach:** `reference/01-style-bible/` — games whose *look* you want, plus any mood images.

**Sends:** Game · Idiom · Projection · Palette

```
You are the art director for Shelf Life. Before anything is drawn, I need the visual thesis
written down and shown.

Produce an ART DIRECTION BOARD as a single wide image, plus the written spec below.

THE BOARD (one image, landscape, laid out as a designer's board with labelled zones):
1. PALETTE — the locked ramps above, drawn as chips with hex labels, arranged to show the
   central rule: desaturated warm-grey structure against fully saturated goods. Show one
   "shelf full" vs "shelf empty" pair beside the chips to prove the rule reads.
2. MATERIAL STUDY — how these colours become surfaces in 16-bit pixel art: painted metal
   shelving, vinyl floor tile, laminate counter, cardboard, glass cooler door, produce. Show
   the 3-to-4 value ramp you would use for each material and where the outline sits.
3. LIGHT — one fixed light direction with a soft baked contact shadow. Propose the direction
   and show a fixture lit by it from both of its 2 rotations.
4. SILHOUETTE TEST — six store objects as pure black silhouettes at 32px. If a player cannot
   name all six, the shapes are wrong. Redraw any that fail before showing me.
5. CALM VS ALARM — the same aisle drawn twice: a healthy store (calm, few tells) and a failing
   store (spoilage, spill, empty facings, a queue). Prove that "calm is the reward" is visible.
6. THE ONE-INCH TEST — a 3x3cm crop of a busy scene, shown at final phone scale, to prove
   readability on a 6-inch screen.

RULES YOU MUST FOLLOW
- Use ONLY the locked palette. If a material genuinely needs a value the ramp does not have,
  call it out explicitly as a proposed token addition with a hex and a reason — do not sneak
  in a new hue.
- Orthogonal 3/4 top-down, 32px grid, 1px dark outline, authored at 1x.
- No text inside sprites. No logos anywhere.
- No isometric diamonds. If you catch yourself drawing a diamond floor tile, stop and redo it.

IF I ATTACHED IMAGES: extract only composition, value structure, outline weight, and density
of detail per 32px. Do NOT adopt their palettes, their projection, or any of their IP.

ALSO ANSWER IN WRITING (be opinionated; pick one, do not give me options):
- In one sentence, what does this game look like? Write it as a thesis I can put at the top of
  docs/art-bible.md.
- Three visual things this game does that similar games do not.
- The three most likely ways this art direction fails, and the rule that prevents each.
- Detail budget: how many distinct pixel clusters belong in one 32x32 floor tile, one shelf
  face, one 16x24 shopper? Give numbers.

FINISH WITH a fenced code block labelled HANDOFF containing JSON:
{
  "thesis": "...",
  "lightDirection": "upper-left | upper-right | ...",
  "outline": { "color": "grey-900", "weight": 1, "exceptions": [] },
  "materialRamps": { "shelfMetal": ["#...","#...","#..."], "floorVinyl": [...], ... },
  "proposedTokenAdditions": [ { "path": "color.fixture.150", "hex": "#...", "why": "..." } ],
  "detailBudget": { "floorTile": 0, "shelfFace": 0, "shopper": 0 },
  "rejectedIdeas": ["..."]
}
```

**Good output looks like:** a board you would pin above the desk, a thesis sentence under 20
words, and a HANDOFF whose `proposedTokenAdditions` is short (0–3 entries). A long list of
token additions means the palette was ignored — push back and re-run.

---

# Prompt 2 — Archetype → Store Vocabulary

This is the one that turns **well-known US grocery-format archetypes** — not your own
photographs — into game assets. There is no reference photo here to carry the pixel-art style,
so this prompt states the SNES look explicitly in words instead.

**Attach (optional):** `reference/01-style-bible/` — any 16-bit games whose look you want echoed.
No store photos are required for this prompt; Gemini reasons from general knowledge of common
US grocery formats.

**Sends:** Game · Idiom · Projection · Palette · Legal

```
No photographs attached. Instead, reason from general public knowledge of common US grocery-
store FORMATS — the category-level archetypes below, not any single real chain's name, logo, or
trade dress. Convert them into the fixture vocabulary of Shelf Life, rendered in a 16-bit
SNES-era pixel-art style: orthogonal 3/4 top-down projection, 32px grid, 1px dark outline, 3-4
shade value ramps per material, dithering instead of gradients — the console-management/sim
idiom of the SNES era (the FEEL of games like Harvest Moon, SimCity SNES, or Actraiser's town
view, without borrowing any of their actual assets, palettes, or sprites). State this style
explicitly in every image you generate, since nothing here shows it to you.

STEP 0 — PICK A SCOPE. Either (a) ONE generic supermarket vocabulary that covers a typical
mid-size US grocery store, or (b) a vocabulary pass per store-format tier, one run each for: a
dying deep-discount grocer, a 24-hour convenience-format grocer, a warehouse membership club, a
hard-discounter with heavy private label, a premium/organic "whole paycheck" market, and a
highway-megastore-with-attached-attractions. Tell me which scope you're running before Step 1,
and if (b), which tier this run covers.

STEP 1 — TAXONOMY. From the chosen archetype(s), list every distinct fixture type a store of
that format would plausibly have. For each, give me: what it is, its real-world footprint in
metres, its footprint in 32px game tiles (1 tile = roughly 1 metre of aisle), how tall it should
render (32 / 48 / 64px canvas), how many rotations it needs (1 if symmetric, 2 maximum), and
whether it has visual states (full / half / empty / idle / busy / clean / dirty).

STEP 2 — WHAT THE GAME ALREADY HAS. Reconcile your taxonomy against this existing manifest and
tell me what is MISSING, what is REDUNDANT, and what I have declared but do not actually need:
  floor_tile 32x32 | floor_entrance 32x32 | wall_back 32x48 | wall_side 32x48
  shelf_basic 32x48 [full,half,empty] | shelf_endcap 32x40 [full,half,empty]
  register 64x40 [idle,busy] | self_checkout 64x40 [idle,busy]
  cart_corral 32x32 [full,empty] | cart_abandoned 16x16 | spill_decal 32x16
Rank the missing ones by how much they change what the PLAYER CAN DO, not by how they look.
A produce table that enables a fresh-department strategy beats a decorative plant. If this run
is a specific tier, flag anything that is THAT FORMAT'S signature fixture (e.g. the sample
corridor of a warehouse club, the single always-open register of a dying discounter).

STEP 3 — PALETTE MAPPING. For each fixture, map its typical real-world colours onto the locked
palette. The mapping is not literal: real supermarket fixtures are beige and chrome and the
game's are a warm-grey ramp. Tell me which grey step each surface lands on and WHY, and where
you deliberately drop saturation, so the products stay the only saturated thing in frame.

STEP 4 — DRAW IT. Produce a sprite sheet image: every fixture from Step 2, drawn at 4x zoom on
a neutral background, grouped by department, each labelled, each shown in all its states and
rotations, in the stated SNES pixel-art style. Draw them as they would look in-engine, not as
illustration.

STEP 5 — THE DENSITY LESSON. What makes a shelf read as FULL versus EMPTY at a distance, at
this pixel density? Give me the specific pixel-level technique for the three states at 32x48,
and draw the three side by side, large.

GUARDRAILS
- Category-level only: describe "a dying deep-discounter" or "a warehouse club," never a
  specific real chain's name, logo, wordmark, slogan, or colour pairing, per CLAUDE.md's parody
  rules. If you find yourself about to name a real retailer, stop and generalize instead.
- All signage you draw is blank or uses invented words. No brand names on packaging.
- Locked palette only. Orthogonal 3/4, never isometric.
- Every image must look unmistakably 16-bit SNES-era pixel art — flat colour fields, hard-edged
  dithering for shading, no soft gradients, no anti-aliasing, no photo-real lighting. If an
  image drifts toward "flat vector" or "modern clipart," redo it before showing me.

FINISH WITH a fenced HANDOFF block containing a JSON array of asset-manifest entries in exactly
this shape, ready to paste into content/asset-manifest.json:
[ { "id": "produce_table", "size": [64,40], "anchor": [0.5,0.92], "atlas": "world",
    "footprint": [2,1], "rotations": 1, "states": ["full","half","empty"],
    "archetype": "generic | dying-discounter | convenience | warehouse-club | hard-discounter |
      premium-organic | highway-megastore",
    "palette": { "body": "grey-300", "top": "grey-200", "shadow": "grey-500" },
    "why": "one sentence on what strategy this fixture unlocks" } ]
```

**Good output looks like:** a taxonomy that names 8–15 fixtures, a ranked missing-list where the
top item is clearly a *mechanic* and not decoration, and a full/half/empty study you could hand
to `tools/art/sprites/` as a spec. Run it once generic, or once per archetype tier if you want
per-rival texture later — see `docs/legal/parody-review.md` before any of it ships.

---

# Prompt 3 — The Store Scene

The money shot, and the legibility test that everything else has to survive.

**Attach:** `reference/03-store-scene/` — overhead store shots, floor plans, planograms.

**Sends:** Game · Idiom · Projection · Palette

```
Draw the flagship concept scene for Shelf Life: a working supermarket floor, mid-morning rush,
in the locked style.

THE SCENE MUST CONTAIN, and must remain readable with all of it present:
- An entrance with a cart corral, and a natural flow into the store
- At least three aisles of shelving with visible department identity (produce, dairy/frozen,
  dry goods) carried by PRODUCT colour, never by fixture colour
- Two endcaps, one of them a promo endcap with a physical sign
- A checkout bank: two staffed registers and one self-checkout, one lane with a queue of four
- 12-18 shoppers at 16x24px, mid-behaviour: walking, pausing at a facing, one detouring toward
  a shelf (discovery), one putting an item back, one with an abandoned cart
- One staff member restocking
- Exactly these problems, and no more: one empty facing, one spoiled item on a shelf, one
  spill on the floor, one queue running long
- Four thought bubbles maximum in frame. Four. The rate limit is a design rule, not a budget.

DELIVER THREE VERSIONS OF THE SAME SCENE:
A) 1x zoom, the whole store, as it appears on a 1440x900 desktop viewport
B) 2x zoom, a quarter of the store, as it appears on a 390x844 phone in portrait — this is the
   one that matters most; if it fails, the design fails
C) The same phone crop with EVERY tell removed and every shelf full — the "calm store". Place A
   and C side by side in the final image so the difference reads instantly.

COMPOSITION RULES
- Orthogonal 3/4 top-down on a 32px grid. Nothing occludes an aisle — shoppers must never be
  hidden behind a fixture, because shoppers ARE the game's telemetry channel.
- Y-sort depth. Tall fixtures extend upward from their footprint tile.
- Desaturated warm-grey fixtures, fully saturated goods. The eye should land on products and
  on people, never on shelving.
- Light from one fixed direction with baked contact shadows. No dynamic shadows.
- No text anywhere except invented, illegible-at-1x signage shapes.

IF I ATTACHED IMAGES: take aisle spacing, sightline length, department adjacency, and queue
geometry from them. Ignore their brand fixtures entirely.

THEN CRITIQUE YOUR OWN SCENE IN WRITING:
- Name the three things a player's eye lands on first, in order. If a shelf is in that list,
  the colour rule is broken — say so and tell me the fix.
- At phone scale, which of the four problems is hardest to notice? What world-level change
  (not a bigger bubble) would fix it?
- Where does the composition get noisy, and what would you cut?

FINISH WITH a fenced HANDOFF block:
{
  "readingOrder": ["...","...","..."],
  "weakestTell": { "tell": "...", "fixWithoutBubbles": "..." },
  "aisleSpacingTiles": 0,
  "departmentAdjacency": [["produce","dairy"], ...],
  "cutList": ["..."],
  "phoneScaleVerdict": "passes | fails, because ..."
}
```

**Good output looks like:** version B being genuinely readable, and a self-critique that admits
something. If the critique says everything is fine, ask it again with "be harsher."

---

# Prompt 4 — The Gentle Surface Tell Sheet

The game's telemetry channel. These twelve bubbles and thirteen animations are how a player
learns a multinomial-logit model without ever seeing one.

**Attach:** `reference/04-gentle-surface/` — emote sheets, reaction icons from sim games.

**Sends:** Game · Idiom · Projection · Palette

```
Design the complete visual-tell system for Shelf Life. This is the most important art in the
game: it is how the simulation talks to the player.

THE CONTRACT
Every term in the satisfaction and impulse formulas has a declared tell: a thought bubble, a
body animation, a world mark (the shelf or register itself changes), or a combination. A term
without a tell fails content validation in CI. Below is the declared set. Draw all of it.

BUBBLES — each 12x12px inside a 20x20px bubble frame, drawn to read at 1x on a phone:
  listStrike (shopping list with a red strike) ....... an item on the list was out of stock
  clock ............................................. the queue is getting long
  clockRedX ......................................... balked; abandoning the cart and leaving
  priceTagRaisedEyebrow ............................. price is higher than expected
  priceTagStar ...................................... price is a pleasant surprise
  greenStinkCloud ................................... encountered a spoiled item
  frown ............................................. the store is dirty
  heart ............................................. a staff member helped them
  questionMark ...................................... nobody helped them; they are lost
  sparkle ........................................... discovery — they found something they like
  exclamation (white) ............................... impulse purchase fired
  exclamationGold ................................... rare adjacency-combo impulse. Must feel special.
  plus: particle_flies 8x8, world FX near spoiled goods

SHOPPER ANIMATIONS — 16x24px, states idle / walk / pause / recoil / hop, plus these behaviours:
  stops at an empty facing, looks down at the list, shrugs, moves on   <- the single most
     important animation in the game; it is how a player learns to reorder
  picks an item up, turns it over, PUTS IT BACK                        <- the beat that sells
     price sensitivity. Get this one right.
  grabs a second one (positive price surprise)
  foot tap -> arms crossed -> head shake (queue frustration, three escalating stages)
  abandons the cart in the aisle and walks out
  recoils from a spoiled item and steps back
  steps around a spill, wrinkles nose
  nods at a staff member who points the way
  detours off their path toward a shelf (discovery) — should be the most delightful animation
     in the game
  stands still, looks left, looks right, wanders (nobody helped them)
  child points at a shelf; the parent's impulse fires for the child's target

WORLD MARKS — the fixture changes, not the shopper:
  empty facing (a visible gap), spoiled item (brown tint #7A5C2E + flies), spill decal with a
  slight sheen, abandoned cart persisting in the aisle as an obstacle until staff clear it,
  a well-faced shelf reading as visibly full, a promo shelf with a physical sign

DELIVER
A) The full bubble sheet at 1x and at 8x, on both a light floor and a dark floor.
B) Animation keyframes: for each behaviour above, 3-5 key poses in a row with frame counts and
   timing, at 16x24 and at 4x. Silhouette must carry the pose — test each by drawing it as a
   pure black shape and confirming it still reads.
C) The world marks, each drawn in its clean and marked state, side by side.
D) A rate-limit study. Rules: one bubble per shopper at a time — the HIGHEST-MAGNITUDE term
   wins, so a shopper who waited too long AND saw a spoiled item shows the QUEUE bubble.
   Maximum 8 bubbles on desktop, 4 on a phone. Beyond the cap, world marks carry the signal.
   Draw a busy phone-scale scene at the cap, and the same scene with the cap removed, to prove
   why the cap exists.
E) A silence study. Mild dissatisfaction is SILENT — the shopper simply comes back less often,
   and the player feels that in trip frequency, not in bubbles. Show a store with a real
   problem that is deliberately not firing tells, and tell me how the player is meant to notice.

CONSTRAINTS
- Locked palette. A bubble uses saturated colour because it is STATE; the frame is warm grey.
- No text inside any bubble, in any language. Symbols only.
- Readable at 1x on a 6-inch screen. If it is not, redesign the symbol, do not enlarge it.
- The bubble must not occlude the shopper's own body — specify the anchor offset.

FINISH WITH a fenced HANDOFF block:
{
  "bubbles": [ { "id": "bubble_clock", "size": [12,12], "frame": [20,20],
                 "anchorOffset": [0,-26], "palette": {"fill":"amber-base","frame":"grey-100",
                 "outline":"grey-900"}, "symbolDescription": "...", "readsAt1x": true } ],
  "animations": [ { "id": "shrug_at_empty_facing", "frames": 5, "msPerFrame": 0,
                    "loop": false, "poses": ["...","..."], "silhouettePasses": true } ],
  "worldMarks": [ { "id": "spoiled", "appliesTo": "shelf_basic", "treatment": "...",
                    "particle": "particle_flies" } ],
  "rateLimit": { "compact": 4, "regular": 8, "tieBreak": "highest magnitude wins" }
}
```

**Good output looks like:** the shrug-at-empty-facing keyframes being unmistakable in
silhouette, and a silence study that has a real answer rather than "add a bubble".

---

# Prompt 5 — The Shopper & Staff Cast

Seven household segments, one 16x24 base sprite, seven palettes. This is the single largest
cost saving in the project — the authentic 16-bit technique of palette swapping.

**Attach:** `reference/05-cast-sheet/` — small-format character sheets, crowd photos for
silhouette variety.

**Sends:** Game · Idiom · Projection · Palette

```
Design the character cast for Shelf Life at 16x24px, built for palette swapping.

THE SEGMENTS. Each is a household type in the store-choice model, with a real behavioural
signature the art must express:
  priceHunter ..... weights price 0.9, quality 0.1. Compares tags. Buys the markdown.
  convenience ..... weights travel cost 0.9. In and out. Small basket, high frequency.
  family .......... the neutral segment. Balanced weights, biggest basket, often has a child.
  foodie .......... weights quality 0.9 and assortment 0.7, price 0.1. Browses. Detours.
                    The discovery-sparkle segment.
  bulk ............ consumption multiplier 1.6. Enormous basket, infrequent trips.
  senior .......... nostalgia-loyal, price-insensitive, values service. Slower walk speed.
  student ......... price-sensitive, small basket, odd hours.
Plus STAFF: cashier, stocker, and one manager, states idle / walk, and a slumped idle for low
morale — unhappy staff must be visible on the floor without opening a panel.

THE TECHNIQUE
One 16x24 base body, drawn once, plus a small number of accessory overlays, recoloured per
segment by remapping palette NAMES (not hex codes) at build time. Tell me exactly:
- What is shared across all seven (the base body, its proportions, the walk cycle)
- What differs per segment: which palette entries are remapped, and which accessory or
  silhouette modifier is added. Keep accessories to at most two per segment.
- How to keep seven segments distinguishable at 1x on a phone WITHOUT relying on colour alone,
  since a colourblind player and a zoomed-out player both lose colour first. Silhouette and
  motion are the honest channels — use them.

DELIVER
A) The base body: front, back, and side, at 1x and 8x, with the walk cycle keyframes.
B) All seven segments in a row, at 1x and 8x, each with its palette listed by NAME
   (skin / hair / shirt / trousers / accessory) mapped to entries in the locked palette.
C) The same row rendered as pure black silhouettes. If two are indistinguishable, fix them
   before showing me and say what you changed.
D) The cart / basket / armful states, since basket size is a segment signature: bulk pushes a
   loaded flatbed, convenience carries an armful, family pushes a full cart with a child.
E) Staff, including the low-morale slumped idle beside the normal idle.
F) A crowd test: 18 mixed shoppers at phone scale on a store floor, proving the cast reads as a
   varied crowd and not as one repeated sprite.

CONSTRAINTS
- 16x24px, locked palette, 1px dark outline, orthogonal 3/4 to match the world.
- Skin and hair come from the amber and grey ramps so shoppers sit in the same world as the
  shelves rather than looking pasted on. Propose the skin range; keep it varied and warm.
- No faces beyond 2-3 pixels of feature. Expression is carried by the BUBBLE and the POSE.
- No brands, no slogans, no readable text on clothing.

FINISH WITH a fenced HANDOFF block:
{
  "base": { "size": [16,24], "walkFrames": 0, "directions": ["front","back","side"] },
  "segments": [ { "id": "foodie", "paletteMap": { "shirt": "green-base", "trousers": "grey-600",
                  "hair": "hair", "skin": "skin", "accessory": "violet-light" },
                  "accessories": ["tote"], "silhouetteModifier": "...",
                  "carryState": "basket", "walkSpeedRelative": 1.0 } ],
  "staff": [ { "id": "cashier", "states": ["idle","walk","slumped_idle"], "paletteMap": {} } ],
  "silhouetteCollisions": []
}
```

**Good output looks like:** `silhouetteCollisions` empty, and the crowd test reading as a crowd.
The palette maps should be pasteable into the `palettes` block of `content/asset-manifest.json`.

---

# Prompt 6 — The Responsive HUD

One HUD, two breakpoints, designed compact-first. This is the prompt that decides what the game
*feels* like to hold.

**Attach:** `reference/06-hud-responsive/` — mobile game HUDs you like, plus screenshots of the
current build at both sizes.

**Sends:** Game · Idiom · Palette · Platform

```
Design the in-game HUD for Shelf Life at both breakpoints. Design the PHONE FIRST and derive
the desktop from it — not the other way around. I will reject a desktop-first answer.

WHAT THE HUD MUST EXPOSE, ranked by how often a player needs it:
1. Time & speed control — sim day, clock, pause / 1x / 2x / 3x. The most-touched control.
2. Cash on hand, and today's net delta
3. The active chapter objective, with progress (chapters are 10-15 minutes of real play)
4. An advisor alert channel — 0-3 pending one-sentence alerts, each with a "Show me" action
5. Entry to: Build mode, Pricing, Ordering, Staff, Reports
6. The rival you are currently facing, and your share against theirs
7. Alert state for the store's live problems: spoilage, out-of-stocks, queue length, spills

CONSTRAINTS THAT DECIDE THE LAYOUT
- Compact = 390x844. One top bar plus one bottom action bar. Panels are BOTTOM SHEETS.
- Nothing interactive in the bottom 34px. Nothing under the notch. Canvas goes full-bleed
  beneath both; controls do not.
- 44px minimum hit target at BOTH sizes, including on the top bar.
- The store must stay visible. On a phone, chrome may cover at most ~30% of the screen with a
  sheet open at its default detent. State the percentage you used.
- Hover is never load-bearing. Every tooltip is a tap-to-open popover.
- Numbers are monospace. Every KPI shows a benchmark or a 7-day trailing comparison beside it —
  a bare number is a bug.
- UI chrome uses ONLY the warm-grey ramp. Saturated colour in the UI means data or state, never
  decoration. Never overload the red accent to mean "good".
- The UI barely animates; the world does.

DELIVER, AS ANNOTATED LAYOUT IMAGES:
A) Compact, 390x844, portrait, THREE states: (1) clean play, no panel; (2) an advisor alert
   present; (3) a bottom sheet open at its default detent over a live store.
B) Regular, 1440x900, the same three states, showing how each compact element expands rather
   than being replaced. Where a compact bottom sheet becomes a docked panel, show both and draw
   the correspondence.
C) A component inventory: top bar, action bar, stat tile with benchmark slot, advisor card,
   bottom sheet with detents, popover, speed control, alert pill, tab bar. Each drawn at rest /
   pressed / disabled / alert, with the 44px hit target outlined in a contrasting colour so I
   can verify it by eye.
D) A one-thumb reachability map of the compact layout: mark what a right-handed thumb reaches
   without shifting grip, and justify every control that falls outside it.

Draw the UI in the 16-bit console idiom to match the world: 9-slice panels with a 1px dark
outline and a 2-value bevel, bitmap-styled type, restrained radii. It should look like it
belongs on the same screen as the store, not like a web app floating above it.

IF I ATTACHED IMAGES: take information density, control grouping, and sheet behaviour from
them. Ignore their colour and their brand.

THEN ANSWER:
- What did you cut from the phone layout, and where did it go instead?
- Which single control is most likely to be mis-tapped, and what did you do about it?
- If a player opens the game for the first time on a phone, what do they touch first, and how
  does the layout make that obvious without a tutorial overlay?

FINISH WITH a fenced HANDOFF block:
{
  "compact": { "topBarHeight": 0, "actionBarHeight": 0, "sheetDetents": ["...","..."],
               "worldVisiblePctWithSheetOpen": 0, "safeAreaHandling": "..." },
  "regular": { "panelWidths": {}, "dockedVsFloating": "..." },
  "components": [ { "name": "statTile", "compact": [w,h], "regular": [w,h],
                    "tokens": { "bg": "surface", "border": "line", "value": "ink",
                                "benchmark": "inkMuted" },
                    "states": ["rest","pressed","disabled","alert"] } ],
  "hitTargetViolations": [],
  "firstTouchTarget": "..."
}
```

**Good output looks like:** `hitTargetViolations` empty, `worldVisiblePctWithSheetOpen` ≥ 60,
and a component inventory you can implement panel-by-panel in `src/ui/`.

---

# Prompt 7 — Build & Planogram Mode

Layout *is* the strategy in this game — path exposure drives impulse buys. The build UI is
therefore a core gameplay screen, not a settings screen.

**Attach:** `reference/07-build-mode/` — build modes from other management games, plus the
current `BuildModePanel` screenshot.

**Sends:** Game · Idiom · Projection · Palette · Platform

```
Design build mode for Shelf Life: the screen where the player places fixtures, and where the
floor plan becomes the strategy.

WHAT MAKES THIS DIFFERENT FROM A GENERIC BUILD UI
Shopper paths are simulated. Moving the milk changes which shelves people walk past, which
changes impulse purchases, which changes revenue. The player must FEEL that, and the design
rule is that they should never be told "path exposure increased 12%" — they should notice that
moving the milk made the middle aisles look busier. A congestion heatmap ships as a player-
facing layout tool for exactly this reason.

DESIGN THESE, PHONE FIRST:
1. The fixture palette. On compact it is a horizontally scrolling tray; on regular it can be a
   docked grid. Show category grouping, locked vs unlocked fixtures, cost per fixture, and how
   a fixture is picked up.
2. Placement feedback. A ghost fixture snapped to the 32px grid, with a valid state and an
   invalid state (blocked, too close to a wall, blocks a fire lane). Show the cursor_tile
   valid/invalid treatment. This must read WITHOUT colour alone — some players are colourblind.
3. Drag, rotate (2 rotations only), and delete, as touch gestures. Specify every gesture: tap,
   drag, long-press, pinch. There are no hover states and no right-click.
4. The selected-fixture action bar: what actions, in what order, at 44px each, and where it
   sits so it never covers the fixture being edited on a 390px-wide screen.
5. The congestion heatmap overlay: how a walked path renders over the floor without destroying
   the store's readability, and how the player toggles it with one tap. Show the store with
   the overlay on and off.
6. A before/after pair that teaches the mechanic visually: the same store with the milk at the
   back versus the milk near the entrance, with the heatmap showing the difference. This pair
   is the single most important image in this prompt.
7. The commit/cancel model: does the player pay per placement, or stage a plan and commit? Pick
   one, argue for it in three sentences, and design the affordance for it.

CONSTRAINTS
- 32px grid, orthogonal 3/4, locked palette, 16-bit UI chrome that matches the world.
- 44px targets. Nothing in the bottom 34px. The tray must not cover the tile being placed.
- Two rotations per fixture, maximum.
- The world stays visible while building. Building is done LOOKING AT THE STORE.

IF I ATTACHED IMAGES: take tray ergonomics and placement-feedback conventions from them.

FINISH WITH a fenced HANDOFF block:
{
  "gestures": { "tap": "...", "drag": "...", "longpress": "...", "pinch": "...",
                "twoFingerDrag": "..." },
  "placementStates": [ { "state": "valid", "cursorTreatment": "...", "nonColorCue": "..." } ],
  "trayCompact": { "height": 0, "itemSize": 0, "scroll": "horizontal" },
  "heatmap": { "colorRamp": ["..."], "opacity": 0.0, "toggle": "..." },
  "commitModel": "immediate | staged",
  "actionBar": { "actions": ["..."], "placementRule": "..." }
}
```

**Good output looks like:** the before/after milk pair actually teaching the mechanic, and a
gesture table with no entry that requires hover or a second pointer button.

---

# Prompt 8 — Advisors & the KPI System

The load-bearing bridge between "deep sim" and "gentle surface". Get this wrong and the game is
either a spreadsheet or a mystery.

**Attach:** `reference/08-advisors-kpi/` — dashboards, stat tiles, sparklines, portrait-driven
dialogue UIs.

**Sends:** Game · Idiom · Palette · Platform

```
Design the advisor system and the KPI/drilldown system for Shelf Life.

THE ADVISORS
A small cast who translate the simulation into ONE SENTENCE, one suggested action, and a
"Show me" button that opens the relevant drilldown. Depth is always exactly one click away —
never zero, never five. The canonical example:

  Diane (Accountant): "Dairy is bleeding. You're marking down 40% of the milk before it sells."
  [Show me] [Order less milk]

Design three advisors — a store manager, an accountant, and a rival scout. For each:
- A 16-bit portrait (bust, roughly 48x48 and 32x32, locked palette, readable at both sizes)
  with 4 expressions: neutral, concerned, pleased, alarmed. Expression is set by the severity
  of what they are reporting, and it is the fastest read on the screen.
- A voice: how their sentences differ. The accountant is precise and blunt; the manager is
  about people and the floor; the scout is about the rival. Write 5 example lines each, drawn
  from real mechanics: spoilage, markdown rate, queue balk rate, staff morale, out-of-stocks,
  loyalty decay, a rival price cut, a rival promotion.
- Their alert card, drawn at 390px wide and at desktop width, at three severities.

RULES FOR THE ADVISOR CARDS
- One sentence. If it needs two, the sentence is wrong.
- Exactly one "Show me" and at most one direct action button. Both 44px.
- Advisors never stack more than three cards. Beyond that they queue.
- An advisor must never appear as a modal that blocks the store.

THE KPI SYSTEM
- Design the stat tile. It has a REQUIRED benchmark slot: a rival's number or the store's own
  7-day trailing average, always present, always in neutral grey, never in a series colour. A
  bare number is a bug. Show the tile in: better-than-benchmark, worse, and at-parity states.
- Design the drilldown that "Show me" opens: one screen deep, showing the inputs to the number
  the advisor named. Use the categorical series order blue #2C6BA8, green #1F7A4D,
  amber #D9931B, red #E23D2E, violet #6B4A9E, grey #8A867C, so a category keeps one colour
  everywhere in the game. Benchmark lines are always #8A867C. Grid lines #D6D3CB.
- Design the compact form of the drilldown: a multi-column dashboard becomes a tabbed single
  column. Show it at 390x844.
- Pick the chart forms. For each KPI below, name the form and justify it in one line:
  daily revenue vs rival; category margin; spoilage rate by department; queue wait
  distribution; loyalty by household segment; share of catchment over time.
  Prefer the boring correct form over the impressive one.

Draw all of it in the 16-bit idiom — bitmap type, 9-slice panels, 1px outlines — but keep the
charts legible before they are pretty. Numbers are monospace.

FINISH WITH a fenced HANDOFF block:
{
  "advisors": [ { "id": "accountant", "name": "Diane", "domain": "...",
                  "expressions": ["neutral","concerned","pleased","alarmed"],
                  "portraitSizes": [[48,48],[32,32]], "voiceRule": "...",
                  "exampleLines": ["..."] } ],
  "statTile": { "compact": [w,h], "regular": [w,h], "slots": ["label","value","benchmark","delta"],
                "benchmarkStyle": { "color": "#8A867C", "weight": "regular" } },
  "chartForms": { "revenueVsRival": "line + benchmark line", ... },
  "drilldownDepth": 1,
  "compactPattern": "tabs"
}
```

**Good output looks like:** advisor lines you would actually ship, and a stat tile where you
cannot physically render it without supplying a benchmark.

---

# Prompt 9 — The Rival Brand Kit

Ten fictional chains, each satirizing a retail *strategy*. This prompt has the strictest legal
constraints in the file — read `docs/legal/parody-review.md` before you run it, and log the
results there before anything is implemented.

**Attach:** `reference/09-rival-brands/` — logo *geometry* studies and retro grocery signage.
**Do not attach photographs of real chain logos.** See the guardrail clause in the prompt.

**Sends:** Game · Idiom · Projection · Palette · Legal

```
Design the brand identity kit for the ten fictional rival chains in Shelf Life.

THE PARODY FRAMEWORK — read before designing anything
Parody works when the target is EVOKED AND COMMENTED ON, not COPIED. The failure mode is not
"you made fun of them"; it is "a shopper could mistake yours for theirs." Every name below
already passes a four-part test: distinct wordmark, distinct trade dress, punchline present,
and category-level (it could satirize three real chains, not one). Your job is to give each a
visual identity that keeps passing that test.

HARD RULES — a violation fails the whole deliverable:
- Never reproduce, adapt, distort, or "reference" a real retailer's logo, wordmark, typeface,
  mascot, slogan, or colour pairing that functions as trade dress.
- Design original logo geometry from scratch. If a mark you draw would be recognised as a real
  chain's, it is wrong even if the name is different — trade dress travels without the name.
- Satirize the STRATEGY, never the company's conduct. "They are annoyingly beloved" is safe.
  Contamination, crime, and labour abuse are not.
- No real product brands anywhere in any store frontage you draw.
- If I attached any image containing a real logo, ignore it entirely and say so in your answer.

THE ROSTER. Each is ranked by Community Love (CL), 0-100 — how loyalty-resilient they are.
Each teaches one lesson and has one signature mechanic.
  1  Sav-A-Lott        CL 22  dying deep-discounter; exactly one register ever open
  2  Grocerteria 24    CL 35  24-hour convenience grocer; owns 10pm-6am
  3  BulkHaus Club     CL 48  warehouse membership club; lock-in and a sample corridor
  4  Aldente Markt     CL 55  European hard discounter; 2x cashier speed, 90% private label
  5  Winn-Or-Lose      CL 58  fading regional legacy chain; nostalgia loyalty
  6  Entire Foods      CL 64  premium organic; loses money on ambiance
  7  Hy-Glee           CL 71  employee-owned; relentlessly polite staff, service floor of 80
  8  Wagoner's         CL 80  cathedral-of-groceries destination; pulls shoppers from outside
                              your catchment
  9  Moo-cee's         CL 87  highway megastore with a mascot; wins on foot traffic, merch,
                              and legendary restrooms. Barely a grocery store.
  10 Trailblazer Jim's CL 94  cult small-format grocer; immune to price war, quarterly drops
  W1 Sprawl-Mart              world-tier hypermarket; a permanent share sink, never beatable
  W2 PrimeFresh               world-tier delivery platform; undercuts on price-sensitive
                              households

FOR EACH CHAIN, DELIVER:
1. An original 3-colour identity palette. Anchor it in the game's product family
   (red / green / amber / blue / violet) so the rivals live in one world, but each must be
   instantly separable from the other nine AND from any real chain. State the three hexes.
   The violet #6B4A9E is the default rival colour — do not give it to more than one of them.
2. A logo mark, drawn as 16-bit pixel art at 32x32 and 64x64, plus a wordmark treatment. The
   mark must read at 32x32 on a phone, which means one idea, not three.
3. A storefront: their building exterior in the game's orthogonal 3/4 idiom, as it appears on
   the catchment map. Architecture is characterisation — the discounter's box, the club's
   warehouse, the cult grocer's small warm storefront.
4. A one-line taunt they say at a chapter boundary, in their voice.
5. Their interior signature: the ONE thing a player would notice if they walked into that
   store. For Sav-A-Lott it is the single open register with a queue out the door.
6. A visual escalation note: as CL rises up the ladder, the identities should feel more
   confident and more coherent, so the player can SEE that they are climbing.

ALSO DELIVER: one comparison sheet with all twelve marks at 32x32 in a grid, on both light and
dark backgrounds, to prove they are separable at the size they will actually appear.

FINISH WITH a fenced HANDOFF block:
[ { "id": "aldente-markt", "level": 4, "communityLove": 55,
    "identity": { "primary": "#...", "secondary": "#...", "accent": "#..." },
    "logoConcept": "one sentence, one idea",
    "architecture": "...", "interiorSignature": "...", "taunt": "...",
    "archetypeSatirized": "category-level description, never a company name",
    "borrowed": "strategy only: ...", "notBorrowed": "name, logo, palette, slogan, trade dress",
    "nameTest": { "distinctWordmark": true, "distinctTradeDress": true,
                  "punchlinePresent": true, "categoryLevel": true } } ]
```

**Good output looks like:** twelve marks that are separable at 32x32 on both backgrounds, and a
HANDOFF whose `archetypeSatirized` fields never name a real company. Copy the HANDOFF into
`docs/legal/parody-review.md` **before** any of it is implemented — that log is a `CLAUDE.md`
requirement, not a formality.

---

# Prompt 10 — Title Screen, Chapter Cards & Key Art

The hero-art route (ADR 0006): generated images, quantized to the locked palette, used only for
the title screen, boss portraits, and signage. Also the marketing surface.

**Attach:** `reference/10-title-and-key-art/` — title screens, store capsules, App Store shots.

**Sends:** Game · Idiom · Projection · Palette · Platform · Legal

```
Design the framing art for Shelf Life: the first thing a player sees and the images that sell
the game.

1. THE TITLE SCREEN
   A 16-bit title screen in the locked palette. The game's hook is: every tycoon game makes you
   fight a bigger competitor — this one makes you fight a BETTER-LIKED one. The image should
   carry warmth and a little menace: your small store, and something beloved across the street.
   Design at 390x844 portrait FIRST, then 1440x900. Include: the logotype, Continue / New Game /
   Sandbox / Scenarios / Daily Challenge, and a settings affordance. All targets 44px; nothing
   in the bottom 34px.
   Include the required legal line, styled as part of the composition rather than bolted on:
     "All chains, brands, and products in this game are fictional parodies. Any resemblance to
      actual retailers is satirical."

2. THE LOGOTYPE
   "SHELF LIFE" as a wordmark, in the signage voice: heavy, tight, supermarket wayfinding.
   Deliver a pixel version at 3 sizes (title, header, favicon-scale 32x32) and describe the
   construction so it can be rebuilt as a bitmap font or a sprite. The pun should be visible —
   "shelf life" is both the product-expiry mechanic and the life you spend in the store — but
   make the joke by construction, not by adding a clock.

3. CHAPTER CARDS
   Each boss level is 3-5 chapters of 10-15 real minutes, each with an intro and outro card and
   a hard autosave boundary. Design the intro card (objective, the rival, the stakes) and the
   outro card (what changed, what you unlocked, one advisor line). Both at 390x844 and
   1440x900. These are the game's rhythm — a player should be able to put the phone down after
   one and feel they finished something. Make them feel like a chapter break, not a loading
   screen.

4. THE BOSS INTRO
   The card that introduces a rival at the start of a level: their mark, their Community Love
   score, their signature mechanic stated in one player-facing sentence (never a formula), and
   their taunt. Design one, using Aldente Markt (CL 55, 2x cashier throughput, 90% private
   label) as the worked example.

5. KEY ART
   One landscape marketing image that communicates the hook to someone who has never heard of
   the game, WITHOUT text. Then the same composition cropped for: a 16:9 landing-page hero, a
   1:1 social card, and a phone-screenshot frame. State what each crop loses.

6. THE FIRST SCREENSHOT
   If a store page could show exactly one screenshot, what is in it? Draw it. Argue in three
   sentences why that frame sells this game rather than any other supermarket game.

CONSTRAINTS
- Locked palette throughout. Warm-grey structure, saturated goods. The hero art is quantized to
  this palette at build time, so a design that depends on gradients or on colours outside the
  ramp will not survive.
- 16-bit idiom, but hero art may use more detail than a 32px tile — state the pixel density you
  are working at so it can be quantized consistently.
- No real brands, no real logos, no text that isn't ours.

FINISH WITH a fenced HANDOFF block:
{
  "logotype": { "construction": "...", "sizes": [[256,64],[96,24],[32,32]],
                "palette": ["...","..."] },
  "titleScreen": { "compact": { "menuOrder": ["..."], "safeAreaNotes": "..." },
                   "regular": {} },
  "chapterCard": { "intro": { "slots": ["..."] }, "outro": { "slots": ["..."] } },
  "bossIntro": { "slots": ["mark","communityLove","mechanicSentence","taunt"] },
  "keyArt": { "concept": "...", "crops": { "16:9": "...", "1:1": "...", "phone": "..." } },
  "firstScreenshot": { "contents": ["..."], "argument": "..." },
  "heroArtPixelDensity": "1x | 2x | 3x"
}
```

**Good output looks like:** a title screen that works in portrait, and a first-screenshot
argument that names something *only this game* has — the rival benchmark, the walk-out, the
loyalty curve — rather than "colourful pixel art".

---

## After Gemini answers

1. **Paste the HANDOFF block back to Claude Code.** It is JSON on purpose — the token deltas,
   manifest entries, and palette maps are directly implementable.
2. **Token changes go through `content/design/tokens.json` only.** A hardcoded hex in `src/ui`
   or `landing/` fails CI. Track B owns that file (ADR 0007).
3. **New art gets declared in `content/asset-manifest.json` before it exists.** Missing art
   renders as a labelled placeholder at the exact declared size, so nothing blocks.
4. **Sprites are authored as character grids** in `tools/art/sprites/*.py` and compiled with
   `npm run art:build`. Never hand-edit a PNG.
5. **Rivals get logged in `docs/legal/parody-review.md` before implementation.** Not after.
6. **Third-party reference that ships gets recorded in `ATTRIBUTION.md`** when it is added.
7. **Run `npm run verify`.** If a golden hash moves because of an art change, that is a boundary
   violation to fix, never a re-baseline (ADR 0007).

## Prompt maintenance

These prompts encode the current design. When a rule changes — a new breakpoint, a palette
change, a new rival, a projection decision — update the shared block that carries it, because
every prompt that names it inherits the change. The prompts are downstream of `PLAN.md`, `CLAUDE.md`, ADRs 0004–0007, and
`docs/design/gentle-surface.md`; if they disagree, those win.
