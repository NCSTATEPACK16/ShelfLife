import { Howl } from 'howler';
import chimePositiveUrl from '../../../assets/audio/sfx/chime_positive.wav';
import buzzNegativeUrl from '../../../assets/audio/sfx/buzz_negative.wav';
import descendSadUrl from '../../../assets/audio/sfx/descend_sad.wav';
import sparkleUpUrl from '../../../assets/audio/sfx/sparkle_up.wav';
import type { TellTerm } from '../../sim/content/gentle-surface.js';

/**
 * Audio (PLAN.md §6.4, ADR 0009).
 *
 * One interface over Howler.js, the same shape `src/platform/storage`'s `KeyValueStore`
 * already uses: a real implementation, a no-op implementation for tests and headless
 * contexts, and a swappable singleton with a test seam. The game never calls Howler
 * directly outside this module.
 */

export interface AudioPlayer {
  playTell(term: TellTerm): void;
  setMuted(muted: boolean): void;
}

const CUE_URL: Readonly<Record<string, string>> = {
  chime_positive: chimePositiveUrl,
  buzz_negative: buzzNegativeUrl,
  descend_sad: descendSadUrl,
  sparkle_up: sparkleUpUrl,
};

/** Which cue plays for which term — mirrors `content/design/gentle-surface.json5`'s `sound`
 * field. Kept here rather than read from content, since this is a fixed, small, code-level
 * lookup from an id string to a bundled asset URL, not game-tunable content. */
const CUE_FOR_TERM: Readonly<Partial<Record<TellTerm, string>>> = {
  impulsePurchase: 'chime_positive',
  spoiledEncounters: 'buzz_negative',
  queuePenaltyBalk: 'descend_sad',
  discovery: 'sparkle_up',
};

/** Real Howler-backed player. One `Howl` per cue, loaded lazily and cached by cue id. */
export class HowlerAudioPlayer implements AudioPlayer {
  readonly #cues = new Map<string, Howl>();
  #muted = false;

  playTell(term: TellTerm): void {
    const cue = CUE_FOR_TERM[term];
    if (cue === undefined) return; // no sound declared for this term
    let howl = this.#cues.get(cue);
    if (howl === undefined) {
      howl = new Howl({ src: [CUE_URL[cue]!], volume: 0.6 });
      this.#cues.set(cue, howl);
    }
    if (!this.#muted) howl.play();
  }

  setMuted(muted: boolean): void {
    this.#muted = muted;
  }
}

/** No-op: used by tests, and by any headless context with no audio device. */
export class NullAudioPlayer implements AudioPlayer {
  playTell(_term: TellTerm): void {
    // Intentionally empty.
  }

  setMuted(_muted: boolean): void {
    // Intentionally empty.
  }
}

let player: AudioPlayer | undefined;

export function getAudioPlayer(): AudioPlayer {
  player ??= typeof window === 'undefined' ? new NullAudioPlayer() : new HowlerAudioPlayer();
  return player;
}

/** Test seam. */
export function setAudioPlayer(next: AudioPlayer): void {
  player = next;
}
