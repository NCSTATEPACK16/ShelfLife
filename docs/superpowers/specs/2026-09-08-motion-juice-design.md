# Motion & Juice (visual fade/pop + basic SFX) — Design

Companion to `docs/design/gentle-surface.md` and the existing
`docs/superpowers/specs/2026-09-02-gentle-surface-design.md`. That phase made every declared tell
*fire*; this one makes the ones that fire *feel* like something instead of an instant pop-in/
pop-out. Scoped narrowly, per user priority: bubble/world-mark easing (visual) plus a small set of
procedurally-generated SFX cues (audio) on the highest-value terms only. This is a slice of
`PLAN.md` §16's M5 "Audio & juice" phase pulled forward early — deliberately a slice, not the
whole phase: no ambient loop, no PA system, no screen shake, no shopper squash-stretch, no particle
overhaul. Those stay in M5.

## 0. Current state (read directly from source, not assumed)

- `src/view/gentle-surface-draw-plan.ts` is the pure module that turns fired tells into
  `SpritePlan`s. Bubbles (`ActiveBubble`) and world marks (`ActiveMark`) are tracked with only an
  `expiresAtTick`, no start time — they pop fully visible on admit and vanish outright on expiry.
- `SpritePlan` (`src/view/draw-plan.ts`) has no alpha/opacity field. `BuildScene#draw()`
  (`src/view/BuildScene.ts:191`) applies `x/y/depth/origin/flipX/tint` to a pooled Phaser `Image`
  and nothing else.
- World marks are drawn by re-tinting the *fixture's own sprite* via `fixtureSpritePlan(...,
  { tint: mark.tint })` — there is no separate marker sprite for a world mark, so "fading" one
  means blending the tint colour itself, not sprite alpha.
- The tell contract (`content/design/gentle-surface.json5`, parsed by
  `src/sim/content/gentle-surface.ts`'s `TellDefSchema`) has no audio field at all.
- No audio library is installed (`package.json` has no Howler). `src/platform/` has
  `entitlements/ input/ layout/ profile/ storage/` — no `audio/` module yet. `PLAN.md` §6.4 already
  names Howler.js 2.2.4 as the locked audio stack ("Sprite audio, mobile unlock handled").
- Sim tick rate is 10 Hz (`bubbleDurationTicks: 12` ≈ 1.2s, per the comment in
  `content/design/gentle-surface-view.json5`).

## 1. Visual: fade/pop on bubbles and world marks

**Bubbles.** Add `alpha: number` to `SpritePlan` (default meaning "opaque"; every existing caller
passes `1` — no behavior change for fixtures/shoppers/particles/carts, which don't fade).
`BuildScene#draw()` gains one line: `image.setAlpha(sprite.alpha)`.

`ActiveBubble` gains `startedAtTick` (mirroring `ActivePose`, which already has one). At render
time, compute progress against two new tuning values:

```
fadeInTicks:  2   // ~0.2s — a bubble should feel immediate, not draw out
fadeOutTicks: 3   // ~0.3s — the exit can be a little slower than the entry
```

```ts
function bubbleAlpha(elapsedSinceStart: number, ticksUntilExpiry: number): number {
  if (elapsedSinceStart < TUNING.fadeInTicks) {
    return easeOutQuad(elapsedSinceStart / TUNING.fadeInTicks);
  }
  if (ticksUntilExpiry < TUNING.fadeOutTicks) {
    return easeInQuad(ticksUntilExpiry / TUNING.fadeOutTicks);
  }
  return 1;
}
```

`easeOutQuad(t) = 1 - (1-t)^2`, `easeInQuad(t) = t*t` — two pure one-line functions, colocated in
`gentle-surface-draw-plan.ts`, unit-tested directly (0 → 0, 1 → 1, monotonic, no Phaser needed).
Both bubble sprites pushed in `render()` (the frame and the icon) get the same computed alpha.

**World marks.** Since a mark is a tint on the fixture's own sprite, "fading" means blending the
tint colour toward neutral (`0xFFFFFF`, i.e. no tint) at the edges of its lifetime, using the same
two-phase progress function but producing a blended colour instead of an alpha:

```ts
function blendTint(tint: number, mix: number): number // lerp each RGB channel toward 0xFFFFFF at (1-mix)
```

