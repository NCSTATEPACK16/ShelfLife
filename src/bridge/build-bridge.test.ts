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
});
