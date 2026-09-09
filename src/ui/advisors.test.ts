import { describe, expect, it } from 'vitest';
import { createAdvisorCooldownState, deriveAdvisorLines } from './advisors.js';
import type { AdvisorInput } from './advisors.js';

const emptyInput: AdvisorInput = {
  latestStatement: null,
  rivalIntel: { rivals: [], player: { priceLevel: 1, serviceScore: 0.5 } },
  campaignState: { levelId: 'l1', chapterIndex: 0, chapterStatus: 'inProgress', levelStatus: 'inProgress' },
  recentTellCounts: {},
  tick: 0,
};

describe('deriveAdvisorLines', () => {
  it('produces no lines when nothing is wrong', () => {
    const lines = deriveAdvisorLines(emptyInput, createAdvisorCooldownState());
    expect(lines).toHaveLength(0);
  });

  it('Diane flags spoilage exceeding the revenue-fraction threshold', () => {
    const input: AdvisorInput = {
      ...emptyInput,
      latestStatement: {
        day: 0, revenue: 100, cogs: 40, labor: 10, rent: 5, utilities: 2, marketing: 0,
        shrink: 0, spoilage: 30, ebitda: 13,
      },
    };
    const lines = deriveAdvisorLines(input, createAdvisorCooldownState());
    expect(lines.find((l) => l.advisor === 'diane')).toBeDefined();
    expect(lines.find((l) => l.advisor === 'diane')?.showMe.tab).toBe('finance');
  });

  it('Marcus flags a checkout-queue tell frequency spike', () => {
    const input: AdvisorInput = { ...emptyInput, recentTellCounts: { queuePenaltyBalk: 5 } };
    const lines = deriveAdvisorLines(input, createAdvisorCooldownState());
    expect(lines.find((l) => l.advisor === 'marcus')?.showMe.tab).toBe('staff');
  });

  it('Chloe flags a rival price move relative to the player', () => {
    const input: AdvisorInput = {
      ...emptyInput,
      rivalIntel: {
        rivals: [
          {
            id: 'sav-a-lott', name: 'Sav-A-Lott', archetype: 'discounter', communityLove: 22,
            quality: 0.3, service: 0.2, ambiance: 0.3, priceIndex: 0.6,
          },
        ],
        player: { priceLevel: 1, serviceScore: 0.5 },
      },
    };
    const lines = deriveAdvisorLines(input, createAdvisorCooldownState());
    expect(lines.find((l) => l.advisor === 'chloe')?.showMe.tab).toBe('rivals');
  });

  it("respects a rule's cooldown — fires once, then stays silent until the window elapses", () => {
    const input: AdvisorInput = {
      ...emptyInput,
      latestStatement: {
        day: 0, revenue: 100, cogs: 40, labor: 10, rent: 5, utilities: 2, marketing: 0,
        shrink: 0, spoilage: 30, ebitda: 13,
      },
    };
    const cooldowns = createAdvisorCooldownState();
    const first = deriveAdvisorLines(input, cooldowns);
    expect(first.length).toBeGreaterThan(0);
    const second = deriveAdvisorLines({ ...input, tick: input.tick + 1 }, cooldowns);
    expect(second).toHaveLength(0);
  });
});