`ActiveMark` gains `startedAtTick`; `worldMarkFadeInTicks`/`worldMarkFadeOutTicks` (both `2`, ~0.2s
— marks are already short and shouldn't be slower than the flash they represent) join the tuning
file. `render()` calls `blendTint(mark.tint, progressFor(mark))` instead of passing `mark.tint`
straight through to `fixtureSpritePlan`.

**Explicitly not touched:** particle swarms (`particle_flies` already have their own frame-drift
motion — the ask was tell polish, not particles), abandoned-cart markers (they're a persistent
world object per the existing design note, not a transient tell), shopper pose swaps (separate,
larger "shopper movement feel" option the user did not pick this round).

## 2. Audio: procedural SFX on a curated set of terms

**New optional content field.** `TellDef` gains `sound: string | null`, following the exact
pattern `particle` already uses — added to `TellDefSchema` in `src/sim/content/gentle-surface.ts`
and to every entry in `content/design/gentle-surface.json5`. Unlike bubble/animation/particle/
worldMark, `sound` is **not** required to be non-null for every term — `tools/check-gentle-
surface.mjs`'s full-coverage rule is unchanged; audio coverage is opt-in for this pass.

**Curated cue list** (4 terms, the highest-signal ones per `docs/design/gentle-surface.md`):

| Term | Cue | Character |
|---|---|---|
| `impulsePurchase` | `chime_positive` | short rising two-note blip |
| `spoiledEncounters` | `buzz_negative` | short low buzz |
| `queuePenaltyBalk` | `descend_sad` | short descending tone |
| `discovery` | `sparkle_up` | short bright arpeggio, 3 notes |

**Generation, not licensing.** No third-party audio files, no `ATTRIBUTION.md` entry needed. New
`tools/audio/synth.py` (mirrors `tools/art/`'s "art as source code" ethos — ADR 0006 — applied to
sound): a small parametric synthesizer (waveform, frequency/note sequence, envelope) that emits
short WAV files to `assets/audio/sfx/`. Committed as build output, regenerable from the Python
source, same "never hand-edit the binary" rule as sprites. This becomes ADR 0009 (see §4).

**Playback module.** New `src/platform/audio/index.ts`, Howler-bound (so it can never be imported
from `src/sim` or from the pure `src/view/*-draw-plan.ts` modules — platform boundary, `CLAUDE.md`).
Exposes:

```ts
export interface AudioPlayer {
  playTell(term: TellTerm): void;
  setMuted(muted: boolean): void;
}
export function createAudioPlayer(): AudioPlayer;   // real Howler-backed implementation
export function createNullAudioPlayer(): AudioPlayer; // no-op, for tests and SSR-safe boot
```

Internally, one `Howler.Sprite`-style map loaded once from the four generated WAVs, looked up by
the `sound` id from the tell table (skip silently if `sound` is `null`). Mobile-autoplay unlock is
Howler's job per the stack decision — no bespoke gesture-unlock code needed here.

**Wiring — where the side effect lives.** `gentleSurfaceDrawPlan()` stays pure (no audio calls
inside it — it's tested as a pure function today and must stay that way). It already tick-gates
its own `detect()` pass; the fix is to surface *which terms were newly admitted this tick* as part
of its return value:

```ts
export interface GentleSurfacePlan {
  // ...existing fields...
  readonly firedThisTick: readonly TellTerm[]; // terms newly admitted to a bubble this tick, deduped
}
```

`firedThisTick` reflects only terms that actually got a bubble slot in `admit()` — a tell dropped
by the rate cap stays silent on audio too, consistent with `docs/design/gentle-surface.md` §3's
"silence is a feature" rule; audio doesn't get a louder claim on the player's attention than the
bubble it would have accompanied.

`BuildScene.redraw()` — already the Phaser-bound consumer of this module — loops `firedThisTick`
and calls `audioPlayer.playTell(term)` once per term per tick. This keeps the sim boundary and the
pure/impure view split both intact: detection and easing math stay pure and unit-tested; the only
new Phaser-adjacent code is a one-line loop plus the `AudioPlayer` construction in `BuildScene`'s
setup (constructed once, alongside the sprite pool).

## 3. Content/schema changes

- `content/design/gentle-surface.json5`: add `sound: 'chime_positive' | null` etc. to the 4 curated
  terms' entries, `sound: null` to the rest (explicit, not omitted — matches the file's existing
  style of always writing every field).
- `content/design/gentle-surface-view.json5`: add `fadeInTicks`, `fadeOutTicks`,
  `worldMarkFadeInTicks`, `worldMarkFadeOutTicks` (values above), each with the same one-line
  rationale comment style the file already uses.
- `package.json`: add `howler` (2.2.4, pinned per `PLAN.md` §6.4) and `@types/howler`.

## 4. ADR 0009 — Audio as source code

New `docs/adr/0009-audio-as-source-code.md`, same Status/Date header format as 0001–0008, same
shape as ADR 0006 but for the audio equivalent: SFX cues are authored as parameters (waveform,
notes, envelope) in `tools/audio/synth.py` and compiled to WAV, never hand-recorded or downloaded,
for the same reasons ADR 0006 gives for sprites — no budget, no licensing risk, diffable source,
regenerable. Written alongside the code, not before it, since (unlike ADR 0008) there's no
ambiguity to resolve before starting — it's documenting a decision made in the course of this work.

## 5. Testing

- `gentle-surface-draw-plan.test.ts`: `easeOutQuad`/`easeInQuad` boundary + monotonicity tests;
  `blendTint` tests (mix=1 → original tint, mix=0 → `0xFFFFFF`); a scenario test asserting a
  bubble's `alpha` is `<1` in its first `fadeInTicks` ticks and its last `fadeOutTicks` before
  expiry, and exactly `1` in between; `firedThisTick` contains a term exactly once on the tick it's
  admitted and is empty on subsequent ticks while the bubble is merely held.
- `src/platform/audio/index.test.ts`: `createNullAudioPlayer()` is a true no-op (safe to call with
  no DOM/Web Audio present — this is what unit tests elsewhere will use if they touch `BuildScene`
  setup). The real Howler-backed player is exercised manually / via Playwright, not unit tests,
  matching how the boundaries test file already treats `getContext()`-dependent code.
- `tools/check-gentle-surface.mjs`: unaffected — confirm it still passes with `sound` present on
  all entries (including `null`) and doesn't newly require it.
- `npm run verify` after each commit, per `CLAUDE.md`. No golden-hash risk: nothing here touches
  `src/sim`.

## 6. Out of scope, explicitly

- Shopper squash-stretch / eased pose transitions, particle system overhaul, UI panel transition
  polish, camera shake/nudge, ambient loop, PA announcements — all remain in `PLAN.md` §16's M5
  "Audio & juice" phase, not pulled forward here.
- Any change to `src/sim` — this phase is view/platform/content only.
