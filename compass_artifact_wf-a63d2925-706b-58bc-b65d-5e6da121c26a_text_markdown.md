# ShelfLife — Master Plan & AI Context (PLAN.md / CLAUDE.md)

> This document is the single source of truth for the ShelfLife project. It doubles as the CLAUDE.md context file. All AI coding agents MUST read and obey this document before making changes. When code and this document disagree, this document wins until it is amended via ADR.

**Tech stack (confirmed, do not substitute):** Phaser 4.x (April 2026 release, node-based WebGL renderer) + TypeScript + Vite; Supabase backend; Netlify hosting; Capacitor + Xcode for iOS; Blender → Aseprite → Tiled asset pipeline.

**Phaser 4 constraint of record:** Phaser 4's GPU tilemap layers (`TilemapGPULayer`) are orthographic-only; they do **not** support isometric/hex projection. ShelfLife therefore uses a **custom depth-sorted isometric sprite renderer**, not `TilemapLayer`, for the store floor. Phaser 4's new node-based renderer does bring context restoration out of the box, which matters for WKWebView backgrounding on iOS.

---

## 1. THE RULES OF ENGAGEMENT (Strict AI Constraints)

These are enforceable, checkable directives. CI enforces them; the AI must self-enforce them.

### 1.1 Binary files are never edited directly
- The AI MUST NOT create, hand-edit, or hex-patch binary assets: `.blend`, `.aseprite`/`.ase`, `.png`, `.tmx` (when binary-encoded), `.ogg`, `.mp3`, `.ttf`, `.webp`.
- Binaries are OUTPUTS. To change a binary, the AI edits the text-based source-of-truth or the CLI script that regenerates it: Blender `.py` scripts, Aseprite/packer export scripts, Tiled `.tmx`/`.tsx` (XML) or `.json` sources, and the pipeline manifest JSON.
- Checkable: a pre-commit hook and CI job diff staged binaries; if a binary changed without a corresponding change to a source/script file, the build fails.

### 1.2 Text-based JSON serialization is mandatory for state
- All game state MUST be serializable to/from plain JSON without a GUI editor.
- No opaque binary save blobs. If compression is used for transport, the canonical in-memory and on-disk dev format is still JSON (compression is a transport wrapper only, applied in a Web Worker).
- Every persisted structure has a Zod schema and a `saveVersion` integer.

