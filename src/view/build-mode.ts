import { render } from 'preact';
import { BuildModeBridge } from '../bridge/build-bridge.js';
import { PointerSource } from '../platform/input/index.js';
import { breakpointFor, type Breakpoint } from '../platform/layout/index.js';
import { BuildModePanel } from '../ui/BuildModePanel.js';
import { SelectionActionBar } from '../ui/SelectionActionBar.js';
import { screenToWorld, worldToScreen } from './iso.js';
import { TICK_MS } from '../sim/index.js';
import type { Rotation } from '../sim/index.js';

const GRID_DIMENSIONS = { width: 20, height: 20 };

/**
 * Mounts build mode: a Phaser scene on `canvas`, a Preact palette + action bar in
 * `uiRoot`, and a PointerSource wiring taps to the bridge.
 *
 * Returns `null` (and mounts nothing) if `canvas` can't produce a rendering context —
 * a hostile embedding, or a headless test environment, degrades instead of crashing.
 * Phaser is imported dynamically, *after* that check, because Phaser probes canvas
 * rendering capability as an import-time side effect — importing it unconditionally
 * would crash under jsdom (which has no canvas backend) even with this guard in place.
 */
export async function mountBuildMode(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
): Promise<{ bridge: BuildModeBridge } | null> {
  const ctx = canvas.getContext('2d') ?? canvas.getContext('webgl');
  if (!ctx) return null;

  const [{ default: Phaser }, { BuildScene }] = await Promise.all([
    import('phaser'),
    import('./BuildScene.js'),
  ]);

  const bridge = new BuildModeBridge(GRID_DIMENSIONS);
  const origin = { x: canvas.clientWidth / 2, y: 80 };

  // A fixed debug-only destination so the flow-field overlay always has something to
  // show. Real shopper destinations (shelf faces, registers, exits) are phase 1.6's
  // concern; this one exists purely to exercise PathingSystem's debug accessor.
  const DEBUG_DESTINATION_ID = 'debug-exit';
  bridge.registerDestination(DEBUG_DESTINATION_ID, [
    { x: GRID_DIMENSIONS.width - 1, y: GRID_DIMENSIONS.height - 1 },
  ]);

  const scene = new BuildScene(bridge, origin);
  new Phaser.Game({
    // Phaser requires an explicit (non-AUTO) renderType when adopting a caller-provided
    // canvas rather than creating its own — CANVAS is all BuildScene's Graphics API needs.
    type: Phaser.CANVAS,
    canvas,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    transparent: true,
    scene,
  });

  let armedFixtureId: string | null = null;
  let selectedInstanceId: number | null = null;
  let pathingDebugOn = false;

  const panelRoot = document.createElement('div');
  uiRoot.appendChild(panelRoot);
  const actionBarRoot = document.createElement('div');
  uiRoot.appendChild(actionBarRoot);

  function positionPanelRoot(breakpoint: Breakpoint): void {
    panelRoot.style.cssText =
      breakpoint === 'compact'
        ? `position:fixed;left:0;right:0;bottom:0;background:var(--surface-raised);
           box-shadow:var(--shadow-panel);padding:var(--space-2)`
        : `position:fixed;top:0;right:0;bottom:0;width:16rem;background:var(--surface-raised);
           box-shadow:var(--shadow-panel);padding:var(--space-3)`;
  }

  function renderUi(): void {
    const breakpoint = breakpointFor(globalThis.innerWidth);
    positionPanelRoot(breakpoint);
    render(
      BuildModePanel({
        bridge,
        breakpoint,
        armedFixtureId,
        onArm: (id) => {
          armedFixtureId = id;
          selectedInstanceId = null;
          scene.setSelected(null);
          renderUi();
        },
        onSelect: (id) => {
          selectedInstanceId = id;
          renderUi();
        },
        onUndo: () => {
          scene.redraw();
          renderUi();
        },
        onRedo: () => {
          scene.redraw();
          renderUi();
        },
        pathingDebugOn,
        onTogglePathingDebug: () => {
          pathingDebugOn = !pathingDebugOn;
          scene.setDebugDestination(pathingDebugOn ? DEBUG_DESTINATION_ID : null);
          renderUi();
        },
      }),
      panelRoot,
    );

    const selected = bridge.snapshot().placements.find((p) => p.instanceId === selectedInstanceId);
    render(
      SelectionActionBar({
        screenPosition: selected ? worldToScreen(selected.x, selected.y, origin) : null,
        onRotate: () => {
          if (selected) bridge.rotate(selected.instanceId, nextRotation(selected.rotation));
          scene.redraw();
          renderUi();
        },
        onRemove: () => {
          if (selected) bridge.remove(selected.instanceId);
          selectedInstanceId = null;
          scene.setSelected(null);
          renderUi();
        },
        onCancel: () => {
          selectedInstanceId = null;
          scene.setSelected(null);
          renderUi();
        },
      }),
      actionBarRoot,
    );
  }

  const input = new PointerSource(canvas, {
    toWorld: (screen) => screenToWorld(screen.x, screen.y, origin),
  });
  input.subscribe((intent) => {
    if (intent.kind !== 'tap') return;
    const tileX = Math.floor(intent.world.x);
    const tileY = Math.floor(intent.world.y);

    const hit = bridge.snapshot().placements.find((p) => p.x === tileX && p.y === tileY);
    if (hit) {
      selectedInstanceId = hit.instanceId;
      armedFixtureId = null;
      scene.setSelected(hit.instanceId);
      renderUi();
      return;
    }

    if (armedFixtureId) {
      try {
        bridge.place(armedFixtureId, tileX, tileY, 0);
      } catch {
        // Rejected placement (out of bounds / occupied) — no-op for now; a follow-up
        // pass can surface an inline message near the tapped tile.
      }
      scene.redraw();
      renderUi();
    }
  });
  input.attach();

  // Build mode is otherwise action-driven (a step per command), but households/shoppers
  // need real time to pass with no UI interaction at all — a plain interval at the sim's
  // own tick rate, redrawing the scene (UI panels don't depend on tick-by-tick state, so
  // they're left to their existing event-driven renderUi() calls).
  globalThis.setInterval(() => {
    bridge.tick();
    scene.redraw();
  }, TICK_MS);

  renderUi();
  return { bridge };
}

function nextRotation(current: Rotation): Rotation {
  return ((current + 90) % 360) as Rotation;
}
