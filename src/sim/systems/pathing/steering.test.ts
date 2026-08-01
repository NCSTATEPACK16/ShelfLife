import { describe, expect, it } from 'vitest';
import { computeSteering } from './steering.js';
import type { PathingConfig } from './config.js';

const CONFIG: PathingConfig = {
  maxSpeed: 1,
  separationRadius: 1,
  separationWeight: 2,
  arrivalRadius: 0.25,
};

describe('computeSteering', () => {
  it('follows the flow direction at max speed with no neighbors', () => {
    const v = computeSteering({ position: { x: 0, y: 0 }, neighbors: [] }, { x: 1, y: 0 }, 5, CONFIG);
    expect(v.x).toBeCloseTo(CONFIG.maxSpeed);
    expect(v.y).toBeCloseTo(0);
  });

  it('slows and stops within the arrival radius', () => {
    const v = computeSteering({ position: { x: 0, y: 0 }, neighbors: [] }, { x: 0, y: 0 }, 0.1, CONFIG);
    expect(Math.hypot(v.x, v.y)).toBe(0);
  });

  it('pushes away from a neighbor closer than separationRadius', () => {
    // Neighbor directly to the east; separation should push the agent's velocity west-ish,
    // pulling it off the pure eastward flow direction.
    const v = computeSteering(
      { position: { x: 0, y: 0 }, neighbors: [{ x: 0.3, y: 0 }] },
      { x: 1, y: 0 },
      5,
      CONFIG,
    );
    expect(v.x).toBeLessThan(CONFIG.maxSpeed);
  });

  it('ignores neighbors outside separationRadius', () => {
    const withFarNeighbor = computeSteering(
      { position: { x: 0, y: 0 }, neighbors: [{ x: 10, y: 10 }] },
      { x: 1, y: 0 },
      5,
      CONFIG,
    );
    const withNoNeighbor = computeSteering({ position: { x: 0, y: 0 }, neighbors: [] }, { x: 1, y: 0 }, 5, CONFIG);
    expect(withFarNeighbor).toEqual(withNoNeighbor);
  });

  it('never exceeds maxSpeed even under separation pressure from multiple neighbors', () => {
    const v = computeSteering(
      {
        position: { x: 0, y: 0 },
        neighbors: [
          { x: 0.2, y: 0 },
          { x: -0.2, y: 0 },
          { x: 0, y: 0.2 },
        ],
      },
      { x: 1, y: 0 },
      5,
      CONFIG,
    );
    expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(CONFIG.maxSpeed + 1e-9);
  });
});
