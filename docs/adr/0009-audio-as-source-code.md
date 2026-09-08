# 9. Audio as source code: text cues, generated WAVs

**Status:** Accepted
**Date:** 2026-09-08
**Related:** ADR 0006 (art as source code)

## Context

`PLAN.md` §6.4 names Howler.js as the audio stack, but names no source for the audio
*content* itself. ADR 0006 already solved this exact problem for sprites — no art budget,
no license for a paid tool, and a hard rule that binaries are build output, never
hand-edited — and the solution (author small pixel grids as text, compile to PNG)
generalizes directly to short SFX cues: a few notes and an envelope are parameters, not a
recording.

## Decision

SFX cues are authored as parameters — waveform, frequency or note sequence, duration,
envelope — in `tools/audio/synth.py`, and compiled to WAV. No third-party audio file is
ever downloaded or licensed for this purpose; no clip is ever hand-recorded. `assets/audio/
sfx/*.wav` is committed build output, regenerable at any time by re-running the script,
exactly like `assets/atlases/*.png` under ADR 0006.

Python's `wave` and `struct` standard-library modules are sufficient (no `Pillow`-style new
dependency, unlike the art pipeline, since raw PCM sample generation needs no image
library).

## Consequences

**Bought:**
- No licensing risk, no `ATTRIBUTION.md` entry needed for SFX — same reasoning ADR 0006
  gives for sprites.
- Cues are diffable and reviewable as Python source, and regenerable from that source at
  any time.
- No new Python dependency for audio, unlike the art pipeline's `Pillow` requirement.

**Paid:**
- Procedural tone synthesis produces simple, chiptune-style blips — it cannot produce
  musical instrument samples or ambient recordings. That's an accepted limit for SFX cues;
  should a future phase need an ambient loop or PA voice lines, that is a separate decision
  (M5 "Audio & juice" territory, `PLAN.md` §16), not covered by this ADR.
- Playback goes through Howler.js (`src/platform/audio/index.ts`), matching the stack
  decision in `PLAN.md` §6.4 — this ADR is about the content's *source*, not the player.

**Not affected:** `src/sim/**`. Audio triggers are a pure side effect of already-computed
tell events (`docs/superpowers/specs/2026-09-08-motion-juice-design.md` §2) and carry no
state back into the simulation.
