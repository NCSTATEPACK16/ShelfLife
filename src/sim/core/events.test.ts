import { describe, expect, it } from 'vitest';
import { EventBus } from './events.js';

describe('EventBus', () => {
  it('collects events in emission order', () => {
    const bus = new EventBus();
    bus.emit({ type: 'tick', tick: 1 });
    bus.emit({ type: 'paused' });
    bus.emit({ type: 'tick', tick: 2 });

    expect(bus.drain().map((e) => e.type)).toEqual(['tick', 'paused', 'tick']);
  });

  it('empties on drain, so events never leak across ticks', () => {
    const bus = new EventBus();
    bus.emit({ type: 'resumed' });
    expect(bus.drain()).toHaveLength(1);
    expect(bus.drain()).toHaveLength(0);
    expect(bus.pendingCount).toBe(0);
  });

  it('returns a stable frozen empty batch when idle', () => {
    // Drained every tick whether or not anything happened; must not allocate.
    const bus = new EventBus();
    expect(Object.isFrozen(bus.drain())).toBe(true);
  });

  it('does not dispatch synchronously to subscribers', () => {
    // There is deliberately no subscribe(). Synchronous dispatch invites a system
    // reacting to an event, which would make subscriber registration order affect the
    // world hash. Collecting per tick makes the output-only rule structural.
    const bus = new EventBus() as unknown as Record<string, unknown>;
    expect(bus['subscribe']).toBeUndefined();
    expect(bus['on']).toBeUndefined();
  });

  it('tracks pending count between drains', () => {
    const bus = new EventBus();
    expect(bus.pendingCount).toBe(0);
    bus.emit({ type: 'speedChanged', multiplier: 2 });
    bus.emit({ type: 'dayStarted', day: 1 });
    expect(bus.pendingCount).toBe(2);
  });

  it('accepts campaign events', () => {
    const bus = new EventBus();
    bus.emit({ type: 'chapterStarted', levelId: 'l1', chapterIndex: 1 });
    bus.emit({ type: 'chapterComplete', levelId: 'l1', chapterIndex: 0 });
    bus.emit({ type: 'levelWon', levelId: 'l1' });
    bus.emit({ type: 'levelLost', levelId: 'l1' });
    expect(bus.drain().map((e) => e.type)).toEqual([
      'chapterStarted',
      'chapterComplete',
      'levelWon',
      'levelLost',
    ]);
  });
});
