import { describe, expect, it } from 'vitest';
import { buildDrawPlan, floorVariant, rotationFrame, stateForStock } from './draw-plan.js';
import { depthFor, TILE_SIZE } from './projection.js';
import type { BuildModeSnapshot } from '../bridge/build-bridge.js';

const SNAPSHOT: BuildModeSnapshot = {
  dimensions: { width: 5, height: 5 },
  catalog: [
    { id: 'shelf_basic', name: 'Basic Shelf', footprint: { width: 1, height: 2 }, walkable: false },
    { id: 'register', name: 'Checkout Register', footprint: { width: 2, height: 1 }, walkable: false },
  ],
  placements: [{ instanceId: 1, fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 }],
};

const ORIGIN = { x: 0, y: 0 };

describe('buildDrawPlan', () => {
  it('emits one floor sprite per tile', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.floor).toHaveLength(5 * 5);
  });

  it('emits one sprite per placement, keyed into an atlas', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.fixtures).toHaveLength(1);
    expect(plan.fixtures[0]?.key).toBe('shelf_basic__full__r0');
    expect(plan.fixtures[0]?.atlas).toBe('world');
  });

  it('tints only the selected instance', () => {
    expect(buildDrawPlan(SNAPSHOT, ORIGIN, null).fixtures[0]?.tint).toBeNull();
    expect(buildDrawPlan(SNAPSHOT, ORIGIN, 1).fixtures[0]?.tint).toBeTypeOf('number');
  });

  it('anchors a fixture at the bottom-centre of its footprint', () => {
    // ADR 0004 — this is the point y-sort depth measures from. A 1x2 shelf at (2,2)
    // occupies rows 2 and 3, so its bottom edge is y=4 and its centre column is x=2.5.
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.fixtures[0]?.x).toBe(2.5 * TILE_SIZE);
    expect(plan.fixtures[0]?.y).toBe(4 * TILE_SIZE);
  });

  it('sorts a fixture by the bottom of its footprint, not its origin tile', () => {
    // A shopper standing on row 3 must draw in front of a shelf that occupies rows 2-3.
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.fixtures[0]?.depth).toBe(depthFor('fixture', 4));
    expect(plan.fixtures[0]?.depth).toBeGreaterThan(depthFor('agent', 3));
  });

  it('draws every floor tile beneath every fixture, whatever their rows', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    const deepestFloor = Math.max(...plan.floor.map((sprite) => sprite.depth));
    expect(deepestFloor).toBeLessThan(plan.fixtures[0]!.depth);
  });

  it('emits a placement cursor only when one is requested', () => {
    expect(buildDrawPlan(SNAPSHOT, ORIGIN, null).cursor).toHaveLength(0);
    const withCursor = buildDrawPlan(SNAPSHOT, ORIGIN, null, {
      cursor: { x: 1, y: 1, valid: false },
    });
    expect(withCursor.cursor[0]?.key).toBe('cursor_tile__invalid');
  });
});

describe('rotationFrame', () => {
  it('maps four sim rotations onto two renders by mirroring the back half', () => {
    // ADR 0004 — a shelf seen from the right is the same shelf seen from the left,
    // flipped, which is what halves the art budget.
    expect(rotationFrame(0, 2)).toEqual({ index: 0, flipX: false });
    expect(rotationFrame(90, 2)).toEqual({ index: 1, flipX: false });
    expect(rotationFrame(180, 2)).toEqual({ index: 0, flipX: true });
    expect(rotationFrame(270, 2)).toEqual({ index: 1, flipX: true });
  });

  it('uses all four renders when the art has them', () => {
    expect(rotationFrame(270, 4)).toEqual({ index: 3, flipX: false });
  });

  it('mirrors a single render rather than showing it backwards', () => {
    expect(rotationFrame(180, 1)).toEqual({ index: 0, flipX: true });
  });

  it('wraps rotations outside 0-359', () => {
    expect(rotationFrame(360, 2)).toEqual(rotationFrame(0, 2));
    expect(rotationFrame(-90, 2)).toEqual(rotationFrame(270, 2));
  });
});

describe('floorVariant', () => {
  it('is stable for a given tile', () => {
    expect(floorVariant(3, 7, 3)).toBe(floorVariant(3, 7, 3));
  });

  it('stays inside the declared variant count', () => {
    for (let x = 0; x < 20; x++) {
      for (let y = 0; y < 20; y++) {
        const variant = floorVariant(x, y, 3);
        expect(variant).toBeGreaterThanOrEqual(0);
        expect(variant).toBeLessThan(3);
      }
    }
  });

  it('actually varies across a grid', () => {
    const seen = new Set<number>();
    for (let x = 0; x < 10; x++) for (let y = 0; y < 10; y++) seen.add(floorVariant(x, y, 3));
    expect(seen.size).toBe(3);
  });

  it('collapses to zero when there is only one variant', () => {
    expect(floorVariant(5, 5, 1)).toBe(0);
  });
});

describe('stateForStock', () => {
  const SHELF_STATES = ['full', 'half', 'empty'];

  it('maps a full shelf to the fullest state and an empty one to the emptiest', () => {
    expect(stateForStock(SHELF_STATES, 1)).toBe('full');
    expect(stateForStock(SHELF_STATES, 0)).toBe('empty');
  });

  it('puts a middling shelf in the middle state', () => {
    expect(stateForStock(SHELF_STATES, 0.5)).toBe('half');
  });

  it('clamps out-of-range ratios rather than indexing past the states', () => {
    expect(stateForStock(SHELF_STATES, 5)).toBe('full');
    expect(stateForStock(SHELF_STATES, -3)).toBe('empty');
  });

  it('handles a two-state fixture, which is how registers work', () => {
    expect(stateForStock(['idle', 'busy'], 1)).toBe('idle');
    expect(stateForStock(['idle', 'busy'], 0)).toBe('busy');
  });

  it('returns undefined for a stateless asset, so the caller falls back to the default', () => {
    expect(stateForStock([], 0.5)).toBeUndefined();
  });
});

describe('buildDrawPlan with stock levels', () => {
  it('draws a shelf in the state matching how full it is', () => {
    const empty = buildDrawPlan(SNAPSHOT, ORIGIN, null, { stockLevels: new Map([[1, 0]]) });
    expect(empty.fixtures[0]?.key).toBe('shelf_basic__empty__r0');

    const full = buildDrawPlan(SNAPSHOT, ORIGIN, null, { stockLevels: new Map([[1, 1]]) });
    expect(full.fixtures[0]?.key).toBe('shelf_basic__full__r0');
  });

  it('falls back to the default state when no level is known for that instance', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null, { stockLevels: new Map([[99, 0]]) });
    expect(plan.fixtures[0]?.key).toBe('shelf_basic__full__r0');
  });
});
