import { render } from 'preact';
import { CampaignBridge } from '../bridge/campaign-bridge.js';
import { PointerSource } from '../platform/input/index.js';
import { breakpointFor, type Breakpoint } from '../platform/layout/index.js';
import { getProfile } from '../platform/profile/index.js';
import { BuildModePanel } from '../ui/BuildModePanel.js';
import { SelectionActionBar } from '../ui/SelectionActionBar.js';
import { HudTopBar } from '../ui/HudTopBar.js';
import { AdvisorFeed } from '../ui/AdvisorFeed.js';
import { ChapterModal, type ChapterModalKind } from '../ui/ChapterModal.js';
import { ManageTabBar } from '../ui/ManageTabBar.js';
import { ObjectiveTab } from '../ui/ObjectiveTab.js';
import { FinancePanel } from '../ui/FinancePanel.js';
import { PricingPanel } from '../ui/PricingPanel.js';
import { StaffPanel } from '../ui/StaffPanel.js';
import { InventoryPanel } from '../ui/InventoryPanel.js';
import { RivalsPanel } from '../ui/RivalsPanel.js';
import { createAdvisorCooldownState, deriveAdvisorLines, type AdvisorLine, type ManageTab } from '../ui/advisors.js';
import { fitZoom, screenToWorld, TILE_SIZE, worldToScreen } from './projection.js';
import type { BuildScene } from './BuildScene.js';
import { DEFAULT_GOODS_CATALOG, DEFAULT_LEVEL_CONTENT, TICK_MS } from '../sim/index.js';
import type { AdvisorLine as ChapterAdvisorLine, LedgerCategory, Rotation } from '../sim/index.js';

const LEVEL_ID = 'l1';
const DEFAULT_PROMOTION_DISCOUNT = 0.2;
const DEFAULT_PROMOTION_DURATION_TICKS = 1440;

/**
 * Mounts real campaign play: a Phaser scene on `canvas`, the full HUD/advisor/panel Preact
 * overlay in `uiRoot`, driven by one merged `CampaignBridge` (phase 2.3 — see
 * docs/superpowers/specs/2026-09-03-ui-buildout-design.md).
 *
 * Returns `null` (mounts nothing) if `canvas` can't produce a rendering context — a hostile
 * embedding, or a headless test environment, degrades instead of crashing.
 */
