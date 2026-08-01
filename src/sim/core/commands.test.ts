import { describe, expect, it } from 'vitest';
import { CommandQueue, hashCommand } from './commands.js';
import type { Command } from './commands.js';
import { Hasher } from './hash.js';
import { hashCommands } from './world.js';

describe('CommandQueue', () => {
  it('holds commands until drained', () => {
    const q = new CommandQueue();
    q.push({ type: 'pause' });
    q.push({ type: 'resume' });
    expect(q.pendingCount).toBe(2);

    const batch = q.drain(5);
    expect(batch.map((c) => c.type)).toEqual(['pause', 'resume']);
    expect(q.pendingCount).toBe(0);
  });

  it('returns a stable empty batch when nothing is queued', () => {
    const q = new CommandQueue();
    expect(q.drain(0)).toEqual([]);
    // Frozen shared constant — draining an empty queue every tick must not allocate.
    expect(Object.isFrozen(q.drain(1))).toBe(true);
  });

  it('records the tick each command applied on', () => {
    const q = new CommandQueue();
    q.push({ type: 'pause' });
    q.drain(10);
    q.push({ type: 'resume' });
    q.drain(20);

    expect(q.log).toEqual([
      { tick: 10, command: { type: 'pause' } },
      { tick: 20, command: { type: 'resume' } },
    ]);
  });

  it('does not log anything for an empty drain', () => {
    const q = new CommandQueue();
    q.drain(1);
    q.drain(2);
    expect(q.log).toEqual([]);
  });

  it('groups a log back by tick for replay', () => {
    const byTick = CommandQueue.fromLog([
      { tick: 0, command: { type: 'pause' } },
      { tick: 0, command: { type: 'resume' } },
      { tick: 7, command: { type: 'setSpeed', multiplier: 2 } },
    ]);

    expect(byTick.get(0)?.map((c) => c.type)).toEqual(['pause', 'resume']);
    expect(byTick.get(7)).toHaveLength(1);
    expect(byTick.get(99)).toBeUndefined();
  });

  it('groups an empty log without error', () => {
    expect(CommandQueue.fromLog([]).size).toBe(0);
  });
});

describe('hashCommand', () => {
  const hashOf = (c: Command): number => {
    const h = new Hasher();
    hashCommand(h, c);
    return h.value;
  };

  it('distinguishes command types', () => {
    expect(hashOf({ type: 'pause' })).not.toBe(hashOf({ type: 'resume' }));
    expect(hashOf({ type: 'noop' })).not.toBe(hashOf({ type: 'pause' }));
  });

  it('includes the payload, so a tampered value is detectable', () => {
    expect(hashOf({ type: 'setSpeed', multiplier: 2 })).not.toBe(
      hashOf({ type: 'setSpeed', multiplier: 4 }),
    );
  });

  it('is stable for identical commands', () => {
    expect(hashOf({ type: 'setSpeed', multiplier: 2 })).toBe(
      hashOf({ type: 'setSpeed', multiplier: 2 }),
    );
  });

  it('throws on an unknown command rather than hashing it as nothing', () => {
    // The `never` exhaustiveness check makes adding a command type without deciding
    // how it hashes a compile error; this covers the runtime half, for a malformed
    // command arriving from a replayed log.
    const bogus = { type: 'notARealCommand' } as unknown as Command;
    expect(() => hashCommand(new Hasher(), bogus)).toThrow(/Unhashed command type/);
  });
});

describe('hashCommands', () => {
  it('is order-sensitive', () => {
    const a: Command[] = [{ type: 'pause' }, { type: 'resume' }];
    const b: Command[] = [{ type: 'resume' }, { type: 'pause' }];
    expect(hashCommands(a)).not.toBe(hashCommands(b));
  });

  it('distinguishes a batch from its prefix', () => {
    expect(hashCommands([{ type: 'pause' }])).not.toBe(
      hashCommands([{ type: 'pause' }, { type: 'noop' }]),
    );
  });

  it('handles an empty batch', () => {
    expect(hashCommands([])).toBeTypeOf('number');
  });
});
