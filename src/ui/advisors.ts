import type { CampaignState, DailyStatement } from '../sim/index.js';
import type { RivalIntel } from '../bridge/campaign-bridge.js';

export type ManageTab = 'finance' | 'pricing' | 'staff' | 'inventory' | 'rivals' | 'objective';

export interface AdvisorLine {
  readonly advisor: 'diane' | 'marcus' | 'chloe';
  readonly line: string;
  readonly showMe: { readonly tab: ManageTab; readonly rowId?: string };
}

export interface AdvisorInput {
  readonly latestStatement: DailyStatement | null;
  readonly rivalIntel: RivalIntel;
  readonly campaignState: CampaignState;
  readonly recentTellCounts: Readonly<Record<string, number>>;
  readonly tick: number;
}

export interface AdvisorCooldownState {
  readonly lastFiredTick: Map<string, number>;
}

export function createAdvisorCooldownState(): AdvisorCooldownState {
  return { lastFiredTick: new Map() };
}

const COOLDOWN_TICKS = 1440; // one sim day (TICKS_PER_SIM_DAY) — a line doesn't repeat within a day
const SPOILAGE_REVENUE_FRACTION_THRESHOLD = 0.15;
const QUEUE_TELL_COUNT_THRESHOLD = 3;

function ready(cooldowns: AdvisorCooldownState, ruleId: string, tick: number): boolean {
  const last = cooldowns.lastFiredTick.get(ruleId);
  return last === undefined || tick - last >= COOLDOWN_TICKS;
}

function fire(cooldowns: AdvisorCooldownState, ruleId: string, tick: number): void {
  cooldowns.lastFiredTick.set(ruleId, tick);
}

/**
 * Pure translation from already-hashed sim/bridge state into one-sentence advisor lines
 * (PLAN.md §12.2) — never touches the bridge or DOM. `cooldowns` is caller-owned mutable state
 * (one instance per mounted session) so a rule doesn't fire on every render once it's true.
 */
export function deriveAdvisorLines(input: AdvisorInput, cooldowns: AdvisorCooldownState): readonly AdvisorLine[] {
  const lines: AdvisorLine[] = [];

  const statement = input.latestStatement;
  if (
    statement &&
    statement.revenue > 0 &&
    statement.spoilage / statement.revenue >= SPOILAGE_REVENUE_FRACTION_THRESHOLD &&
    ready(cooldowns, 'diane-spoilage', input.tick)
  ) {
    fire(cooldowns, 'diane-spoilage', input.tick);
    lines.push({
      advisor: 'diane',
      line: "You're marking down too much stock before it sells. Check what's spoiling.",
      showMe: { tab: 'finance', rowId: 'spoilage' },
    });
  }

  const queueTells = input.recentTellCounts['queuePenaltyBalk'] ?? 0;
  if (queueTells >= QUEUE_TELL_COUNT_THRESHOLD && ready(cooldowns, 'marcus-queue', input.tick)) {
    fire(cooldowns, 'marcus-queue', input.tick);
    lines.push({
      advisor: 'marcus',
      line: 'People are walking out of line. You need another register open.',
      showMe: { tab: 'staff' },
    });
  }

  const cheapestRival = [...input.rivalIntel.rivals].sort((a, b) => a.priceIndex - b.priceIndex)[0];
  if (
    cheapestRival &&
    cheapestRival.priceIndex < input.rivalIntel.player.priceLevel - 0.1 &&
    ready(cooldowns, `chloe-price-${cheapestRival.id}`, input.tick)
  ) {
    fire(cooldowns, `chloe-price-${cheapestRival.id}`, input.tick);
    lines.push({
      advisor: 'chloe',
      line: `${cheapestRival.name} is undercutting you on price.`,
      showMe: { tab: 'rivals', rowId: cheapestRival.id },
    });
  }

  return lines;
}
