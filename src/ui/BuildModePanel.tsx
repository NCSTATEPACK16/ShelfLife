import type { CampaignBridge } from '../bridge/campaign-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface BuildModePanelProps {
  readonly bridge: CampaignBridge;
  readonly breakpoint: Breakpoint;
  readonly onSelect: (instanceId: number | null) => void;
  readonly onArm: (fixtureId: string | null) => void;
  /** Called after undo/redo mutates the bridge, so the caller can re-render and redraw. */
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly armedFixtureId?: string | null;
  readonly pathingDebugOn: boolean;
  readonly onTogglePathingDebug: () => void;
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
        class="chrome-button"
        data-testid="undo"
        disabled={!props.bridge.hasUndo()}
        onClick={() => {
          props.bridge.undo();
          props.onUndo();
        }}
      >
        Undo
      </button>
      <button
        type="button"
        class="chrome-button"
        data-testid="redo"
        disabled={!props.bridge.hasRedo()}
        onClick={() => {
          props.bridge.redo();
          props.onRedo();
        }}
      >
        Redo
      </button>
      <span class="num" data-testid="placement-count">
        {snapshot.placements.length}
      </span>
      <button
        type="button"
        class="chrome-button"
        data-testid="toggle-pathing-debug"
        aria-pressed={props.pathingDebugOn}
        style="min-width:44px;min-height:44px"
        onClick={props.onTogglePathingDebug}
      >
        Flow
      </button>
      {snapshot.catalog.map((def) => (
        <button
          key={def.id}
          type="button"
          class="chrome-button"
          data-testid={`fixture-${def.id}`}
          aria-pressed={props.armedFixtureId === def.id}
          style="min-width:44px;min-height:44px;flex-direction:column;padding:var(--space-1)"
          onClick={() => props.onArm(props.armedFixtureId === def.id ? null : def.id)}
        >
          {def.name}
        </button>
      ))}
    </div>
  );
}
