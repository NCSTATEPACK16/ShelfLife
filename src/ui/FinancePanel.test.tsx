// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { FinancePanel } from './FinancePanel.js';
import type { DailyStatement, LedgerEntry } from '../sim/index.js';

const statements: DailyStatement[] = [
  { day: 0, revenue: 100, cogs: 40, labor: 10, rent: 5, utilities: 2, marketing: 0, shrink: 0, spoilage: 5, ebitda: 38 },
  { day: 1, revenue: 120, cogs: 45, labor: 10, rent: 5, utilities: 2, marketing: 0, shrink: 0, spoilage: 3, ebitda: 55 },
];
const ledger: LedgerEntry[] = [
  { tick: 1440, category: 'revenue', amount: 60 },
  { tick: 1440, category: 'revenue', amount: 60 },
  { tick: 2880, category: 'revenue', amount: 120 },
];

describe('FinancePanel', () => {
  it('renders every line of the latest statement plus a trailing average, at compact', () => {
    const root = document.createElement('div');
    render(
      <FinancePanel
        statements={statements}
        ledger={ledger}
        breakpoint="compact"
        expandedCategory={null}
        onExpandCategory={() => {}}
      />,
      root,
    );
    expect(root.querySelector('[data-testid="finance-row-revenue"]')?.textContent).toContain('120');
    expect(root.querySelector('[data-testid="finance-row-revenue"]')?.textContent).toMatch(/avg|trailing/i);
    expect(root.querySelector('[data-testid="finance-row-ebitda"]')?.textContent).toContain('55');
  });

  it('renders the same content at regular', () => {
    const root = document.createElement('div');
    render(
      <FinancePanel
        statements={statements}
        ledger={ledger}
        breakpoint="regular"
        expandedCategory={null}
        onExpandCategory={() => {}}
      />,
      root,
    );
    expect(root.querySelector('[data-testid="finance-row-revenue"]')).not.toBeNull();
  });

  it('tapping a row calls onExpandCategory with that category', () => {
    const root = document.createElement('div');
    let expanded: string | null = null;
    render(
      <FinancePanel
        statements={statements}
        ledger={ledger}
        breakpoint="compact"
        expandedCategory={null}
        onExpandCategory={(c) => {
          expanded = c;
        }}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="finance-row-revenue"]')!.click();
    expect(expanded).toBe('revenue');
  });

  it('when expanded, shows the constituent ledger entries for that category', () => {
    const root = document.createElement('div');
    render(
      <FinancePanel
        statements={statements}
        ledger={ledger}
        breakpoint="compact"
        expandedCategory="revenue"
        onExpandCategory={() => {}}
      />,
      root,
    );
    const entries = root.querySelectorAll('[data-testid="finance-ledger-entry"]');
    expect(entries.length).toBeGreaterThan(0);
  });

  it('renders a placeholder state with no statements yet', () => {
    const root = document.createElement('div');
    render(<FinancePanel statements={[]} ledger={[]} breakpoint="compact" expandedCategory={null} onExpandCategory={() => {}} />, root);
    expect(root.textContent).toMatch(/no data|not yet/i);
  });
});
