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
    display:flex;gap:var(--space-2);background:var(--surface-raised);border-radius:var(--radius-md);
    padding:var(--space-2);box-shadow:var(--shadow-panel)`;

  return (
    <div style={style} role="toolbar" aria-label="Fixture actions">
      <button
        type="button"
        data-testid="action-rotate"
        style="min-width:44px;min-height:44px"
        onClick={props.onRotate}
      >
        Rotate
      </button>
      <button
        type="button"
        data-testid="action-remove"
        style="min-width:44px;min-height:44px"
        onClick={props.onRemove}
      >
        Remove
      </button>
      <button
        type="button"
        data-testid="action-cancel"
        style="min-width:44px;min-height:44px"
        onClick={props.onCancel}
      >
        Cancel
      </button>
    </div>
  );
}
