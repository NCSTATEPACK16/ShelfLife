import { describe, expect, it, vi } from 'vitest';
import { NullAudioPlayer, getAudioPlayer, setAudioPlayer } from './index.js';

describe('NullAudioPlayer', () => {
  it('is a true no-op for both methods', () => {
    const player = new NullAudioPlayer();
    expect(() => player.playTell('impulsePurchase')).not.toThrow();
    expect(() => player.setMuted(true)).not.toThrow();
  });
});

describe('getAudioPlayer / setAudioPlayer', () => {
  it('returns the same instance across calls until replaced', () => {
    const first = getAudioPlayer();
    expect(getAudioPlayer()).toBe(first);

    const fake = new NullAudioPlayer();
    const spy = vi.spyOn(fake, 'playTell');
    setAudioPlayer(fake);
    expect(getAudioPlayer()).toBe(fake);
    getAudioPlayer().playTell('discovery');
    expect(spy).toHaveBeenCalledWith('discovery');
  });
});
