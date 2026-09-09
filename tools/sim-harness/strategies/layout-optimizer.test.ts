import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_SHELF_INSTANCE_IDS, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import { layoutOptimizerStrategy } from './layout-optimizer.js';

describe('layoutOptimizerStrategy', () => {
  it('removes both baseline shelves and places four new ones stocked with all four goods, only on day 0', () => {
    const commands = layoutOptimizerStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);

    const removals = commands.filter((c) => c.type === 'removeFixture') as { instanceId: number }[];
    expect(removals.map((r) => r.instanceId).sort()).toEqual([...BASELINE_SHELF_INSTANCE_IDS].sort());

    const placements = commands.filter((c) => c.type === 'placeFixture');
    expect(placements).toHaveLength(4);

    const stocked = commands.filter((c) => c.type === 'stockFixture') as { instanceId: number; goodId: string }[];
    expect(stocked.map((s) => s.goodId).sort()).toEqual(['bread', 'eggs', 'milk', 'snacks']);
    expect(stocked.map((s) => s.instanceId).sort()).toEqual(
      Array.from({ length: 4 }, (_, i) => NEXT_INSTANCE_ID_AFTER_BASELINE + i),
    );

    expect(layoutOptimizerStrategy.decide({ day: 1, rng: new Stream(1), config: DEFAULT_HARNESS_CONFIG } as any)).toEqual([]);
  });
});