export async function mountCampaign(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
): Promise<{ bridge: CampaignBridge; scene: BuildScene } | null> {
  // Probe on a THROWAWAY canvas, never the real one: a canvas can only ever hand out one
  // kind of context, so calling `getContext('webgl2')` on the real canvas would make
  // Phaser's later `getContext('webgl')` on that same element return null forever (ADR
  // 0005's fix for the boot failure that caused).
  const probe = document.createElement('canvas');
  const hasWebgl = Boolean(probe.getContext('webgl2') ?? probe.getContext('webgl'));
  const has2d = Boolean(document.createElement('canvas').getContext('2d'));
  if (!hasWebgl && !has2d) return null;

  const [{ default: Phaser }, { BuildScene }] = await Promise.all([
    import('phaser'),
    import('./BuildScene.js'),
  ]);

  const bridge = CampaignBridge.start(LEVEL_ID, Date.now());
  const levelDef = DEFAULT_LEVEL_CONTENT.get(LEVEL_ID)!;
  const dimensions = bridge.snapshot().dimensions;

  // Integer zoom only (ADR 0005): a fractional scale makes every sprite shimmer as the
  // camera moves, and no filtering setting hides it.
  const zoom = fitZoom(canvas.clientWidth, dimensions.width);
  const storePixelWidth = dimensions.width * TILE_SIZE;
  const origin = {
    x: Math.round(Math.max(0, (canvas.clientWidth / zoom - storePixelWidth) / 2)),
    y: 16,
  };

  // A fixed debug-only destination so the flow-field overlay always has something to show.
  const DEBUG_DESTINATION_ID = 'debug-exit';
  bridge.registerDestination(DEBUG_DESTINATION_ID, [{ x: dimensions.width - 1, y: dimensions.height - 1 }]);

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

  // The camera may not exceed the store's own footprint plus the top margin — panning
  // into empty space is disorienting and makes the store feel lost rather than large.
  const cameraBounds = {
    width: origin.x * 2 + dimensions.width * TILE_SIZE,
    height: origin.y * 2 + dimensions.height * TILE_SIZE,
  };

  let armedFixtureId: string | null = null;
  let selectedInstanceId: number | null = null;
  let mode: 'build' | 'manage' = 'build';
  let manageTab: ManageTab = 'objective';
  let expandedFinanceCategory: LedgerCategory | null = null;
  let advisorLines: readonly AdvisorLine[] = [];
  const advisorCooldowns = createAdvisorCooldownState();
  const tellCounts = new Map<string, number>();
  let chapterModalKind: ChapterModalKind = null;
  let chapterModalCopy: ChapterAdvisorLine | null = null;
  let pathingDebugOn = false;

  const hudRoot = document.createElement('div');
  uiRoot.appendChild(hudRoot);
  const advisorRoot = document.createElement('div');
  uiRoot.appendChild(advisorRoot);
  const panelRoot = document.createElement('div');
  uiRoot.appendChild(panelRoot);
  const actionBarRoot = document.createElement('div');
  uiRoot.appendChild(actionBarRoot);
  const tabBarRoot = document.createElement('div');
  uiRoot.appendChild(tabBarRoot);
  const modalRoot = document.createElement('div');
  uiRoot.appendChild(modalRoot);

  function currentChapter() {
    return levelDef.chapters[bridge.state.chapterIndex]!;
  }

  /**
   * `panelRoot` holds either BuildModePanel (build mode) or the active manage-mode panel —
   * neither positions its own container (that's this function's job, matching the old
   * build-mode.ts's positionPanelRoot). Manage mode additionally has to clear the HUD/advisor
   * space above it and the ManageTabBar below it, which build mode doesn't need to (build
   * mode's tab bar is hidden).
   */
  function positionPanelRoot(breakpoint: Breakpoint): void {
    if (mode === 'build') {
      panelRoot.style.cssText =
        breakpoint === 'compact'
          ? `position:fixed;left:0;right:0;bottom:0;background:var(--surface-raised);
             box-shadow:var(--shadow-panel);padding:var(--space-2)`
          : `position:fixed;top:56px;right:0;bottom:0;width:16rem;background:var(--surface-raised);
             box-shadow:var(--shadow-panel);padding:var(--space-3);overflow-y:auto`;
    } else {
      panelRoot.style.cssText =
        breakpoint === 'compact'
          ? `position:fixed;left:0;right:0;top:calc(var(--inset-top,0) + 96px);
             bottom:calc(var(--home-indicator-guard,34px) + 64px);z-index:1;
             background:var(--surface-raised);box-shadow:var(--shadow-panel);overflow-y:auto`
          : `position:fixed;left:5rem;right:0;top:56px;bottom:0;z-index:1;background:var(--surface);overflow-y:auto`;
    }
  }

  function renderUi(): void {
    const breakpoint: Breakpoint = breakpointFor(globalThis.innerWidth);
    positionPanelRoot(breakpoint);

    render(
      HudTopBar({
        storeName: levelDef.name,
        cash: bridge.financeStatements().reduce((sum, s) => sum + s.ebitda, 0),
        chapterTitle: currentChapter().title,
        objectiveCurrent: bridge.objectiveProgress().current,
        objectiveTarget: bridge.objectiveProgress().target,
        mode,
        onToggleMode: () => {
          mode = mode === 'build' ? 'manage' : 'build';
          renderUi();
        },
      }),
      hudRoot,
    );

    render(
      AdvisorFeed({
        lines: advisorLines,
        breakpoint,
        onShowMe: (target) => {
          mode = 'manage';
          manageTab = target.tab;
          renderUi();
        },
        onDismiss: (index) => {
          advisorLines = advisorLines.filter((_, i) => i !== index);
          renderUi();
        },
      }),
      advisorRoot,
    );

    render(
      ChapterModal({
        kind: chapterModalKind,
        copy: chapterModalCopy,
        onContinue: () => {
          if (chapterModalKind === 'outro') void bridge.advanceChapter();
          chapterModalKind = null;
          chapterModalCopy = null;
          renderUi();
        },
      }),
      modalRoot,
    );

    if (mode === 'build') {
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
      // The action bar is DOM, so it needs CSS pixels: the scene's coordinates are scaled
      // by the camera zoom before they mean anything to an absolutely-positioned element.
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
      render(null, tabBarRoot);
    } else {
      render(null, actionBarRoot);
      render(
        ManageTabBar({
          active: manageTab,
          breakpoint,
          onSelect: (tab) => {
            manageTab = tab;
            renderUi();
          },
        }),
        tabBarRoot,
      );

      switch (manageTab) {
        case 'objective':
          render(
            ObjectiveTab({
              chapterTitle: currentChapter().title,
              introLine: currentChapter().introCopy,
              current: bridge.objectiveProgress().current,
              target: bridge.objectiveProgress().target,
            }),
            panelRoot,
          );
          break;
        case 'finance':
          render(
            FinancePanel({
              statements: bridge.financeStatements(),
              ledger: bridge.financeLedger(),
              breakpoint,
              expandedCategory: expandedFinanceCategory,
              onExpandCategory: (c) => {
                expandedFinanceCategory = c;
                renderUi();
              },
            }),
            panelRoot,
          );
          break;
        case 'pricing':
          render(
            PricingPanel({
              goods: DEFAULT_GOODS_CATALOG,
              priceOf: (id) => bridge.priceOf(id),
              referencePriceOf: (id) => bridge.referencePriceOf(id),
              marketingSpend: 0,
              breakpoint,
              onSetPrice: (id, price) => {
                bridge.setPrice(id, price);
                renderUi();
              },
              onStartPromotion: (id) => {
                bridge.startPromotion(id, DEFAULT_PROMOTION_DISCOUNT, DEFAULT_PROMOTION_DURATION_TICKS);
                renderUi();
              },
              onSetMarketingSpend: (v) => {
                bridge.setMarketingSpend(v);
                renderUi();
              },
            }),
            panelRoot,
          );
          break;
        case 'staff':
          render(
            StaffPanel({
              roster: bridge.staffRoster(),
              openRegisterIds: bridge
                .snapshot()
                .placements.filter((p) => p.fixtureId === 'register' || p.fixtureId === 'self_checkout')
                .map((p) => p.instanceId),
              breakpoint,
              onHire: () => {
                const staffId = Date.now();
                bridge.hireStaff(staffId, 0.5 + Math.random() * 0.3, 0.6 + Math.random() * 0.3);
                renderUi();
              },
              onAssign: (staffId, instanceId) => {
                bridge.assignStaffToRegister(staffId, instanceId);
                renderUi();
              },
              onTrain: (staffId) => {
                bridge.trainStaff(staffId);
                renderUi();
              },
            }),
            panelRoot,
          );
          break;
        case 'inventory':
          render(InventoryPanel({ levels: bridge.inventoryLevels(), breakpoint }), panelRoot);
          break;
        case 'rivals':
          render(RivalsPanel({ intel: bridge.rivalIntel(), breakpoint }), panelRoot);
          break;
      }
    }
  }

  const input = new PointerSource(canvas, {
    // Pointer coordinates arrive in CSS pixels. Undo the camera zoom and add back the
    // camera scroll before asking the projection which tile was hit — miss either and
    // taps land somewhere other than where the player pointed.
    toWorld: (screen) => {
      const camera = scene.scroll();
      return screenToWorld(screen.x / zoom + camera.x, screen.y / zoom + camera.y, origin);
    },
  });
  input.subscribe((intent) => {
    // A store wider than the viewport needs the camera to move. Panning rides the
    // existing drag intent rather than adding a listener, which is what keeps the
    // platform boundary (ADR 0002) intact.
    if (intent.kind === 'dragMove') {
      scene.panBy(intent.delta.x, intent.delta.y, cameraBounds);
      return;
    }

    if (mode !== 'build' || intent.kind !== 'tap') return;
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
        // Rejected placement — no-op, matches mountBuildMode's existing behavior.
      }
      scene.redraw();
      renderUi();
    }
  });
  input.attach();

  globalThis.setInterval(() => {
    void (async () => {
      const before = bridge.state;
      const outroCopyForThisChapter = currentChapter().outroCopy;
      await bridge.tick();
      scene.redraw();

      for (const tell of bridge.pendingTells()) {
        tellCounts.set(tell.term, (tellCounts.get(tell.term) ?? 0) + 1);
      }

      advisorLines = deriveAdvisorLines(
        {
          latestStatement: bridge.financeStatements().at(-1) ?? null,
          rivalIntel: bridge.rivalIntel(),
          campaignState: bridge.state,
          recentTellCounts: Object.fromEntries(tellCounts),
          tick: bridge.save().tick,
        },
        advisorCooldowns,
      );

      const after = bridge.state;
      if (before.chapterStatus === 'inProgress' && after.chapterStatus === 'complete') {
        chapterModalKind = 'outro';
        chapterModalCopy = outroCopyForThisChapter;
      }
      if (after.levelStatus === 'won') {
        chapterModalKind = 'won';
        chapterModalCopy = null;
      }
      if (after.levelStatus === 'lost') {
        chapterModalKind = 'lost';
        chapterModalCopy = null;
      }

      renderUi();
    })();
  }, TICK_MS);

  await getProfile(); // establishes the profile store before first render, matching CampaignBridge's own dependency
  renderUi();
  return { bridge, scene };
}

function nextRotation(current: Rotation): Rotation {
  return ((current + 90) % 360) as Rotation;
}
