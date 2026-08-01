import { describe, expect, it } from 'vitest';
import { World, replay } from './world.js';
import type { System } from './world.js';
import type { Hasher } from './hash.js';
import { TICKS_PER_SIM_DAY } from './clock.js';

/** A system that consumes RNG, so hash coverage is exercised rather than assumed. */
function noisySystem(name = 'noisy'): System & { calls: number } {
  return {
    name,
    calls: 0,
    update(world) {
      this.calls++;
      world.rng.get('spawn').nextUint32();
    },
    hash(world, hasher: Hasher) {
      hasher.u32(this.calls);
      hasher.u32(world.rng.get('spawn').draws);
    },
  };
}

describe('World construction', () => {
  it('rejects a non-integer seed instead of silently truncating', () => {
    expect(() => new World({ seed: 1.5 })).toThrow(TypeError);
  });

  it('starts at tick 0, unpaused, at speed 1', () => {
    const w = new World({ seed: 1 });
    expect(w.tick).toBe(0);
    expect(w.paused).toBe(false);
    expect(w.speed).toBe(1);
  });
});

describe('System registration', () => {
  it('records systems in order', () => {
    const w = new World({ seed: 1 });
    w.register(noisySystem('a'));
    w.register(noisySystem('b'));
    expect(w.systemNames).toEqual(['a', 'b']);
  });

  it('refuses duplicate names', () => {
    const w = new World({ seed: 1 });
    w.register(noisySystem('a'));
    expect(() => w.register(noisySystem('a'))).toThrow(/Duplicate system/);
  });

  it('refuses registration after the world has started', () => {
    // Registration order is part of determinism; adding a system mid-run would make
    // the world unreproducible from its seed and log.
    const w = new World({ seed: 1 });
    w.step();
    expect(() => w.register(noisySystem())).toThrow(/after the world has started/);
  });

  it('makes registration order affect the hash', () => {
    const a = new World({ seed: 1 });
    a.register(noisySystem('x'));
    a.register(noisySystem('y'));

    const b = new World({ seed: 1 });
    b.register(noisySystem('y'));
    b.register(noisySystem('x'));

    expect(a.hash).not.toBe(b.hash);
  });
});

describe('Ticking', () => {
  it('advances the clock and runs systems once each', () => {
    const w = new World({ seed: 1 });
    const sys = noisySystem();
    w.register(sys);
    w.run(10);
    expect(w.tick).toBe(10);
    expect(sys.calls).toBe(10);
  });

  it('emits a tick event every tick', () => {
    const w = new World({ seed: 1 });
    w.run(3);
    const ticks = w.events.drain().filter((e) => e.type === 'tick');
    expect(ticks).toHaveLength(3);
  });

  it('emits dayStarted on the day boundary', () => {
    const w = new World({ seed: 1 });
    w.run(TICKS_PER_SIM_DAY);
    const days = w.events.drain().filter((e) => e.type === 'dayStarted');
    expect(days).toHaveLength(1);
  });

  it('rejects a negative or fractional run count', () => {
    const w = new World({ seed: 1 });
    expect(() => w.run(-1)).toThrow(RangeError);
    expect(() => w.run(2.5)).toThrow(RangeError);
  });
});

describe('Commands', () => {
  it('applies at a tick boundary, not mid-tick', () => {
    const w = new World({ seed: 1 });
    w.commands.push({ type: 'pause' });
    expect(w.paused).toBe(false); // not yet
    w.step();
    expect(w.paused).toBe(true);
  });

  it('halts systems while paused but keeps the clock running', () => {
    const w = new World({ seed: 1 });
    const sys = noisySystem();
    w.register(sys);
    w.run(2);
    w.commands.push({ type: 'pause' });
    w.run(5);

    expect(sys.calls).toBe(2);
    expect(w.tick).toBe(7);
  });

  it('resumes', () => {
    const w = new World({ seed: 1 });
    const sys = noisySystem();
    w.register(sys);
    w.commands.push({ type: 'pause' });
    w.step();
    w.commands.push({ type: 'resume' });
    w.run(3);
    expect(sys.calls).toBe(3);
  });

  it('clamps speed rather than aborting on a malformed value', () => {
    // A bad value in a replayed log should not abort verification of an otherwise
    // valid run.
    const w = new World({ seed: 1 });
    w.commands.push({ type: 'setSpeed', multiplier: 999 });
    w.step();
    expect(w.speed).toBe(8);

    w.commands.push({ type: 'setSpeed', multiplier: -5 });
    w.step();
    expect(w.speed).toBe(0);
  });

  it('logs every command with the tick it applied on', () => {
    const w = new World({ seed: 1 });
    w.step();
    w.commands.push({ type: 'pause' });
    w.step();
    expect(w.commands.log).toEqual([{ tick: 1, command: { type: 'pause' } }]);
  });

  it('preserves push order within a tick', () => {
    const w = new World({ seed: 1 });
    w.commands.push({ type: 'pause' });
    w.commands.push({ type: 'resume' });
    w.step();
    expect(w.paused).toBe(false);
    expect(w.commands.log.map((e) => e.command.type)).toEqual(['pause', 'resume']);
  });
});

