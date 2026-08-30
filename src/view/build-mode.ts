import { render } from 'preact';
import { BuildModeBridge } from '../bridge/build-bridge.js';
import { PointerSource } from '../platform/input/index.js';
import { breakpointFor, type Breakpoint } from '../platform/layout/index.js';
import { BuildModePanel } from '../ui/BuildModePanel.js';
import { SelectionActionBar } from '../ui/SelectionActionBar.js';
import { fitZoom, screenToWorld, TILE_SIZE, worldToScreen } from './projection.js';
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
 *
 * WebGL is preferred and 2D canvas is the fallback (ADR 0005). Pixel art needs
 * nearest-neighbour filtering, which `pixelArt: true` sets along with `roundPixels`.
 */
export async function mountBuildMode(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
): Promise<{ bridge: BuildModeBridge; scene: BuildSceneHandle } | null> {
  // Probe on a THROWAWAY canvas, never the real one.
  //
  // A canvas can only ever hand out one kind of context: once `getContext('webgl2')`
  // succeeds on an element, a later `getContext('webgl')` on that same element returns
  // null forever. Probing the real canvas therefore breaks the very renderer it is trying
  // to check — Phaser asks for its own context a moment later and is told WebGL is
  // unsupported on a machine that supports it perfectly well.
  const probe = document.createElement('canvas');
  const hasWebgl = Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  const has2d = Boolean(document.createElement('canvas').getContext('2d'));
  if (!hasWebgl && !has2d) return null;

  const [{ default: Phaser }, { BuildScene }] = await Promise.all([
    import('phaser'),
    import('./BuildScene.js'),
  ]);

  const bridge = new BuildModeBridge(GRID_DIMENSIONS);

  // Integer zoom only (ADR 0005): a fractional scale makes every sprite shimmer as the
  // camera moves, and no filtering setting hides it. On a 390px phone this picks 1x and
  // shows part of the store; on a desktop it picks 2x or more.
  const zoom = fitZoom(canvas.clientWidth, GRID_DIMENSIONS.width);

  // Centre the store horizontally, and leave room at the top for the HUD that phase S4
  // will put there. Rounded, because a half-pixel origin defeats the integer zoom.
  const storePixelWidth = GRID_DIMENSIONS.width * TILE_SIZE;
  const origin = {
    x: Math.round(Math.max(0, (canvas.clientWidth / zoom - storePixelWidth) / 2)),
    y: 16,
  };

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
    // canvas rather than creating its own, so the probe above decides it rather than
    // Phaser re-detecting and disagreeing.
    type: hasWebgl ? Phaser.WEBGL : Phaser.CANVAS,
    canvas,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    transparent: true,
    // Sets antialias off and roundPixels on — the two settings pixel art cannot do
    // without (ADR 0005).
    pixelArt: true,
    zoom,
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
    // The action bar is DOM, so it needs CSS pixels: the scene's coordinates are scaled by
    // the camera zoom before they mean anything to an absolutely-positioned element.
    const selectedScreen = selected
      ? (() => {
          const point = worldToScreen(selected.x, selected.y, origin);
          const camera = scene.scroll();
          return { x: (point.x - camera.x) * zoom, y: (point.y - camera.y) * zoom };
        })()
      : null;
    render(
      SelectionActionBar({
        screenPosition: selectedScreen,
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
    // Pointer coordinates arrive in CSS pixels. Undo the camera zoom and add back the
    // camera scroll before asking the projection which tile was hit — miss either and
    // taps land somewhere other than where the player pointed, which reads as the game
    // being broken rather than the transform being wrong.
    toWorld: (screen) => {
      const camera = scene.scroll();
      return screenToWorld(screen.x / zoom + camera.x, screen.y / zoom + camera.y, origin);
    },
  });

  // The camera may not exceed the store's own footprint plus the top margin — panning
  // into empty space is disorienting and makes the store feel lost rather than large.
  const cameraBounds = {
    width: origin.x * 2 + GRID_DIMENSIONS.width * TILE_SIZE,
    height: origin.y * 2 + GRID_DIMENSIONS.height * TILE_SIZE,
  };

  input.subscribe((intent) => {
    // A 20-tile store is 640px wide, so on a 390px phone the camera has to move. Panning
    // rides the existing drag intent rather than adding a listener, which is what keeps
    // the platform boundary (ADR 0002) intact.
    if (intent.kind === 'dragMove') {
      scene.panBy(intent.delta.x, intent.delta.y, cameraBounds);
      return;
    }

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
  return { bridge, scene };
}

/**
 * What callers outside this module may do with the scene: redraw it, and ask where the
 * camera is. Deliberately narrower than `BuildScene` so a test harness cannot reach into
 * the renderer's internals and quietly become a second source of truth.
 */
export interface BuildSceneHandle {
  redraw(): void;
  scroll(): { x: number; y: number };
}

function nextRotation(current: Rotation): Rotation {
  return ((current + 90) % 360) as Rotation;
}
