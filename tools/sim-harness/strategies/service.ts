import type { Command } from '../../../src/sim/index.js';
import { BASELINE_STAFF_ID, NEXT_INSTANCE_ID_AFTER_BASELINE } from '../world.js';
import type { Strategy } from './types.js';

const EXTRA_REGISTER_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 15, y: 17 },
  { x: 15, y: 19 },
];

export const serviceStrategy: Strategy = {
  name: 'service',
  decide(ctx) {
    const commands: Command[] = [];
    const cfg = ctx.config.strategies.service;
    const extraStaffCount = Math.min(Math.max(0, cfg.staffTarget - 1), EXTRA_REGISTER_POSITIONS.length);

    if (ctx.day === 0) {
      for (let i = 0; i < extraStaffCount; i++) {
        const pos = EXTRA_REGISTER_POSITIONS[i]!;
        const instanceId = NEXT_INSTANCE_ID_AFTER_BASELINE + i;
        const staffId = BASELINE_STAFF_ID + 1 + i;
        commands.push({ type: 'placeFixture', fixtureId: 'register', x: pos.x, y: pos.y, rotation: 0 });
        commands.push({ type: 'hireStaff', staffId, skill: cfg.hireSkill, morale: cfg.hireMorale });
        commands.push({ type: 'assignStaffToRegister', staffId, instanceId });
      }
      return commands;
    }

    if (ctx.day % cfg.trainCadenceDays === 0) {
      const hiredCount = extraStaffCount + 1; // + the baseline hire
      for (let staffId = BASELINE_STAFF_ID; staffId < BASELINE_STAFF_ID + hiredCount; staffId++) {
        commands.push({ type: 'trainStaff', staffId });
      }
    }

    return commands;
  },
};
