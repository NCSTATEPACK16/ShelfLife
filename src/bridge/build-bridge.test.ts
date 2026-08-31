import { describe, expect, it } from 'vitest';
import { BuildModeBridge } from './build-bridge.js';
import { PlacementError } from '../sim/index.js';

describe('BuildModeBridge', () => {
  it('places a fixture and reflects it in the snapshot', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.place('shelf_basic', 2, 2, 0);
    const snap = bridge.snapshot();
    expect(snap.placements).toHaveLength(1);
    expect(snap.placements[0]?.fixtureId).toBe('shelf_basic');
  });

  it('exposes the fixture catalog in the snapshot', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    expect(bridge.snapshot().catalog.find((f) => f.id === 'shelf_basic')).toBeDefined();
  });

  it('rotates and removes a fixture', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.place('shelf_basic', 2, 2, 0);
    const instanceId = bridge.snapshot().placements[0]!.instanceId;
    bridge.rotate(instanceId, 90);
    expect(bridge.snapshot().placements[0]?.rotation).toBe(90);
    bridge.remove(instanceId);
    expect(bridge.snapshot().placements).toEqual([]);
  });

  it('throws PlacementError for an invalid placement, leaving state untouched', () => {
    const bridge = new BuildModeBridge({ width: 4, height: 4 });
    expect(() => bridge.place('shelf_basic', 3, 3, 0)).toThrow(PlacementError);
    expect(bridge.snapshot().placements).toEqual([]);
  });

  it('undo/redo round-trip through the bridge', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.place('shelf_basic', 2, 2, 0);
    expect(bridge.undo()).toBe(true);
    expect(bridge.snapshot().placements).toEqual([]);
    expect(bridge.redo()).toBe(true);
    expect(bridge.snapshot().placements).toHaveLength(1);
  });

  it('places and undoes 50 fixtures back to empty (the phase 1.4 gate, via the bridge)', () => {
    const bridge = new BuildModeBridge({ width: 50, height: 50 });
    for (let i = 0; i < 50; i++) bridge.place('cart_corral', i, 0, 0);
    for (let i = 0; i < 50; i++) expect(bridge.undo()).toBe(true);
    expect(bridge.snapshot().placements).toEqual([]);
  });

  it('hasUndo/hasRedo pass through the grid stack state', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    expect(bridge.hasUndo()).toBe(false);
    expect(bridge.hasRedo()).toBe(false);
    bridge.place('shelf_basic', 0, 0, 0);
    expect(bridge.hasUndo()).toBe(true);
    bridge.undo();
    expect(bridge.hasRedo()).toBe(true);
  });

  it('registers a pathing destination and exposes its flow field for debugging', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.registerDestination('debug-exit', [{ x: 9, y: 9 }]);
    const field = bridge.flowFieldDebug('debug-exit');
    expect(field.length).toBeGreaterThan(0);
    const origin = field.find((c) => c.x === 0 && c.y === 0);
    expect(origin).toBeDefined();
    expect(origin!.dx === 0 && origin!.dy === 0).toBe(false); // (0,0) is not the destination
  });

  it('unregisters a pathing destination', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.registerDestination('debug-exit', [{ x: 9, y: 9 }]);
    bridge.unregisterDestination('debug-exit');
    expect(() => bridge.flowFieldDebug('debug-exit')).toThrow();
  });

  it('adds a household, stocks a fixture, and spawns a shopper visible in the snapshot', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.place('shelf_basic', 5, 5, 0);
    const instanceId = bridge.snapshot().placements[0]!.instanceId;
    bridge.stockFixture(instanceId, 'milk');
    bridge.addHousehold(1, 'family', { x: 0, y: 0 });
    bridge.spawnShopper(100, 1);
    const shoppers = bridge.shoppersSnapshot();
    expect(shoppers).toHaveLength(1);
    expect(shoppers[0]?.id).toBe(100);
  });

  it('tick() advances the world without requiring a command', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    // Self-checkout needs no staffing to be an open lane — a plain 'register' would
    // leave this shopper with nowhere to queue and nothing to walk toward.
    bridge.place('self_checkout', 8, 8, 0);
    bridge.addHousehold(1, 'family', { x: 0, y: 0 });
    // A fully-stocked household has an empty list, so this shopper heads straight to
    // checkout — enough to prove tick() moves it without any further command.
    bridge.spawnShopper(100, 1);
    const before = bridge.shoppersSnapshot()[0]!;
    // One tick picks the checkout lane, the next actually steers toward it — both are
    // real "tick() with no command" steps, so calling it twice still proves the point.
    bridge.tick();
    bridge.tick();
    const after = bridge.shoppersSnapshot()[0]!;
    expect(after.x !== before.x || after.y !== before.y).toBe(true);
  });

  it('exposes the counters the gentle surface diffs, alongside position and segment', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.place('shelf_basic', 5, 5, 0);
    bridge.stockFixture(bridge.snapshot().placements[0]!.instanceId, 'milk');
    bridge.addHousehold(1, 'family', { x: 0, y: 0 });
    bridge.spawnShopper(100, 1);

    const shopper = bridge.shoppersSnapshot()[0]!;
    expect(shopper.segment).toBe('family');
    // Every field the draw plan reads has to be present from the first tick, not appear
    // once it becomes non-zero — a missing key and a zero are the same `undefined` to a
    // delta check, and the tell would silently never fire.
    for (const field of [
      'listRemaining',
      'cartSize',
      'spoiledEncounters',
      'priceSurpriseSum',
      'impulseHits',
    ] as const) {
      expect(typeof shopper[field]).toBe('number');
    }
    expect(shopper.balked).toBe(false);
    expect(shopper.abandoned).toBe(false);
    expect(shopper.checkoutJoinedAtTick).toBeNull();
  });

  it('drains sim events once, in emission order', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    bridge.tick();
    const first = bridge.drainEvents();
    expect(first.some((event) => event.type === 'tick')).toBe(true);
    // Draining is destructive on purpose (src/sim/core/events.ts): events are never
    // buffered across ticks, so a second consumer would silently starve the first.
    expect(bridge.drainEvents()).toHaveLength(0);
  });

  it('reports the current tick, so the view can age its own timers against sim time', () => {
    const bridge = new BuildModeBridge({ width: 10, height: 10 });
    const start = bridge.currentTick();
    bridge.tick();
    bridge.tick();
    expect(bridge.currentTick()).toBe(start + 2);
  });
});
