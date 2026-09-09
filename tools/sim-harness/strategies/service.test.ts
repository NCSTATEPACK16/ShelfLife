import { describe, expect, it } from 'vitest';
import { Stream } from '../../../src/sim/index.js';
import { DEFAULT_HARNESS_CONFIG } from '../config.js';
import { BASELINE_STAFF_ID, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import { serviceStrategy } from './service.js';

describe('serviceStrategy', () => {
  it('places extra registers and hires staff to fill staffTarget, only on day 0', () => {
    const commands = serviceStrategy.decide({
      day: 0,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);
    const cfg = DEFAULT_HARNESS_CONFIG.strategies.service;
    const extraCount = cfg.staffTarget - 1;

    expect(commands.filter((c) => c.type === 'placeFixture')).toHaveLength(extraCount);
    const hires = commands.filter((c) => c.type === 'hireStaff') as { staffId: number; skill: number }[];
    expect(hires).toHaveLength(extraCount);
    for (const h of hires) {
      expect(h.staffId).not.toBe(BASELINE_STAFF_ID);
      expect(h.skill).toBe(cfg.hireSkill);
    }
    const assigns = commands.filter((c) => c.type === 'assignStaffToRegister') as { instanceId: number }[];
    expect(assigns.map((a) => a.instanceId).sort()).toEqual(
      Array.from({ length: extraCount }, (_, i) => NEXT_INSTANCE_ID_AFTER_BASELINE + i),
    );
  });

  it('trains all hired staff on cadence days only, after day 0', () => {
    const cfg = DEFAULT_HARNESS_CONFIG.strategies.service;
    const onCadence = serviceStrategy.decide({
      day: cfg.trainCadenceDays,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);
    expect(onCadence.every((c) => c.type === 'trainStaff')).toBe(true);
    expect(onCadence.length).toBe(cfg.staffTarget);

    const offCadence = serviceStrategy.decide({
      day: cfg.trainCadenceDays + 1,
      rng: new Stream(1),
      config: DEFAULT_HARNESS_CONFIG,
    } as any);
    expect(offCadence).toEqual([]);
  });
});
