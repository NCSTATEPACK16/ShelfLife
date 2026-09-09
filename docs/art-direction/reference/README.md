# Reference images — upload folder

Drop your reference photos and screenshots here, then attach them to the matching Gemini prompt
in `../gemini-concept-prompts.md`. One folder per prompt; the numbers line up.

| Folder | Feeds prompt | What to put in it |
|---|---|---|
| `01-style-bible/` | 1 — Art Direction Board | 16-bit games you love the *look* of; any mood images for "warm, calm, legible" |
| `02-photo-vocabulary/` | 2 — Archetype → Store Vocabulary | Optional only — this prompt no longer needs photos, it reasons from known US grocery-format archetypes. Drop any 16-bit style anchors here instead if you want one |
| `03-store-scene/` | 3 — The Store Scene | Overhead/high-angle store shots, store floor plans, planograms |
| `04-gentle-surface/` | 4 — Gentle Surface Tells | Emote/bubble sheets, sim-game reaction icons |
| `05-cast-sheet/` | 5 — Shopper & Staff Cast | Character sprite sheets at small sizes; real crowd photos for silhouette variety |
| `06-hud-responsive/` | 6 — The Responsive HUD | Screenshots of mobile game HUDs you like; the current build at 390×844 and 1440×900 |
| `07-build-mode/` | 7 — Build & Planogram Mode | Build-mode UIs from other tycoon/city games; the current `BuildModePanel` screenshot |
| `08-advisors-kpi/` | 8 — Advisors & KPI System | Dashboards, stat tiles, sparkline treatments, character-portrait dialogue UIs |
| `09-rival-brands/` | 9 — Rival Brand Kit | Logo-*geometry* studies, sign shapes, retro grocery signage — see the legal note below |
| `10-title-and-key-art/` | 10 — Title Screen & Key Art | Title screens, Steam capsules, App Store screenshots you admire |

From prompt 3 onward, also attach your kept winners from 1 and 2: 1 carries the objects, 2 carries
the world.

## Naming

`NN-short-description.jpg` — e.g. `02-endcap-cooler-wide.jpg`. The number is just ordering within
the folder. Keep files under ~4 MB so they upload fast.

## Two rules that are not optional

1. **Photos are for geometry, light, and density — never for trade dress.**
   `CLAUDE.md` §2 / `docs/legal/parody-review.md`: you may use a photo of a real store to study
   shelf proportions, cooler shapes, aisle widths, sign placement, and how full a facing looks.
   You may **never** use one to derive a rival's wordmark, logo geometry, or color pairing. If a
   real chain's logo is visible in a photo you upload, say so in the prompt and tell Gemini to
   ignore it. Placeholders leak.

2. **Color proposals are deltas, not replacements.**
   `content/design/tokens.json` is the single source of color truth for the game world, the UI,
   and the landing page, and `tools/check-tokens.mjs` fails CI on a hardcoded hex. Every prompt
   below asks Gemini to return *proposed changes to named tokens*, never a free-floating palette.

## This folder is untracked by default

Reference photos are inputs, not assets. If you want to keep one permanently, record it in
`ATTRIBUTION.md` first (`CLAUDE.md`, Content rules).
