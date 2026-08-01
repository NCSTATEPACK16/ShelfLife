import { describe, expect, it } from 'vitest';
import { DEFAULT_PATHING_CONFIG, parsePathingConfig } from './config.js';

describe('parsePathingConfig', () => {
  it('parses a valid config', () => {
    const config = parsePathingConfig({
      maxSpeed: 0.5,
      separationRadius: 1,
      separationWeight: 2,
      arrivalRadius: 0.1,
    });
    expect(config).toEqual({
      maxSpeed: 0.5,
      separationRadius: 1,
      separationWeight: 2,
      arrivalRadius: 0.1,
    });
  });

  it('rejects a non-positive maxSpeed', () => {
    expect(() =>
      parsePathingConfig({ maxSpeed: 0, separationRadius: 1, separationWeight: 1, arrivalRadius: 0.1 }),
    ).toThrow();
  });

  it('loads content/balance/pathing.json5 into DEFAULT_PATHING_CONFIG', () => {
    expect(DEFAULT_PATHING_CONFIG.maxSpeed).toBeGreaterThan(0);
    expect(DEFAULT_PATHING_CONFIG.separationRadius).toBeGreaterThan(0);
    expect(DEFAULT_PATHING_CONFIG.separationWeight).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_PATHING_CONFIG.arrivalRadius).toBeGreaterThan(0);
  });
});
