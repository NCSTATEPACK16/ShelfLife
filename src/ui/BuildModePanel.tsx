import type { CampaignBridge } from '../bridge/campaign-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';
import worldAtlasUrl from '../../assets/atlases/world.png';
import { getWorldFrameRect, WORLD_ATLAS_SIZE } from '../view/atlas-frames.js';
import { FIXTURE_ICON_FRAMES } from './fixture-icons.js';

/** Target on-screen size for a fixture icon — matches `--icon-size-md`. */
const ICON_BOX = 32;

/** A fixture's palette icon, cropped from the world atlas and scaled to fit `ICON_BOX`
 * without distortion (frames have different aspect ratios — a 64x40 register vs. a
 * 32x48 shelf) so nothing stretches or gets cropped. */
function FixtureIcon(props: { readonly fixtureId: string }): preact.JSX.Element | null {
  const frameName = FIXTURE_ICON_FRAMES[props.fixtureId];
  const frame = frameName ? getWorldFrameRect(frameName) : null;
  if (!frame) return null;

  const scale = ICON_BOX / Math.max(frame.w, frame.h);
  const style = `
    width:${frame.w * scale}px;height:${frame.h * scale}px;
    background-image:url(${worldAtlasUrl});
    background-position:${-frame.x * scale}px ${-frame.y * scale}px;
    background-size:${WORLD_ATLAS_SIZE.w * scale}px ${WORLD_ATLAS_SIZE.h * scale}px;
    background-repeat:no-repeat`;
  return <span class="chrome-icon" style={style} aria-hidden="true" />;
}

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
          <FixtureIcon fixtureId={def.id} />
          {def.name}
        </button>
      ))}
    </div>
  );
}
