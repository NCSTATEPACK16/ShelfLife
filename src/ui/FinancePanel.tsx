import type { DailyStatement, LedgerCategory, LedgerEntry } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface FinancePanelProps {
  readonly statements: readonly DailyStatement[];
  readonly ledger: readonly LedgerEntry[];
  readonly breakpoint: Breakpoint;
  readonly expandedCategory: LedgerCategory | null;
  readonly onExpandCategory: (category: LedgerCategory | null) => void;
}

const CATEGORIES: readonly LedgerCategory[] = [
  'revenue', 'cogs', 'labor', 'rent', 'utilities', 'marketing', 'shrink', 'spoilage',
];

function valueOf(statement: DailyStatement, category: LedgerCategory | 'ebitda'): number {
  return statement[category];
}

function trailingAverage(
  statements: readonly DailyStatement[],
  category: LedgerCategory | 'ebitda',
  windowDays = 7,
): number {
  const window = statements.slice(-windowDays);
  if (window.length === 0) return 0;
  return window.reduce((sum, s) => sum + valueOf(s, category), 0) / window.length;
}

/** PLAN.md §12.4 — every number pairs with a 7-day trailing average, never bare. */
export function FinancePanel(props: FinancePanelProps): preact.JSX.Element {
  const latest = props.statements.at(-1);
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3);padding:var(--space-4)';

  if (!latest) {
    return (
      <div style={containerStyle} data-testid="finance-panel">
        No data yet — trade a full sim day to see the first statement.
      </div>
    );
  }

  const rows: readonly (LedgerCategory | 'ebitda')[] = [...CATEGORIES, 'ebitda'];

  return (
    <div style={containerStyle} data-testid="finance-panel">
      {rows.map((category) => {
        const value = valueOf(latest, category);
        const avg = trailingAverage(props.statements, category);
        return (
          <div key={category}>
            <button
              type="button"
              data-testid={`finance-row-${category}`}
              style="width:100%;text-align:left;min-height:44px;display:flex;justify-content:space-between;gap:var(--space-2)"
              onClick={() =>
                props.onExpandCategory(props.expandedCategory === category ? null : (category as LedgerCategory))
              }
            >
              <span style="text-transform:capitalize">{category}</span>
              <span class="num">
                ${value.toFixed(2)} <span style="color:var(--ink-faint)">(7d avg ${avg.toFixed(2)})</span>
              </span>
            </button>
            {props.expandedCategory !== null && props.expandedCategory === category && (
              <div style="padding-left:var(--space-3)">
                {props.ledger
                  .filter((e) => e.category === category)
                  .map((entry, i) => (
                    <div key={i} data-testid="finance-ledger-entry" class="num">
                      tick {entry.tick}: ${entry.amount.toFixed(2)}
                    </div>
                  ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
