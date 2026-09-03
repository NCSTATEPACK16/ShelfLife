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
import { screenToWorld, worldToScreen } from './iso.js';
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
 * Returns `null` (mounts nothing) if `canvas` can't produce a rendering context, same guard
 * `mountBuildMode` always had.
 */
export async function mountCampaign(
  canvas: HTMLCanvasElement,
  uiRoot: HTMLElement,
): Promise<{ bridge: CampaignBridge } | null> {
  const ctx = canvas.getContext('2d') ?? canvas.getContext('webgl');
  if (!ctx) return null;

  const [{ default: Phaser }, { BuildScene }] = await Promise.all([
    import('phaser'),
    import('./BuildScene.js'),
  ]);

  const bridge = CampaignBridge.start(LEVEL_ID, Date.now());
  const levelDef = DEFAULT_LEVEL_CONTENT.get(LEVEL_ID)!;
  const origin = { x: canvas.clientWidth / 2, y: 80 };

  const scene = new BuildScene(bridge, origin);
  new Phaser.Game({
    type: Phaser.CANVAS,
    canvas,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
    transparent: true,
    scene,
  });

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

  function renderUi(): void {
    const breakpoint: Breakpoint = breakpointFor(globalThis.innerWidth);

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
          pathingDebugOn: false,
          onTogglePathingDebug: () => {},
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
    toWorld: (screen) => screenToWorld(screen.x, screen.y, origin),
  });
  input.subscribe((intent) => {
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
  return { bridge };
}

function nextRotation(current: Rotation): Rotation {
  return ((current + 90) % 360) as Rotation;
}
