import { describe, expect, it } from 'vitest';
import { buildFlowFieldDrawPlan } from './pathing-debug-plan.js';

describe('buildFlowFieldDrawPlan', () => {
  it('produces one arrow per field cell with a non-zero direction', () => {
    const field = [
      { x: 0, y: 0, dx: 1, dy: 0 },
      { x: 1, y: 0, dx: 0, dy: 0 }, // the destination cell itself — no arrow
    ];
    const plan = buildFlowFieldDrawPlan(field, { x: 0, y: 0 });
    expect(plan).toHaveLength(1);
  });

  it('draws each arrow starting at its cell center and ending offset toward dx,dy', () => {
    const field = [{ x: 2, y: 3, dx: 1, dy: 0 }];
    const plan = buildFlowFieldDrawPlan(field, { x: 0, y: 0 });
    expect(plan).toHaveLength(1);
    const arrow = plan[0]!;
    expect(arrow.x2).not.toBe(arrow.x1);
  });
});
