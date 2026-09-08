export interface SelectionActionBarProps {
  readonly screenPosition: { x: number; y: number } | null;
  readonly onRotate: () => void;
  readonly onRemove: () => void;
  readonly onCancel: () => void;
}

/** Floating Rotate/Remove/Cancel bar shown above a tapped, already-placed fixture. */
export function SelectionActionBar(props: SelectionActionBarProps): preact.JSX.Element | null {
  if (!props.screenPosition) return null;

  const style = `position:absolute;left:${props.screenPosition.x}px;top:${props.screenPosition.y - 48}px;
    display:flex;gap:var(--space-2);border-radius:var(--radius-sm);
    padding:var(--space-2)`;

  return (
    <div class="chrome-panel" style={style} role="toolbar" aria-label="Fixture actions">
      <button
        type="button"
        class="chrome-button"
        data-testid="action-rotate"
        style="min-width:44px;min-height:44px"
        onClick={props.onRotate}
      >
        <RotateIcon /> Rotate
      </button>
      <button
        type="button"
        class="chrome-button"
        data-testid="action-remove"
        style="min-width:44px;min-height:44px"
        onClick={props.onRemove}
      >
        <RemoveIcon /> Remove
      </button>
      <button
        type="button"
        class="chrome-button"
        data-testid="action-cancel"
        style="min-width:44px;min-height:44px"
        onClick={props.onCancel}
      >
        <CancelIcon /> Cancel
      </button>
    </div>
  );
}

/** Inline glyphs (no atlas frame — these are UI actions, not world objects) that inherit
 * `currentColor` so they theme automatically with the button they're inside. */
function RotateIcon(): preact.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13 8A5 5 0 1 1 11.5 4.3M13 8V3M13 8H8"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="square"
      />
    </svg>
  );
}

function RemoveIcon(): preact.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 4h10M6 4V2.5h4V4M4.5 4l.6 9h5.8l.6-9"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="square"
      />
    </svg>
  );
}

function CancelIcon(): preact.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" />
    </svg>
  );
}
