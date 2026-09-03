import { describe, expect, it } from 'vitest';
import { buildDrawPlan } from './draw-plan.js';
import type { CampaignSnapshot } from '../bridge/campaign-bridge.js';

const SNAPSHOT: CampaignSnapshot = {
  dimensions: { width: 5, height: 5 },
  catalog: [
    { id: 'shelf_basic', name: 'Basic Shelf', footprint: { width: 1, height: 2 }, walkable: false },
  ],
  placements: [{ instanceId: 1, fixtureId: 'shelf_basic', x: 2, y: 2, rotation: 0 }],
};

const ORIGIN = { x: 0, y: 0 };

describe('buildDrawPlan', () => {
  it('emits grid lines covering the full grid', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.gridLines.length).toBeGreaterThan(0);
  });

  it('emits one fixture rect per placement', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.fixtures).toHaveLength(1);
    expect(plan.fixtures[0]?.selected).toBe(false);
  });

  it('marks the selected instance', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, 1);
    expect(plan.fixtures[0]?.selected).toBe(true);
  });

  it('gives every fixture a defined color', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(typeof plan.fixtures[0]?.color).toBe('number');
  });

  it('carries the placement instanceId, for matching against shelf-fullness data', () => {
    const plan = buildDrawPlan(SNAPSHOT, ORIGIN, null);
    expect(plan.fixtures[0]?.instanceId).toBe(1);
  });
});
