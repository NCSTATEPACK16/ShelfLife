import { describe, expect, it } from 'vitest';
import { buildShopperDrawPlan, facingFor, ShopperAnimator, type ShopperView } from './shopper-draw-plan.js';
import { depthFor, TILE_SIZE } from './projection.js';

const at = (id: number, x: number, y: number, segment?: string): ShopperView => ({
  id,
  x,
  y,
  state: 'shopping',
  segment,
});

describe('buildShopperDrawPlan', () => {
  it('produces one sprite per active shopper', () => {
    const plan = buildShopperDrawPlan([at(1, 2.5, 3.5), at(2, 6, 6)], { x: 0, y: 0 }, new ShopperAnimator());
    expect(plan).toHaveLength(2);
  });

  it('places each sprite at the projection of its world position', () => {
    const plan = buildShopperDrawPlan([at(1, 0, 0)], { x: 100, y: 50 }, new ShopperAnimator());
    expect(plan[0]?.x).toBe(100);
    expect(plan[0]?.y).toBe(50);
  });

  it('sorts a shopper by its row, so it interleaves with fixtures', () => {
    const plan = buildShopperDrawPlan([at(1, 1, 4)], { x: 0, y: 0 }, new ShopperAnimator());
    expect(plan[0]?.depth).toBe(depthFor('agent', 4));
    // Behind a shelf whose bottom edge is further down the screen, in front of one above.
    expect(plan[0]?.depth).toBeLessThan(depthFor('fixture', 5));
    expect(plan[0]?.depth).toBeGreaterThan(depthFor('fixture', 3));
  });

  it('picks the palette matching the household segment', () => {
    const plan = buildShopperDrawPlan([at(1, 0, 0, 'foodie')], { x: 0, y: 0 }, new ShopperAnimator());
    expect(plan[0]?.key).toContain('__pfoodie');
  });

  it('falls back to a real palette for an unknown or missing segment', () => {
    // A shopper with no art is still a shopper; throwing here would drop the whole frame.
    for (const segment of [undefined, 'nonexistent']) {
      const plan = buildShopperDrawPlan([at(1, 0, 0, segment)], { x: 0, y: 0 }, new ShopperAnimator());
      expect(plan[0]?.key).toMatch(/__p[a-zA-Z]+$/);
    }
  });

  it('scales with the tile size rather than assuming pixels', () => {
    const plan = buildShopperDrawPlan([at(1, 1, 1)], { x: 0, y: 0 }, new ShopperAnimator());
    expect(plan[0]?.x).toBe(TILE_SIZE);
  });
});

describe('facingFor', () => {
  it('picks the dominant axis', () => {
    expect(facingFor(1, 0.2)).toBe('right');
    expect(facingFor(-1, 0.2)).toBe('left');
    expect(facingFor(0.2, 1)).toBe('down');
    expect(facingFor(0.2, -1)).toBe('up');
  });

  it('keeps the previous facing when standing still', () => {
    // Otherwise a stopped shopper snaps to a default direction, which reads as a twitch.
    expect(facingFor(0, 0, 'left')).toBe('left');
  });
});

describe('ShopperAnimator', () => {
  it('reports idle until the shopper actually moves', () => {
    const animator = new ShopperAnimator();
    expect(animator.advance(at(1, 0, 0)).moving).toBe(false);
    expect(animator.advance(at(1, 0.5, 0)).moving).toBe(true);
  });

  it('derives facing from movement between frames', () => {
    const animator = new ShopperAnimator();
    animator.advance(at(1, 5, 5));
    expect(animator.advance(at(1, 5, 6)).facing).toBe('down');
    expect(animator.advance(at(1, 4, 6)).facing).toBe('left');
  });

  it('advances the walk cycle by distance, not by frame count', () => {
    // Sprites move at different speeds; a per-frame counter would make a slow shopper
    // moonwalk and a fast one look sedate. Two steps per tile means a quarter-tile of
    // travel flips the frame and a half-tile completes the cycle.
    const animator = new ShopperAnimator();
    animator.advance(at(1, 0, 0));
    expect(animator.advance(at(1, 0.25, 0)).frame).toBe(1);
    expect(animator.advance(at(1, 0.5, 0)).frame).toBe(0);
  });

  it('holds the same frame when barely moving', () => {
    const animator = new ShopperAnimator();
    animator.advance(at(1, 0, 0));
    expect(animator.advance(at(1, 0.01, 0)).frame).toBe(0);
    expect(animator.advance(at(1, 0.02, 0)).frame).toBe(0);
  });

  it('forgets shoppers that have left', () => {
    const animator = new ShopperAnimator();
    animator.advance(at(7, 3, 3));
    animator.prune(new Set());
    // Having been forgotten, a returning id starts fresh: no movement, so no walk frame.
    expect(animator.advance(at(7, 9, 9)).moving).toBe(false);
  });
});
