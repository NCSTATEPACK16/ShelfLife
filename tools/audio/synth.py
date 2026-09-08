#!/usr/bin/env python3
"""Procedural SFX synth (ADR 0009): every cue is parameters, compiled to WAV.

Run: python3 tools/audio/synth.py
Outputs: assets/audio/sfx/*.wav

Never hand-record or download a clip here -- add a cue definition below and regenerate.
Same "art as source code" rule as tools/art/ (ADR 0006), applied to sound: no binary is
ever hand-edited, only generated.
"""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "assets" / "audio" / "sfx"

SAMPLE_RATE = 22050
AMPLITUDE = 0.35  # headroom so mixed cues don't clip


def _tone(freq: float, duration_s: float, wave_shape: str = "square") -> list[float]:
    """One tone's samples, in [-1, 1], with a short linear envelope to avoid clicks."""
    n = int(SAMPLE_RATE * duration_s)
    attack = max(1, int(n * 0.08))
    release = max(1, int(n * 0.2))
    samples: list[float] = []
    for i in range(n):
        t = i / SAMPLE_RATE
        phase = (t * freq) % 1.0
        if wave_shape == "square":
            raw = 1.0 if phase < 0.5 else -1.0
        else:  # "sine"
            raw = math.sin(2 * math.pi * t * freq)
        envelope = 1.0
        if i < attack:
            envelope = i / attack
        elif i > n - release:
            envelope = max(0.0, (n - i) / release)
        samples.append(raw * envelope * AMPLITUDE)
    return samples


def _sweep(freq_start: float, freq_end: float, duration_s: float) -> list[float]:
    """A sine sweep from freq_start to freq_end, linear in frequency over time."""
    n = int(SAMPLE_RATE * duration_s)
    release = max(1, int(n * 0.3))
    samples: list[float] = []
    phase = 0.0
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = freq_start + (freq_end - freq_start) * (t / duration_s)
        phase += freq / SAMPLE_RATE
        envelope = max(0.0, (n - i) / release) if i > n - release else 1.0
        samples.append(math.sin(2 * math.pi * phase) * envelope * AMPLITUDE)
    return samples


def _sequence(*parts: list[float], gap_s: float = 0.02) -> list[float]:
    gap = [0.0] * int(SAMPLE_RATE * gap_s)
    out: list[float] = []
    for i, part in enumerate(parts):
        out.extend(part)
        if i < len(parts) - 1:
            out.extend(gap)
    return out


CUES: dict[str, list[float]] = {
    # Impulse-buy: short rising two-note blip -- a small, satisfying "got it".
    "chime_positive": _sequence(_tone(660, 0.06, "square"), _tone(880, 0.09, "square")),
    # Spoilage: short low buzz -- unpleasant but brief, never alarming.
    "buzz_negative": _tone(140, 0.14, "square"),
    # Cart balk: short descending sweep -- a shopper giving up.
    "descend_sad": _sweep(520, 220, 0.22),
    # Discovery: bright three-note ascending arpeggio.
    "sparkle_up": _sequence(
        _tone(784, 0.05, "sine"), _tone(988, 0.05, "sine"), _tone(1319, 0.09, "sine")
    ),
}


def _write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)  # 16-bit PCM
        handle.setframerate(SAMPLE_RATE)
        frames = b"".join(
            struct.pack("<h", max(-32768, min(32767, int(sample * 32767))))
            for sample in samples
        )
        handle.writeframes(frames)


def main() -> None:
    for name, samples in CUES.items():
        out_path = OUT_DIR / f"{name}.wav"
        _write_wav(out_path, samples)
        print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