### 1.3 Strict TypeScript
- `tsconfig` MUST set: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"noImplicitOverride": true`, `"noFallthroughCasesInSwitch": true`, `"forceConsistentCasingInFileNames": true`.
- `any` is banned (`@typescript-eslint/no-explicit-any: error`). Use `unknown` + narrowing.
- All state unions MUST be discriminated unions with a literal `type`/`kind` tag.
- Exhaustive switches MUST use a `never` assertion in the default branch.

### 1.4 Determinism rules (simulation core)
- The simulation core MUST be deterministic: identical seed + identical command log ⇒ identical world-state hash.
- BANNED inside `/src/sim/**`: `Math.random`, `Date.now`, `performance.now`, `crypto.getRandomValues`, `setTimeout`/`setInterval`, `requestAnimationFrame`, and any wall-clock or ambient I/O.
- RNG comes only from injected, seeded PRNG streams (one stream per subsystem). Time comes only from the fixed-timestep tick counter passed in.
- Checkable: an ESLint `no-restricted-globals`/`no-restricted-properties` ruleset scoped to `/src/sim/**` fails the build on any banned identifier.

### 1.5 Dependency-boundary rules (the headless core)
- `/src/sim/**` (the simulation core) MUST import NOTHING from: `phaser`, the DOM, `window`, `document`, `@supabase/*`, `@capacitor/*`, IndexedDB, or `fetch`. It is a pure, headless, portable TypeScript library.
- Allowed imports for the core: other `/src/sim` modules, `/src/content` (data types), and small pure utilities.
- Rendering (`/src/render`), persistence (`/src/net`, `/src/storage`), and platform (`/src/platform`) depend on the core, never the reverse.
- Checkable: `eslint-plugin-boundaries` (or `dependency-cruiser`) encodes the layering; a violated import fails CI.

### 1.6 Magic numbers live in data, not code
- Tunable gameplay constants (prices, spoilage rates, lead times, loyalty decay, camera angle, tile dimensions, offline caps) MUST live in `/src/content/**` JSON or remote `economy_config`, not inline in logic.
- Code may contain structural constants (buffer sizes, enum discriminants) but not balance values.

### 1.7 No secrets in the repo
- No service-role keys, API secrets, signing keys, or `.p8`/`.p12` files committed. Only the Supabase anon key and public config may appear in client env (`VITE_` prefix), and even that goes through `.env` files gitignored except `.env.example`.
- Secrets used by CI/Edge Functions live in Netlify/Supabase secret stores.
- Checkable: `gitleaks` runs in CI.

### 1.8 Migration discipline
- Every DB change is a forward-only, timestamped migration in `supabase/migrations/`. No editing applied migrations.
- Every save-format change bumps `saveVersion` and ships a pure migration function `migrateSave(vN → vN+1)` with a golden test fixture.

### 1.9 Filename case discipline (macOS→Linux hazard)
- All asset and import paths MUST match on-disk case exactly. Dev is on case-insensitive macOS; Netlify deploys to case-sensitive Linux. A `Shelf.png` reference to `shelf.png` passes locally and 404s in production.
- Checkable: a CI script verifies every referenced asset path against the real (case-sensitive) filesystem listing and fails on mismatch.

### 1.10 Testability & purity
- All balance/gameplay logic MUST be unit-testable without a renderer or network. If a function needs Phaser or Supabase to be tested, it is in the wrong layer.

### 1.11 ADR requirement
- Any architectural decision (new dependency, boundary change, schema change, algorithm swap) requires a short ADR in `docs/adr/` (see §6). No silent architecture drift.

---

## 2. FOLDER ARCHITECTURE & DATA FLOW

### 2.1 Directory tree

```
shelflife/
├── PLAN.md                      # THIS FILE (also copied as CLAUDE.md)
├── CLAUDE.md                    # → same content as PLAN.md (source of truth for AI)
├── README.md
├── package.json
├── tsconfig.json                # strict, noUncheckedIndexedAccess, etc.
├── vite.config.ts               # dev COOP/COEP headers (if needed), build chunking
├── netlify.toml                 # build + headers + caching (see §5, Appendix A)
├── .eslintrc.cjs                # boundaries + no-restricted-globals for /src/sim
├── .gitattributes               # Git LFS patterns
├── .gitignore
├── .env.example                 # documents required VITE_ vars (no secrets)
│
├── assets/
│   ├── raw/                     # Blender EXPORTS (pre-rendered iso PNGs) — GENERATED, Git LFS
│   │   └── <entity>/<state>/<dir>/frame_####.png
│   ├── packed/                  # Aseprite/packer OUTPUT atlases (.png + .json) — GENERATED
│   │   └── <atlas>.png, <atlas>.json
│   ├── maps/                    # Tiled maps: .tmx committed, .json generated
│   │   ├── src/                 # .tmx / .tsx (XML, committed, source of truth)
│   │   └── export/              # .json (generated)
│   └── audio/                   # source + packed audio
│
├── art-src/                     # AUTHORED sources (committed, Git LFS)
│   ├── blend/                   # .blend files (LFS) + per-model render config JSON
│   └── aseprite/                # .aseprite files (LFS) if hand-drawn
│
├── content/                     # DATA-DRIVEN game content (committed, plain JSON/TS)
│   ├── skus/                    # product definitions, spoilage curves, margins
│   ├── fixtures/                # shelves/registers/coolers footprints & costs
│   ├── rivals/                  # parody chains: love, loyalty, segments per level
│   ├── economy/                 # default economy_config (mirrors Supabase remote config)
│   ├── levels/                  # level ladder, acceptance thresholds
│   └── asset-manifest.json      # drives loading + validation + placeholders
│
├── src/
│   ├── sim/                     # HEADLESS DETERMINISTIC CORE — no Phaser/DOM/Supabase
│   │   ├── tick.ts              # fixed-timestep loop
│   │   ├── rng.ts               # seeded PRNG streams
│   │   ├── world.ts             # world state + world-state hashing
│   │   ├── commands.ts          # command types + command log + replay
│   │   ├── systems/             # placement, pathfinding, inventory, market, offline
│   │   └── hash.ts              # deterministic serialization hash (golden tests)
│   ├── state/                   # state types, discriminated unions, Zod schemas, migrations
│   ├── systems/                 # engine-facing system glue (core → render)
│   ├── render/                  # Phaser 4 scenes, custom iso depth-sort renderer
│   │   └── iso/                 # projection math, depth sort, sprite pooling
│   ├── loaders/                 # Aseprite JSON + Tiled JSON parsers + Zod validation
│   ├── storage/                 # IndexedDB local-first store (Dexie), dirty-flag changesets
│   ├── net/                     # Supabase client, sync engine, retry queue
│   ├── platform/                # Capacitor bridges, safe-area, audio unlock, reachability
│   ├── workers/                 # Web Workers (serialize/compress, offline catch-up sim)
│   ├── ui/                      # HUD/menus (DOM or Phaser UI)
│   └── main.ts
│
├── tools/                       # PIPELINE SCRIPTS (text source of truth for binaries)
│   ├── blender/                 # bpy render scripts (render_isos.py, config loaders)
│   ├── pack/                    # Aseprite/free-tex-packer invocation scripts
│   ├── tiled/                   # tiled --export-map wrappers
│   ├── validate/                # asset dimension/anchor/case validators
│   └── manifest/                # asset manifest generator + placeholder generator
│
├── tests/
│   ├── unit/
│   ├── golden/                  # world-state hash fixtures, save-migration fixtures
│   └── montecarlo/              # headless balance harness runs
│
├── supabase/
│   ├── migrations/              # forward-only SQL
│   ├── functions/               # Edge Functions (Deno): offline validation, leaderboard
│   └── config.toml
│
├── ios/                         # Capacitor iOS project (Xcode)
│   └── App/
│
├── docs/
│   ├── adr/                     # Architecture Decision Records
│   └── runbooks/
│
└── .github/workflows/           # CI: typecheck, lint, boundaries, asset validation, tests
```

### 2.2 Committed vs generated

| Path | Committed? | Notes |
|---|---|---|
| `art-src/blend/**`, `art-src/aseprite/**` | Yes (Git LFS) | Authored binary sources of truth |
| `assets/raw/**` | Generated; NOT committed by default (LFS if CI needs them without Blender) | Blender render outputs |
| `assets/packed/**` | **Committed (LFS)** — see decision | Atlases the web build needs; keeps Netlify from needing Aseprite |
| `assets/maps/src/**` (.tmx/.tsx) | Yes | XML source of truth for maps |
| `assets/maps/export/**` (.json) | Generated (may commit for build simplicity) | Engine-consumed |
| `content/**` | Yes | Plain JSON/TS |
| `src/**`, `tools/**`, `tests/**` | Yes | |
| `supabase/migrations/**` | Yes | |
| `.env` | No | Only `.env.example` |

**Decision — commit packed atlases (LFS), do not require Aseprite on Netlify:** Netlify's build image will not have a licensed Aseprite. Rather than fight that, the recommended flow is: the developer runs the pack step locally (or in self-hosted/licensed CI) and commits `assets/packed/**` via Git LFS; Netlify then just runs `vite build`. **Alternative considered:** run the MIT-licensed `free-tex-packer-core` in Netlify CI to avoid committing binaries. **Why the recommendation wins:** it keeps Netlify builds fast and deterministic, sidesteps the Aseprite-in-CI licensing question entirely (§3.4), and atlases change infrequently. If atlas churn becomes high, switch to the `free-tex-packer-core`-in-CI path (§3.6).

### 2.3 Git LFS
- `.gitattributes` tracks: `*.blend`, `*.aseprite`, `*.ase`, `assets/packed/**/*.png`, `assets/raw/**/*.png` (if committed), `*.ogg`, `*.mp3`, `*.ttf`.
- Rationale: these are large and/or binary; keeping them in normal git bloats history and breaks diffs. LFS keeps clones lean.

### 2.4 Data-flow diagram

```
 AUTHORED SOURCES                PIPELINE (tools/)                 ENGINE (src/)              CLOUD (Supabase)
 ┌───────────────┐   bpy CLI    ┌──────────────┐  Aseprite/     ┌──────────────┐          ┌──────────────┐
 │ .blend models │ ───────────▶ │ assets/raw   │  free-tex-     │ loaders/     │          │ Postgres +   │
 │ + render cfg  │  headless    │ iso PNG frames│  packer ─────▶ │ Zod-validate │          │ RLS + Edge   │
 └───────────────┘  render      └──────────────┘  --sheet/--data│ atlas JSON   │          │ Functions    │
                                        │                        │              │          └──────┬───────┘
 ┌───────────────┐  tiled        ┌──────────────┐               │ render/iso   │                 │
 │ .tmx maps     │ --export-map  │ maps/export  │ ────────────▶ │ depth-sort   │                 │
 │ (XML source)  │ ────────────▶ │ .json        │  Zod-validate │ renderer     │                 │
 └───────────────┘               └──────────────┘               └──────┬───────┘                 │
                                                                        ▼                          │
 ┌───────────────┐                                              ┌──────────────┐  debounced       │
 │ content/*.json│ ───────────────────────────────────────────▶│ sim/ core    │  coalesced       │
 │ economy,skus  │                                              │ (headless,   │  idle-time       │
 └───────────────┘                                              │ deterministic)│  sync           │
                                                                 └──────┬───────┘                 │
                                                                        ▼                          │
                                              ┌──────────────┐   dirty  ┌──────────────┐  Worker   │
                                              │ IndexedDB    │◀─────────│ runtime state│─(compress)▶│
                                              │ (local-first)│  changeset└──────────────┘           │
                                              └──────────────┘                    ▲                 │
                                                                                  └── server-auth ──┘
                                                                                     reconcile (LWW +
                                                                                     server timestamps)
```

Data moves one direction through the pipeline (authored → generated → engine); state moves local-first (runtime → IndexedDB → Supabase) and reconciles back on load with server-authoritative timestamps.

---

## 3. THE PASSIVE ASSET PIPELINE

Goal: an idempotent, cacheable, manifest-driven, placeholder-first pipeline where the AI only ever touches text (scripts + manifest), and binaries regenerate deterministically.

### 3.1 Overview

```
Blender (bpy headless)  →  assets/raw/*.png  →  Aseprite/free-tex-packer  →  assets/packed/*.{png,json}
Tiled (--export-map)    →  assets/maps/export/*.json
Manifest generator      →  content/asset-manifest.json  (drives loading + validation + placeholders)
```

### 3.2 Blender: scripted isometric rendering (conceptual logic)

ShelfLife uses pre-rendered 3D-to-2D dimetric sprites (RCT-style). The camera is a true dimetric/isometric setup rendered with an orthographic camera.

- **Camera setup:** orthographic camera. True isometric is 35.264° elevation; the "2:1 pixel" dimetric look uses ~26.57° = `atan(0.5)`. **ShelfLife standard:** pixel-dimetric at `atan(0.5)` elevation, 45° yaw, orthographic. This constant lives in the render config, not the script.
- **Rotations:** render N directions per placeable that can rotate (typically 4 for shelves/coolers; 1 for symmetric decor). Yaw the object (or orbit the camera) in fixed increments.
- **States & animation:** for animated entities (customers, doors, register), loop frame ranges and render each frame.
- **Batch driver:** a single `render_isos.py` reads a per-model JSON config (`art-src/blend/<model>.render.json`) describing states, directions, frame ranges, output size, and the pixel-dimetric camera preset, then loops and writes PNGs.

**Naming convention (strict, lowercase, case-checked):**
```
assets/raw/<entity>/<state>/<dir>/frame_<####>.png
# e.g. assets/raw/shelf_standard/idle/ne/frame_0000.png
```

**Headless invocation shape** (documented in `tools/blender/README`):
```
blender --background art-src/blend/shelf_standard.blend \
        --python tools/blender/render_isos.py -- \
        --config art-src/blend/shelf_standard.render.json \
        --out assets/raw/shelf_standard
```
- `--background` (`-b`) runs without GUI; args after `--` are passed to the script. **Argument order matters:** the `.blend` and `--python` come before `--`.
- On headless Linux CI, Blender rendering may need a virtual framebuffer (**Xvfb**) or EGL. **Recommendation:** run Blender rendering LOCALLY (the developer authors art anyway) and commit outputs — do not run Blender in Netlify CI.

**Blender MCP note:** community MCP servers — most prominently `ahujasid/blender-mcp` (installed via `uvx blender-mcp` plus an in-Blender addon) — let Claude drive a live Blender session for prompt-assisted modeling. Useful for AUTHORING models interactively; NOT part of the deterministic build. The reproducible pipeline is the bpy CLI script, not MCP. Since the developer authors art themselves, MCP is optional; if used, commit the resulting `.blend` + render config as the source of truth.

### 3.3 Aseprite: CLI packing (when used locally with a license)

Aseprite ships a stable, scriptable CLI. Canonical ShelfLife invocation to produce a Phaser-compatible atlas:

```
aseprite -b \
  assets/raw/shelf_standard/**/*.png \
  --sheet-pack \
  --sheet assets/packed/shelf_standard.png \
  --data assets/packed/shelf_standard.json \
  --format json-array \
  --list-tags --list-layers \
  --trim \
  --border-padding 2 --shape-padding 2 --inner-padding 1 \
  --filename-format '{title}_{tag}_{tagframe}'