describe('Determinism — the phase gate', () => {
  it('produces an identical hash sequence across runs', () => {
    const sequence = (): number[] => {
      const w = new World({ seed: 20260731 });
      w.register(noisySystem());
      return Array.from({ length: 500 }, () => {
        w.step();
        return w.hash;
      });
    };
    const a = sequence();
    const b = sequence();
    const c = sequence();
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('runs 10,000 ticks to a stable hash across three runs', () => {
    // The literal phase 1.3 gate. Kept as a unit test as well as a golden test so it
    // fails fast and locally.
    const final = (): number => {
      const w = new World({ seed: 999 });
      w.register(noisySystem());
      w.run(10_000);
      return w.hash;
    };
    const first = final();
    expect(final()).toBe(first);
    expect(final()).toBe(first);
  });

  it('gives different seeds different histories', () => {
    const run = (seed: number): number => {
      const w = new World({ seed });
      w.register(noisySystem());
      w.run(100);
      return w.hash;
    };
    expect(run(1)).not.toBe(run(2));
  });

  it('changes the hash when the world changes', () => {
    const w = new World({ seed: 1 });
    const before = w.hash;
    w.step();
    expect(w.hash).not.toBe(before);
  });

  it('reaches the same hash whether run in one call or many', () => {
    const once = new World({ seed: 77 });
    once.register(noisySystem());
    once.run(300);

    const chunked = new World({ seed: 77 });
    chunked.register(noisySystem());
    for (let i = 0; i < 30; i++) chunked.run(10);

    expect(chunked.hash).toBe(once.hash);
  });
});

describe('Snapshots', () => {
  it('reports the current state', () => {
    const w = new World({ seed: 42 });
    w.run(5);
    const snap = w.snapshot();
    expect(snap).toMatchObject({ tick: 5, seed: 42, speed: 1, paused: false, hash: w.hash });
  });

  it('is frozen, so the renderer cannot mutate the simulation by accident', () => {
    const snap = new World({ seed: 1 }).snapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it('returns a new object each time, so two can be interpolated between', () => {
    const w = new World({ seed: 1 });
    const a = w.snapshot();
    w.step();
    const b = w.snapshot();
    expect(a).not.toBe(b);
    expect(a.tick).toBe(0);
    expect(b.tick).toBe(1);
  });

  it('survives structured clone, which is what the worker move requires', () => {
    const snap = new World({ seed: 1 }).snapshot();
    expect(structuredClone(snap)).toEqual(snap);
  });
});

describe('replay — save/load and leaderboard verification', () => {
  it('reproduces a world exactly from seed plus command log', () => {
    const live = new World({ seed: 8675309 });
    live.register(noisySystem());
    live.run(50);
    live.commands.push({ type: 'setSpeed', multiplier: 4 });
    live.run(50);
    live.commands.push({ type: 'pause' });
    live.run(50);

    const replayed = replay(8675309, live.commands.log, 150, (w) => w.register(noisySystem()));

    expect(replayed.tick).toBe(live.tick);
    expect(replayed.hash).toBe(live.hash);
    expect(replayed.paused).toBe(live.paused);
    expect(replayed.speed).toBe(live.speed);
  });

  it('detects a tampered command log — the anti-cheat property', () => {
    // This is what makes a submitted leaderboard score verifiable: replaying an
    // altered log produces a different hash than the one claimed.
    const live = new World({ seed: 1234 });
    live.register(noisySystem());
    live.commands.push({ type: 'setSpeed', multiplier: 2 });
    live.run(100);
    const honest = live.hash;

    const tampered = live.commands.log.map((e) =>
      e.command.type === 'setSpeed' ? { ...e, command: { type: 'setSpeed' as const, multiplier: 8 } } : e,
    );
    const forged = replay(1234, tampered, 100, (w) => w.register(noisySystem()));

    expect(forged.hash).not.toBe(honest);
  });

  it('detects a wrong seed', () => {
    const live = new World({ seed: 111 });
    live.register(noisySystem());
    live.run(100);
    const wrong = replay(222, live.commands.log, 100, (w) => w.register(noisySystem()));
    expect(wrong.hash).not.toBe(live.hash);
  });

  it('replays an empty log', () => {
    expect(replay(5, [], 10).tick).toBe(10);
  });
});
