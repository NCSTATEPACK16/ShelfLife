import type { BuildModeBridge } from '../bridge/build-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface BuildModePanelProps {
  readonly bridge: BuildModeBridge;
  readonly breakpoint: Breakpoint;
  readonly onSelect: (instanceId: number | null) => void;
  readonly onArm: (fixtureId: string | null) => void;
  readonly armedFixtureId?: string | null;
}

/**
 * PLAN.md §7 — compact is the primary layout (bottom tray); regular gets the same
 * controls in a side panel. Both breakpoints render the same buttons; only the
 * container layout (row vs. column) differs.
 */
export function BuildModePanel(props: BuildModePanelProps): preact.JSX.Element {
  const snapshot = props.bridge.snapshot();
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:row;gap:var(--space-2);overflow-x:auto;padding-bottom:calc(34px + var(--space-2))'
      : 'display:flex;flex-direction:column;gap:var(--space-2)';

  return (
    <div style={containerStyle} role="toolbar" aria-label="Build mode">
      <button
        type="button"
        data-testid="undo"
        disabled={!props.bridge.hasUndo()}
        onClick={() => props.bridge.undo()}
      >
        Undo
      </button>
      <button
        type="button"
        data-testid="redo"
        disabled={!props.bridge.hasRedo()}
        onClick={() => props.bridge.redo()}
      >
        Redo
      </button>
      <span data-testid="placement-count">{snapshot.placements.length}</span>
      {snapshot.catalog.map((def) => (
        <button
          key={def.id}
          type="button"
          data-testid={`fixture-${def.id}`}
          aria-pressed={props.armedFixtureId === def.id}
          style="min-width:44px;min-height:44px"
          onClick={() => props.onArm(props.armedFixtureId === def.id ? null : def.id)}
        >
          {def.name}
        </button>
      ))}
    </div>
  );
}
