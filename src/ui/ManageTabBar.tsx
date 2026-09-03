import type { ManageTab } from './advisors.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface ManageTabBarProps {
  readonly active: ManageTab;
  readonly breakpoint: Breakpoint;
  readonly onSelect: (tab: ManageTab) => void;
}

const TABS: readonly { readonly id: ManageTab; readonly label: string }[] = [
  { id: 'objective', label: 'Objective' },
  { id: 'finance', label: 'Finance' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'staff', label: 'Staff' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'rivals', label: 'Rivals' },
];

/** Compact: fixed bottom bar, positioned above the home-indicator guard. Regular: a left icon rail. */
export function ManageTabBar(props: ManageTabBarProps): preact.JSX.Element {
  const layout = props.breakpoint === 'compact' ? 'bottom' : 'rail';
  const style =
    layout === 'bottom'
      ? `position:fixed;left:0;right:0;bottom:var(--home-indicator-guard,34px);
         display:flex;justify-content:space-around;background:var(--surface-raised);
         box-shadow:var(--shadow-panel);padding:var(--space-2)`
      : `position:fixed;top:0;left:0;bottom:0;width:5rem;display:flex;flex-direction:column;
         gap:var(--space-2);background:var(--surface-raised);box-shadow:var(--shadow-raised);
         padding:var(--space-3) var(--space-2)`;

  return (
    <div style={style} data-testid="manage-tab-bar" data-layout={layout} role="tablist" aria-label="Manage store">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-testid={`manage-tab-${tab.id}`}
          aria-pressed={props.active === tab.id}
          style="min-width:44px;min-height:44px"
          onClick={() => props.onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
