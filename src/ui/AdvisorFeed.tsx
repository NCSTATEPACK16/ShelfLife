import type { AdvisorLine, ManageTab } from './advisors.js';

export interface AdvisorFeedProps {
  readonly lines: readonly AdvisorLine[];
  readonly onShowMe: (target: { tab: ManageTab; rowId?: string }) => void;
  readonly onDismiss: (index: number) => void;
}

const MAX_VISIBLE = 3;

/** Stacked advisor queue, most recent first, capped at MAX_VISIBLE — anchored below the HUD top bar. */
export function AdvisorFeed(props: AdvisorFeedProps): preact.JSX.Element {
  const visible = props.lines.slice(-MAX_VISIBLE);
  const style = `position:fixed;top:calc(var(--inset-top,0) + 48px);left:var(--space-3);
    right:var(--space-3);z-index:9;display:flex;flex-direction:column;gap:var(--space-2)`;

  return (
    <div style={style} aria-live="polite">
      {visible.map((line, i) => (
        <div
          key={i}
          data-testid="advisor-line"
          style="display:flex;align-items:center;gap:var(--space-2);
            background:var(--surface-raised);border-radius:var(--radius-md);
            box-shadow:var(--shadow-raised);padding:var(--space-2) var(--space-3)"
        >
          <strong style="text-transform:capitalize">{line.advisor}:</strong>
          <span style="flex:1">{line.line}</span>
          <button
            type="button"
            data-testid="advisor-show-me"
            style="min-width:44px;min-height:44px"
            onClick={() => props.onShowMe(line.showMe)}
          >
            Show me
          </button>
          <button
            type="button"
            data-testid="advisor-dismiss"
            aria-label="Dismiss"
            style="min-width:44px;min-height:44px"
            onClick={() => props.onDismiss(i)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
