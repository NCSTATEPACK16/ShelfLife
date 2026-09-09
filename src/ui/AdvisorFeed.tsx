import type { AdvisorLine, ManageTab } from './advisors.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface AdvisorFeedProps {
  readonly lines: readonly AdvisorLine[];
  readonly breakpoint: Breakpoint;
  readonly onShowMe: (target: { tab: ManageTab; rowId?: string }) => void;
  readonly onDismiss: (index: number) => void;
}

const MAX_VISIBLE = 3;

/**
 * Stacked advisor queue, most recent first, capped at MAX_VISIBLE — anchored below the HUD
 * top bar. Compact has no docked side panel to avoid (build/manage panels are bottom-anchored
 * there), so it spans full width; regular reserves both the build-mode right panel (16rem) and
 * the manage-mode left rail (5rem) so a fired advisor line never covers either.
 */
export function AdvisorFeed(props: AdvisorFeedProps): preact.JSX.Element {
  const visible = props.lines.slice(-MAX_VISIBLE);
  const horizontalInset = props.breakpoint === 'compact' ? 'left:var(--space-3);right:var(--space-3)' : 'left:6rem;right:17rem';
  const style = `position:fixed;top:calc(var(--inset-top,0) + 48px);${horizontalInset};
    z-index:9;display:flex;flex-direction:column;gap:var(--space-2)`;

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
