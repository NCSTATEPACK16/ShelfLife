export interface HudTopBarProps {
  readonly storeName: string;
  readonly cash: number;
  readonly chapterTitle: string;
  readonly objectiveCurrent: number;
  readonly objectiveTarget: number;
  readonly mode: 'build' | 'manage';
  readonly onToggleMode: () => void;
}

/** Persistent top bar, safe-area-respecting, unchanged in content across both modes. */
export function HudTopBar(props: HudTopBarProps): preact.JSX.Element {
  const style = `position:fixed;top:var(--inset-top,0);left:0;right:0;z-index:10;
    display:flex;align-items:center;gap:var(--space-3);
    padding:var(--space-2) var(--space-3);
    font-family:var(--font-pixel);color:var(--ink)`;

  return (
    <div class="chrome-panel" style={style} role="banner">
      <strong>{props.storeName}</strong>
      <span class="num" data-testid="cash">
        ${props.cash.toFixed(0)}
      </span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-body)">
        {props.chapterTitle}
        <span data-testid="objective-progress" style="margin-left:var(--space-2);color:var(--ink-muted)">
          {Math.round(props.objectiveCurrent * 100)}% / {Math.round(props.objectiveTarget * 100)}%
        </span>
      </span>
      <button
        type="button"
        class="chrome-button"
        data-testid="mode-toggle"
        aria-label={props.mode === 'build' ? 'Switch to manage mode' : 'Switch to build mode'}
        style="min-width:44px;min-height:44px"
        onClick={props.onToggleMode}
      >
        {props.mode === 'build' ? '📋' : '🔨'}
      </button>
    </div>
  );
}