```

| Flag | Purpose |
|---|---|
| `-b` / `--batch` | Headless, no UI |
| `--sheet <png>` | Output packed texture |
| `--data <json>` | Output atlas metadata (Phaser reads this) |
| `--format json-array` | Array-of-frames form (easy to iterate; Phaser loads both hash and array) |
| `--sheet-pack` | Rectangle packer; smaller textures, less waste |
| `--list-tags` | Include animation tag ranges (map to Phaser animations) |
| `--list-layers` | Include layer info |
| `--trim` | Trim transparent borders; engine must honor `spriteSourceSize` for anchors |
| `--border-padding/--shape-padding/--inner-padding` | Prevent bleeding between frames under linear filtering |
| `--filename-format` | Stable frame keys so animations resolve deterministically |

**Aseprite JSON shape the loader expects** (frames + meta with `frameTags`, `slices`):
```json
{
  "frames": [
    { "filename": "shelf_standard_idle_0",
      "frame": {"x":0,"y":0,"w":64,"h":96},
      "trimmed": true,
      "spriteSourceSize": {"x":4,"y":6,"w":64,"h":96},
      "sourceSize": {"w":72,"h":108},
      "duration": 100 }
  ],
  "meta": {
    "app":"aseprite","format":"RGBA8888",
    "size":{"w":512,"h":512},
    "scale":"1",
    "frameTags":[{"name":"idle","from":0,"to":3,"direction":"forward"}],
    "slices":[{"name":"anchor","keys":[{"frame":0,"pivot":{"x":0.5,"y":0.9}}]}]
  }
}
```

### 3.4 Aseprite licensing & CI implications (decisive guidance)

Aseprite is proprietary but source-available. The pipeline must respect this:

- Aseprite retained GPLv2 until **v1.1.8 in August 2016**, then switched to a proprietary EULA — developer David Capello announced the change in the Sept 1, 2016 Aseprite Devblog post "New source code license." Its official FAQ states: *"Now you can still download its source code, compile it, and use it for your personal purposes... The only restriction in Aseprite EULA is that you cannot redistribute Aseprite to third parties,"* and *"If you are in a company, you need one license for each developer."*
- The EULA's source-code clause permits compiling/modifying the source only *"for your own personal purpose or to propose a contribution to the SOFTWARE PRODUCT."* It does not explicitly bless automated CI builds, and publicly distributing self-built binaries violates the no-redistribution clause. **Running unpaid, self-compiled Aseprite in a commercial studio's CI is a legal gray area.**
- **Decision: Do NOT run Aseprite in Netlify CI.** Two clean options:
  1. **Recommended:** Buy an Aseprite license (per developer), run the pack step LOCALLY, and commit `assets/packed/**` via Git LFS. Netlify only runs `vite build`. Aseprite's `--sheet/--data --format json-array/json-hash` output is natively Phaser-loadable.
  2. **Fully-open CI path:** use MIT-licensed `free-tex-packer-core` in CI to pack PNG frames into Phaser atlases (§3.6), optionally with LibreSprite (GPLv2) to extract frames from `.aseprite` sources if hand-drawn.

### 3.5 Open-source fallbacks (named, licensed)

| Tool | License | Role | CI-friendly? |
|---|---|---|---|
| **free-tex-packer-core** | MIT | Packs PNG frames → atlas; dedicated Phaser exporters (`PhaserHash`, `PhaserArray`, `Phaser3`) + generic `JsonHash`/`JsonArray`; pure Node/Jimp, no display; `packAsync` | Yes (zero display needed) |
| **LibreSprite** | GPLv2 | Fork of the last GPLv2 Aseprite commit (2016); `--batch --sheet --data --format json-hash/json-array` CLI to export frames from `.aseprite` | Yes, but like Aseprite may need a display backend (xvfb) on Linux |
| **Aseprite** | Proprietary EULA | Best features, native `.ase`, newest CLI | Locally with a paid license; avoid in shared CI |

`free-tex-packer-core` packs already-exported PNG frames (it does **not** read `.ase`), which fits ShelfLife perfectly because our frames come from Blender as PNGs. This makes it the natural CI packer, with Aseprite optional (only for hand-drawn art).

### 3.6 free-tex-packer-core invocation (conceptual, CI path)
`tools/pack/pack.ts` (run under Node): read frame PNGs from `assets/raw/<entity>/...`, feed buffers to `free-tex-packer-core` with options `{ exporter: 'Phaser3', width: 2048, height: 2048, allowRotation: false, allowTrim: true, detectIdentical: true, padding: 2, powerOfTwo: true }`, write `assets/packed/<entity>.png` + `.json`. It exposes `packAsync` for async/await and needs no display, making it ideal for Netlify/GitHub Actions.

### 3.7 Tiled: maps

- Store lots and floor templates are authored in Tiled as **isometric** maps (Tiled supports `orientation: "isometric"` and `staggered`, alongside orthogonal and hexagonal). Source `.tmx`/`.tsx` (XML) is the committed source of truth.
- Export via CLI: `tiled --export-map assets/maps/src/store_small.tmx assets/maps/export/store_small.json`.
- **JSON structure** the loader consumes: top-level `orientation` (`isometric`), `tilewidth`/`tileheight`, `layers[]` (tilelayer with `data[]` of GIDs, plus objectgroup layers), `tilesets[]` (each with `firstgid`), and `properties[]`.
- **GID mapping:** `local_tile_id = GID − firstgid_of_containing_tileset`; pick the tileset with the largest `firstgid ≤ GID`; GID 0 = empty; the top four bits of a GID are flip flags and must be masked off before computing the local id.
- **Custom properties → entities:** object-layer objects carry custom properties (e.g. `entityType: "shelf_slot"`, `sku: "milk_2pct"`, `facings: 3`). The loader maps these to game entities at load, validated by Zod. Unknown `entityType` values fail loudly.

### 3.8 Engine-side dynamic parsing + validation

- On load, the engine reads the asset manifest, then each Aseprite JSON atlas and Tiled JSON map.
- Every JSON is parsed through a Zod schema (`AtlasSchema`, `TiledMapSchema`). Malformed data throws immediately with a precise path — **fail loudly**, never silently render garbage.
- Atlas `frameTags` → Phaser animations: for each tag `{name, from, to, direction}`, register an animation keyed `<entity>.<tag>`.
- Tiled custom properties → entity spawns via a typed dispatch table keyed by `entityType`.

### 3.9 Manifest-driven, placeholder-first workflow

- `content/asset-manifest.json` lists every logical asset (id, expected dimensions, anchor/pivot, atlas key, frame tags) INDEPENDENT of whether real art exists.
- If a real atlas is missing, a placeholder generator (`tools/manifest/placeholder.ts`) synthesizes a labeled colored box at the declared dimensions so the game is ALWAYS playable.
- This lets gameplay/sim development proceed before art exists, and lets the AI implement systems against manifest contracts, not specific pixels.

### 3.10 CI validation step (checkable)
CI runs `tools/validate/**`:
1. **Dimensions:** each packed frame matches manifest-declared size (± tolerance).
2. **Anchors:** each atlas declares required pivot/anchor slice; missing anchors fail.
3. **Filename case:** every manifest/loader path is checked against the real case-sensitive filesystem (guards macOS→Linux). Hard gate.
4. **Schema:** every atlas/map JSON validates against its Zod schema.
5. **Orphans:** referenced-but-missing and present-but-unreferenced assets are reported.

### 3.11 Watch mode, idempotency, caching
- `tools/` scripts are idempotent: same inputs ⇒ byte-identical outputs (sort inputs deterministically; pin packer options; disable timestamps in outputs where possible).
- Incremental rebuild: a content-hash cache (input file hash → output hash) skips unchanged entities. Only changed `assets/raw` subtrees repack.
- Watch mode (dev): a file watcher on `assets/raw/**` and `assets/maps/src/**` reruns only affected pack/export steps and hot-reloads the engine.

---

## 4. THE TYCOON CORE LOOP & GAMEPLAY SYSTEMS

The core loop: **Design store → stock shelves → open → customers path to products & buy → perishables age → end-of-day P&L → reinvest/expand → climb the rival ladder.** Passive/idle income accrues while away.

### 4.1 Deterministic simulation architecture
- **Fixed timestep:** the sim advances in fixed ticks (recommended 10 Hz sim ticks decoupled from render FPS). Render interpolates between ticks.
- **Seeded RNG streams:** one PRNG stream per subsystem (customer arrivals, purchase decisions, spoilage jitter, rival behavior). Seeds derive from a master save seed. This isolates subsystems so adding a customer roll doesn't shift spoilage rolls (crucial for stable golden tests).
- **World-state hashing:** `hash(world)` produces a stable digest each tick for golden/regression tests.
- **Command-log saves & replay:** player actions are COMMANDS appended to a log. World = `fold(commands, seed)`. Saves store seed + command log (compact) plus periodic snapshots. Replaying the log reproduces the exact world — this is also the anti-cheat/audit backbone.

### 4.2 Grid-based placement
- The store floor is a tile grid. Each placeable has a footprint (w×h tiles), an anchor tile, and a rotation (0/90/180/270 → picks the matching pre-rendered direction).
- **Placement validation:** footprint in-bounds, no overlap with occupied tiles, respects reserved tiles (walls, entrances), and preserves walkability.
- **Walkability:** placing fixtures updates a walkable/cost grid used by pathfinding. A placement that would fully wall off a required product or the register is rejected (connectivity check via flood fill).
- **Undo/redo:** all edits go through a command stack (`PlaceCommand`, `RemoveCommand`, `RotateCommand`) with `apply`/`invert`. Undo/redo is just moving the stack pointer; this reuses the same command types as the save log.

### 4.3 Customer pathfinding — A* vs flow fields (decisive)

**Requirement:** hundreds of simultaneous shoppers on a mostly-static grid, all heading to varied product targets, avoiding each other.

**Recommendation: hybrid.** Use **flow fields (vector fields)** for the hot loop of many agents converging on shared/common destinations, and **A\*** for one-off, low-frequency, per-agent queries (a shopper's bespoke multi-stop route between specific SKUs). Combine with **local steering** (boids-style separation) for crowd collision avoidance.

**Reasoning & tradeoffs:**
- **A\*** computes one shortest path per query. With hundreds of agents re-pathing on a dense grid, cost scales with agents × grid and spikes when the layout changes. A* excels at bespoke individual routes and is memory-light per query.
- **Flow fields** compute a single Dijkstra/integration field from a destination once, then EVERY agent reads its cell's direction vector — O(1) per agent per step. This technique was introduced in *Supreme Commander 2* (Gas Powered Games, 2010) and is documented by lead engineer Elijah Emerson in "Crowd Pathfinding and Steering Using Flow Field Tiles," *Game AI Pro* (CRC Press, 2013, pp. 307–323), where SupCom2 merged per-agent flow fields into group fields backed by HPA* pathfinding; *Planetary Annihilation* later used the same family of techniques. **Downsides:** fields cost memory and are slower to rebuild than a single A* path, and they scale poorly on very large maps. **ShelfLife maps are small and bounded (a store), which neutralizes the flow-field weakness and plays to its strength.**
- Because the store layout is static between edits, flow fields to popular destinations (entrance, registers, checkout exits, top-selling aisles) are computed once per layout change and cached; recomputed only when the player edits the store or a target opens/closes.

**Architecture:**
- Maintain a small set of cached flow fields keyed by "hot" destinations (registers, exits, promo endcaps).
- For a shopper's specific shopping list, chain segments: use the cached field when the next target is a hot destination; otherwise issue a throttled A* query (budgeted N per tick) and cache the result.
- **Local steering:** agents follow the field/path direction plus separation/avoidance forces so crowds don't stack; a light reservation or soft push resolves congestion at aisle pinch points.
- **Determinism:** steering uses the seeded RNG stream and fixed timestep — no `Math.random`, no wall clock.

**Impulse-purchase mechanic from walked paths:** as agents traverse, record tile visitation ("traffic heat"). Products adjacent to high-traffic tiles get an impulse-purchase probability boost. This closes the loop: good layout (endcaps on the main path) → more impulse buys → higher basket size. Traffic heat is part of world state and feeds the end-of-day report.

### 4.4 Inventory management (why it's called ShelfLife)
- **SKUs:** id, category, cost, base price, case pack, physical footprint (facings per shelf tile), and a spoilage profile.
- **Facings & stock:** each shelf slot holds `facings` of a SKU; on-hand units deplete as customers buy; empty facings reduce attractiveness and sales (out-of-stock penalty).
- **Reorder policy: (s, S)** — when on-hand (plus on-order) drops to reorder point `s`, order up to `S`. Suppliers have lead times (order arrives after L days) and case-pack rounding. Keep `s`, `S`, `L` in `content/`, not code.
- **Perishables & spoilage:** each perishable SKU has a spoilage curve over its shelf life; units past freshness are marked down, then written off as spoilage (shrink). Spoilage is a cost line and a core difficulty lever.
- **Markdowns:** near-expiry stock can be auto/manually marked down to clear inventory before it spoils (recover partial margin).
- **Shrinkage:** theft/damage modeled as a small stochastic loss (seeded), higher in crowded/blind-spot layouts.

### 4.5 End-of-day revenue summary (P&L)
Daily statement, drill-down required:
```
Revenue                        (gross sales by category)
- COGS                         (cost of goods sold)
= Gross margin
- Labor                        (staff shifts)
- Rent
- Utilities
- Marketing
- Shrink                       (theft/damage)
- Spoilage                     (perished write-offs)
= EBITDA
```
Plus KPIs: per-category margin, average basket size, trip frequency, conversion (visitors → buyers), out-of-stock incidents, and traffic-heat map. **Drill-down:** each line expands to per-category, then per-SKU, then contributing events (traceable to the command/event log).

### 4.6 Passive income / idle mechanics

**Two-model design:**
- **Full-fidelity model:** the real-time deterministic sim (agents, pathing, spoilage) runs while the game is open.
- **Aggregate/statistical model:** a cheaper closed-form model for offline catch-up. Instead of simulating thousands of agents for hours, it estimates footfall × conversion × basket × margin per unit time, applies spoilage decay and stock depletion analytically, and produces the same P&L shape.

**Offline progress calculation on return:**
1. On load, fetch server-authoritative timestamps (Supabase `now()` / last-seen) — **never trust the device clock.**
2. Compute `elapsed = server_now − last_server_sync` (clamped).
3. Run the aggregate model forward over elapsed time in coarse steps (e.g., per-hour buckets), depleting stock and aging perishables.
4. **Apply caps & diminishing returns:** offline earns at a reduced rate and is capped (e.g., N hours max accrual, with a decay curve beyond a threshold) so idling never dominates active play.
5. **Reconcile:** fold the aggregate result back into the deterministic world as a summarized command (`OfflineEarnings{fromTick, toTick, deltas}`) so the world hash stays consistent and replayable.

**Anti-cheat (client-side clock tampering):**
- Device clocks are untrusted — a user can set the clock forward to fake days of idle income.
- Offline duration is derived from **server timestamps only.** The client proposes elapsed time; a Supabase Edge Function validates it against stored `last_seen_server_ts` and recomputes/authorizes the payout server-side.
- Production idle games move payout to the backend and use server time (Supabase can compute this via `now()` on the database side); ShelfLife computes offline earnings authoritatively in an Edge Function and the client only renders the result.

### 4.7 Rival/competitor AI, market share, and the "more beloved" ladder

**Store choice model — recommendation: a Huff gravity / multinomial-logit model.**

- Each household `i` chooses store `j` with probability proportional to attractiveness over distance:
  `P_ij = (A_j^α / D_ij^β) / Σ_k (A_k^α / D_ik^β)`.
- The model was introduced by David L. Huff in "Defining and Estimating a Trading Area," *Journal of Marketing*, Vol. 28 (1964), pp. 34–38 (developed while he was a marketing professor at UCLA). It is a special case of the **multinomial logit** (McFadden) discrete-choice family, so attractiveness can be expressed as a utility with interpretable terms.
- **Attractiveness `A_j`** in ShelfLife = f(assortment/in-stock breadth, price competitiveness, freshness/quality, cleanliness/layout, marketing, and **Community Love/loyalty**). Because it's probabilistic (every household has some chance at every store) rather than "nearest store wins," it matches real shopper behavior and yields continuous market shares — good for smooth difficulty and cannibalization/expansion analysis.

**Why Huff/logit wins over a naive nearest-store or hand-tuned share:** it's grounded in decades of retail research, produces continuous shares, and exposes clean tunable exponents (`α`, `β`) plus a utility vector we can balance. **Alternative considered:** agent-level errand simulation for every household — rejected as too expensive for the offline/idle model and harder to balance analytically; the Huff share model composes cleanly with both the full and aggregate simulations.

**Customer segments:** households belong to segments (budget, family, foodie, convenience) with different weights on price/quality/distance/assortment in the utility function.

**Loyalty & word-of-mouth:** repeated satisfying trips raise a household's loyalty to a store, adding a loyalty term to its attractiveness (stickiness). Bad experiences (out-of-stock, spoiled goods, long queues) erode it. Word-of-mouth spreads loyalty shifts across a social graph/among segments.

**The "each rival is MORE BELOVED" difficulty ladder (mechanical expression):** difficulty is measured by the rival's Community Love / loyalty resilience, not size. Higher-level rivals have:
- A **larger baseline loyalty term and higher loyalty floor** (hard to pull households away even when you out-compete on price/assortment).
- **Slower loyalty decay and faster recovery** (resilience) — temporary wins don't stick.
- **Stronger word-of-mouth immunity** (negative events hurt them less).

Beating a beloved rival therefore requires *sustained* superiority, not a one-day price war — all expressed through loyalty parameters in `content/rivals/`.

### 4.8 Balance/tuning harness (headless Monte Carlo)
- `tests/montecarlo/` provides a headless CLI that runs the deterministic sim (no renderer) across many seeds and configurations.
- It validates difficulty curves: does level N's beloved rival require the intended sustained performance? Are offline caps sane? Do spoilage/lead-time settings create the intended tension?
- Because the core imports no Phaser/DOM/Supabase, the harness runs fast in Node/CI and gates balance changes.

---

## 5. SUPABASE INTEGRATION STRATEGY

### 5.1 Schema (SQL DDL sketches)

```sql
-- Players (1:1 with auth.users, including anonymous users)
create table public.user_profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_anonymous boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

-- Cloud saves (server timestamps are authoritative)
create table public.save_states (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  slot          int  not null default 0,
  save_version  int  not null,
  world_seed    bigint not null,
  snapshot      jsonb not null,               -- compact world snapshot
  command_tail  jsonb not null default '[]',  -- commands since snapshot
  world_hash    text not null,                -- for integrity/regression
  version       int  not null default 1,      -- optimistic-concurrency counter
  updated_at    timestamptz not null default now(),
  last_seen_server_ts timestamptz not null default now(), -- anti-cheat clock
  unique (user_id, slot)
);

-- Inventory (queryable projection; canonical state lives in the save snapshot)
create table public.store_inventory (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  sku           text not null,
  on_hand       int  not null default 0,
  on_order      int  not null default 0,
  reorder_s     int  not null,
  order_up_to_S int  not null,
  updated_at    timestamptz not null default now(),
  unique (user_id, sku)
);

-- Remote balance/economy config (server-controlled tuning, hot-patchable)
create table public.economy_config (
  key         text primary key,
  value       jsonb not null,
  min_version int not null default 1,      -- gate by client version
  updated_at  timestamptz not null default now()
);

-- Level/ladder progress
create table public.level_progress (
  user_id     uuid not null references auth.users(id) on delete cascade,
  level       int  not null,
  status      text not null check (status in ('locked','active','beaten')),
  best_metric numeric,
  updated_at  timestamptz not null default now(),
  primary key (user_id, level)
);

-- Telemetry / analytics (append-only)
create table public.analytics_events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  session_id  uuid,
  name        text not null,
  props       jsonb not null default '{}',
  client_ts   timestamptz,                 -- untrusted
  server_ts   timestamptz not null default now() -- authoritative
);

-- Leaderboards (writes go through Edge Function only)
create table public.leaderboards (
  id          uuid primary key default gen_random_uuid(),
  board       text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  score       numeric not null,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (board, user_id)
);
```

### 5.2 Row Level Security (essential — client is untrusted)

RLS is the primary defense: with Supabase's public API, anyone with the anon key can hit every table, so every table gets RLS. **Enable it explicitly in migrations** — tables created via raw SQL have RLS **off** by default, and disabled RLS is the single most common cause of Supabase data breaches (e.g., CVE-2025-48757 found ~10.3% of analyzed Lovable apps shipped with public-readable tables because RLS was off).

```sql
alter table public.save_states enable row level security;

create policy "own saves read"  on public.save_states
  for select to authenticated using ( (select auth.uid()) = user_id );
create policy "own saves write" on public.save_states
  for insert to authenticated with check ( (select auth.uid()) = user_id );
create policy "own saves update" on public.save_states
  for update to authenticated using ( (select auth.uid()) = user_id )
                                with check ( (select auth.uid()) = user_id );
```

**Anonymous vs permanent users:** an anonymous user assumes the `authenticated` role; distinguish it via the `is_anonymous` JWT claim. Use a RESTRICTIVE policy so, e.g., only permanent users submit to leaderboards:
```sql
create policy "permanent only leaderboard insert" on public.leaderboards
  as restrictive for insert to authenticated
  with check ( (select (auth.jwt()->>'is_anonymous')::boolean) is false );
```
(RLS policies are permissive/OR-combined by default; a restrictive policy must be paired with a permissive one that returns true.)

**Additional RLS discipline:**
- `economy_config`: SELECT to authenticated (read-only); writes only via service role / migrations.
- `analytics_events`: INSERT only for own `user_id`; no client SELECT.
- `leaderboards`: SELECT public (or authenticated); INSERT/UPDATE only via Edge Function (service role) after validation.
- **Index every column referenced in an RLS policy** (`user_id`) — missing indexes are the top RLS performance killer.
- Never trust `raw_user_meta_data` for authorization (user-editable). `service_role` bypasses RLS — server-side only, never in the client.

### 5.3 Auth strategy
- **Anonymous sign-in** for frictionless first play (no signup wall). The player gets a real `auth.users` row and can save to the cloud immediately.
- **Upgrade/linking:** later, link the anonymous account to email or Apple. On iOS, if the app offers any third-party login, Apple requires **Sign in with Apple** be offered too.
- Use **PKCE flow** (required for mobile/Capacitor deep-link auth).

### 5.4 PASSIVE SYNC architecture (local-first, non-stuttering)

**Principle: local-first.** IndexedDB is the primary store and source of truth for the session; Supabase is a backup/sync channel. This keeps the gameplay loop at frame rate and makes the game fully playable offline.

- **Primary local store:** IndexedDB via **Dexie** (a clean IndexedDB wrapper). All reads hit local; the network is an optimization.
- **Dirty-flag / changeset accumulation:** mutations mark entities dirty and append to a changeset queue rather than writing to the network immediately.
- **Debounce + coalesce:** writes are debounced and coalesced (many rapid edits → one payload). Never fire-and-forget per mutation.
- **Sync timing:** flush during idle time (`requestIdleCallback`) and on scene transitions / `visibilitychange` (tab hide) / `pagehide`, so serialization never competes with the render loop.
- **Web Worker offload:** JSON serialization and compression run in a Web Worker (`src/workers/`), keeping the main thread smooth. (If `SharedArrayBuffer` is used, see COOP/COEP in Appendix A.)
- **Retry with backoff:** failed syncs go to a persistent retry queue with exponential backoff; the queue survives reloads (stored in IndexedDB). Service Worker **Background Sync** can retry after tab close.
- **Conflict resolution:** server-authoritative reconciliation with **last-write-wins by `updated_at`** for independent rows (single-player, so cross-device is the only conflict source). Every synced row carries `updated_at` in **UTC ms**; a `version` counter guards genuine conflicts (server rejects an update whose version isn't exactly one ahead). **Vector clocks considered but rejected** as overkill for a single-player game — documented in an ADR. For money/progression, the server (Edge Function) is authoritative and can override LWW.
- **Save-version migrations:** on load, if `save_version < current`, run the migration chain before use.
- **Payload limits:** keep sync payloads well under the Edge Function 4 MB request limit; send snapshot + command tail, not full history. Large snapshots are chunked.
- **Backgrounded / fully offline:** on `pagehide`/background, do a best-effort flush; if offline, everything stays queued in IndexedDB and syncs on reconnect (`online` event).

### 5.5 Server-authoritative vs client-authoritative

| Concern | Authority | Mechanism |
|---|---|---|
| Rendering, input, layout editing | Client | Local sim |
| Save persistence | Client-proposed, server-stored | RLS-guarded writes |
| Offline earnings | Server | Edge Function validates elapsed time vs `last_seen_server_ts`, computes payout |
| Leaderboard submission | Server | Edge Function validates run before insert |
| Economy/balance config | Server | `economy_config` table, read-only to client |
| Time | Server | Supabase `now()` timestamps |

**Edge Functions (Deno)** handle anything untrusted. Per Supabase's official Limits doc, note their constraints: **max payload 4 MB**, **CPU time 2 s** per request, **memory 256 MB** (Pro; 150 MB Free), **request idle timeout 150 s**, **max function size 20 MB (CLI-bundled) or 5 MB (server-bundled)**, cold starts ~200–800 ms. Keep offline-validation and leaderboard functions small and dependency-light.

### 5.6 Supabase from Capacitor/iOS
- **Auth redirects:** use deep links (custom scheme e.g. `com.shelflife.app://auth` or Universal Links) with **PKCE**. Set `flowType: 'pkce'`; handle the redirect via `@capacitor/app`'s `appUrlOpen` listener and exchange the code for a session. A common failure is `detectSessionInUrl` fighting manual deep-link handling — configure carefully.
- **Storage differences:** WKWebView storage can be evicted; treat IndexedDB as durable-but-not-guaranteed and always keep the cloud copy.
- **Network reachability:** use the Capacitor Network plugin to drive sync/retry.
- **Deep-link security:** Universal Links are safer than custom schemes (which can be hijacked); prefer Universal Links for production.

---

## 6. PROMPTING PROTOCOL & DEFINITION OF DONE

### 6.1 Prompt template

```
CONTEXT: See PLAN.md §<section>. We are in Phase <n>.
TASK: <one specific outcome>.
CONSTRAINTS: Obey §1 Rules of Engagement. Sim code stays headless/deterministic
  (no Phaser/DOM/Supabase, no Math.random/Date.now). Magic numbers → content/.
INPUTS: <files/schemas/data involved>.
OUTPUT: <code + tests + ADR/docs updates>.
DONE WHEN: <maps to §6.2 checklist + this task's acceptance>.
```

**Worked examples:**
- **New system:** "Implement the (s,S) reorder system in `src/sim/systems/inventory.ts` per PLAN.md §4.4. Pure/deterministic; policy params from `content/skus`. Include unit tests + a golden hash test for a 30-day run."
- **Bug fix:** "Customers clip through shelves at aisle pinch points (§4.3 steering). Reproduce with a failing test in `tests/unit/steering.test.ts`, then fix separation forces. No new deps; keep determinism."
- **Refactor:** "Extract the offline aggregate model (§4.6) from `render/` into `src/sim/systems/offline.ts` so it's headless. Add an ADR. No behavior change; golden hashes must match."
- **Content addition:** "Add level 5 rival 'parody chain' to `content/rivals/` with higher loyalty floor + slower decay per §4.7. Add a Monte Carlo test asserting it needs sustained superiority."
- **Asset pipeline change:** "Update `tools/pack/pack.ts` to emit Phaser3 atlases via free-tex-packer-core (§3.6). Do NOT edit any .png/.aseprite. Update CI validation + docs."

### 6.2 Definition of Done (every unit of work)
- [ ] `tsc --noEmit` passes (strict, noUncheckedIndexedAccess).
- [ ] ESLint passes, including boundary rules and `/src/sim` restricted-globals.
- [ ] Unit tests added/updated and passing.
- [ ] Golden/determinism tests pass (world-state hashes stable; or intentionally rebaselined with justification).
- [ ] No dependency-boundary violations (sim stays headless).
- [ ] Content validated (manifest/schema/case checks green).
- [ ] Docs/ADR updated if architecture changed.
- [ ] CHANGELOG entry added.
- [ ] Conventional commit message; PR tagged with phase.
- [ ] No secrets; `gitleaks` clean.

### 6.3 Phased roadmap (binary acceptance gates)

| Phase | Focus | Acceptance gate (binary) |
|---|---|---|
| 0 | Repo scaffold, tsconfig, CI, boundaries, manifest + placeholders | `vite build` + all CI gates green with placeholder art; empty store renders isometrically |
| 1 | Deterministic sim core: tick, RNG streams, world hash, command log | Golden test: same seed+commands ⇒ identical hash across 1000 ticks |
| 2 | Grid placement + undo/redo + walkability | Place/rotate/remove fixtures; connectivity check blocks illegal layouts; undo/redo exact |
| 3 | Pathfinding (flow fields + A* + steering) + impulse traffic | 300 agents path & shop at ≥60 FPS on target hw; traffic heat feeds impulse buys |
| 4 | Inventory: SKUs, facings, (s,S), lead times, spoilage, markdowns, shrink | 30-day sim produces correct stock/spoilage; golden P&L fixture matches |
| 5 | End-of-day P&L + drill-down | Daily statement with all lines + per-SKU drill-down traceable to events |
| 6 | Rivals, Huff/logit market share, segments, loyalty, love ladder | Monte Carlo confirms beloved rivals need sustained superiority |
| 7 | Idle/offline (aggregate model + caps + server validation) | Offline payout matches server-validated elapsed time; clock tampering rejected |
| 8 | Supabase: auth (anon+link), RLS, local-first sync | Cloud save/restore works; RLS blocks cross-user access; sync never drops frames |
| 9 | Netlify deploy + real art pipeline swap-in | Production build on case-sensitive host with real atlases; no 404s |
| 10 | Capacitor iOS | Runs in WKWebView with safe areas, audio unlock, deep-link auth |

### 6.4 Claude Code slash commands / subagent roles (suggested)
- `/sim` — subagent constrained to `/src/sim/**`; enforces determinism/boundaries.
- `/pipeline` — subagent for `tools/**`; never touches binaries directly.
- `/db` — subagent for `supabase/**`; migration discipline + RLS review.
- `/balance` — runs the Monte Carlo harness and reports difficulty curves.
- `/review` — checks a diff against the §6.2 Definition of Done.

### 6.5 Context hygiene (codebase will outgrow the window)
- Keep PLAN.md/CLAUDE.md authoritative and section-numbered; prompts reference sections, not pasted code.
- Per-directory `README.md` "context cards" summarizing purpose + invariants.
- ADRs are the memory of "why"; the AI reads relevant ADRs before changing a subsystem.
- Keep functions small and modules single-purpose so a subagent can load only what it needs.

---

## Appendix A — Netlify / Vite configuration

- **Build:** `command = "npm run build"`, `publish = "dist"`. SPA fallback redirect `/* → /index.html 200`.
- **Caching:** fingerprinted assets (Vite hashes) get `Cache-Control: public, max-age=31536000, immutable`; `index.html` stays `no-cache` so new deploys are picked up. Large atlases benefit from long immutable caching.
- **Deploy previews:** enabled per-PR (Netlify default) for QA of gameplay branches.
- **COOP/COEP (only if SharedArrayBuffer is used by Workers):** `SharedArrayBuffer` requires cross-origin isolation via COOP `same-origin` and COEP `require-corp` headers, set in `netlify.toml`:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
```
  Mirror these in Vite dev (`server.headers`) so dev matches prod. Note: `require-corp` breaks cross-origin resources lacking CORP/CORS (and can complicate Supabase/third-party embeds; a service worker that strips these headers silently flips `crossOriginIsolated` to false). **Decision:** only enable COOP/COEP if profiling shows we need SharedArrayBuffer-backed Workers; otherwise use structured-clone message passing to Workers and skip isolation.

## Appendix B — Capacitor / iOS notes
- WKWebView is the runtime; **iOS 15+ / current Xcode** required.
- **Safe areas:** WKWebView doesn't auto-respect safe areas; combine native config (viewport, `contentInset`) with CSS `env(safe-area-inset-*)` padding so the HUD avoids notch/home indicator.
- **Audio unlock:** browsers/WKWebView require a user gesture before audio; gate the audio context resume on first tap.
- **WebGL/perf:** WKWebView can be memory-constrained for GPU canvas; Phaser 4's context restoration helps (context loss on backgrounding is handled), but budget textures conservatively and test on device.
- **App Store review:** web-wrapped games must feel like an app (not just a website), offer native-appropriate behavior, and satisfy Sign in with Apple if third-party login is offered.

## Appendix C — Trademark-safe parody guardrails (practical caution; NOT legal advice)
The rival chains parody major US grocery brands. Practical guardrails:
- **Do not copy** logos, trade dress, exact names, color+wordmark combinations, or slogans. Invent distinct names, logos, and palettes.
- Parody is strongest as commentary/humor and weakest when it merely trades on a brand's pull to sell your product or could confuse consumers about source/affiliation. In *Jack Daniel's Properties, Inc. v. VIP Products LLC*, 599 U.S. 140 (June 8, 2023), the U.S. Supreme Court ruled unanimously (opinion by Justice Kagan) that "when an alleged infringer uses a trademark as a designation of source for the infringer's own goods… the Rogers test does not apply" — i.e., parody is not a safe harbor when the mark functions as your own source identifier.
- **Avoid implying endorsement/affiliation.** Keep humor pointed at a recognizable *archetype*, not a specific brand's marks.
- When in doubt, make the rival an original brand that evokes a *category*, not a company. If your gameplay works without any real mark, that's the safest route.
- This is practical caution, **not legal advice**; consult trademark counsel before shipping commercially.

## Appendix D — Key version/constraint facts (as of Aug 2026)
- **Phaser 4** (April 2026): node-based WebGL renderer; `TilemapGPULayer`/`SpriteGPULayer` are orthographic — no iso/hex tilemap projection ⇒ **custom iso renderer required**; context restoration built in.
- **Tiled:** JSON export via `tiled --export-map`; supports isometric orientation; GID `firstgid` mapping with top-4-bit flip flags.
- **Aseprite:** proprietary EULA since Aug 2016 (v1.1.8; announced Sept 1, 2016); self-compile for personal use allowed, redistribution of binaries forbidden, per-developer license for companies ⇒ run locally, don't put in shared CI. **free-tex-packer-core (MIT)** and **LibreSprite (GPLv2)** are open fallbacks.
- **Supabase:** RLS mandatory (off by default on SQL-created tables); anonymous auth via `is_anonymous` claim; Edge Function limits (4 MB payload, 2 s CPU, 256 MB memory, 150 s idle timeout).
- **Capacitor:** WKWebView, PKCE deep-link auth, safe-area handling required.
- **Blender:** headless render via `blender --background file.blend --python script.py -- args` (argument order matters); Linux CI needs Xvfb/EGL; MCP (`ahujasid/blender-mcp`) is for interactive authoring only, not the deterministic build.