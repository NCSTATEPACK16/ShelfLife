import Phaser from 'phaser';
import type { CampaignBridge } from '../bridge/campaign-bridge.js';
import tokens from '../../content/design/tokens.json';
import { DEFAULT_GENTLE_SURFACE_CONTENT } from '../sim/content/gentle-surface.js';
import { buildDrawPlan } from './draw-plan.js';
import { toPhaserColor } from './fixture-colors.js';
import { buildFlowFieldDrawPlan } from './pathing-debug-plan.js';
import { buildShopperDrawPlan } from './shopper-draw-plan.js';
import { buildTellDrawPlan } from './tell-draw-plan.js';

/**
 * Renders the build-mode grid. Reads the bridge's snapshot; never mutates it.
 *
 * Phaser's own input plugin is never touched here — real pointer input flows through
 * `PointerSource` (src/platform/input) per ADR 0002, and callers invoke `redraw()`/
 * `setSelected()` after every bridge mutation to keep the view in sync.
 */
export class BuildScene extends Phaser.Scene {
  readonly #bridge: CampaignBridge;
  readonly #origin: { x: number; y: number };
  #graphics!: Phaser.GameObjects.Graphics;
  #selectedInstanceId: number | null = null;
  #debugDestinationId: string | null = null;

  constructor(bridge: CampaignBridge, origin: { x: number; y: number }) {
    super({ key: 'build', active: true });
    this.#bridge = bridge;
    this.#origin = origin;
  }

  create(): void {
    this.#graphics = this.add.graphics();
    this.redraw();
  }

  setSelected(instanceId: number | null): void {
    this.#selectedInstanceId = instanceId;
    this.redraw();
  }

  setDebugDestination(id: string | null): void {
    this.#debugDestinationId = id;
    this.redraw();
  }

  redraw(): void {
    const plan = buildDrawPlan(this.#bridge.snapshot(), this.#origin, this.#selectedInstanceId);
    const g = this.#graphics;
    g.clear();

    g.lineStyle(1, 0xffffff, 0.15);
    for (const line of plan.gridLines) {
      g.lineBetween(line.x1, line.y1, line.x2, line.y2);
    }

    for (const rect of plan.fixtures) {
      g.fillStyle(rect.color, 1);
      g.fillRect(rect.x, rect.y, rect.width, rect.height);
      if (rect.selected) {
        g.lineStyle(2, rect.color, 1);
        g.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    }

    if (this.#debugDestinationId) {
      const field = this.#bridge.flowFieldDebug(this.#debugDestinationId);
      const arrows = buildFlowFieldDrawPlan(field, this.#origin);
      const debugColor = toPhaserColor(tokens.color.product.violet.base);
      g.lineStyle(1, debugColor, 0.6);
      for (const arrow of arrows) {
        g.lineBetween(arrow.x1, arrow.y1, arrow.x2, arrow.y2);
      }
    }

    const shopperColor = toPhaserColor(tokens.color.product.green.base);
    const shopperMarkers = buildShopperDrawPlan(this.#bridge.shoppersSnapshot(), this.#origin);
    for (const marker of shopperMarkers) {
      g.fillStyle(shopperColor, 1);
      g.fillCircle(marker.x, marker.y, 6);
    }

    // Shelf fullness (visibility tell — world mark only, no bubble): a thin colored bar
    // under each stocked shelf's fixture rect, proportional to capacity.
    for (const shelf of this.#bridge.shelfFullness()) {
      const rect = plan.fixtures.find((f) => f.instanceId === shelf.instanceId);
      if (!rect) continue;
      const barColor = shelf.fraction < 0.25 ? 0xef4444 : shelf.fraction < 0.6 ? 0xf59e0b : 0x22c55e;
      g.fillStyle(barColor, 1);
      g.fillRect(rect.x, rect.y + rect.height - 3, rect.width * shelf.fraction, 3);
    }

    // Tell bubbles: rate-limited, one per shopper, highest magnitude wins.
    // buildTellDrawPlan does its own worldToScreen — feed it world positions, not the
    // already-projected shopperMarkers screen coordinates.
    const shopperWorldPositionsById = new Map(
      this.#bridge.shoppersSnapshot().map((s) => [s.id, { x: s.x, y: s.y }]),
    );
    const tellMarkers = buildTellDrawPlan(
      this.#bridge.pendingTells(),
      DEFAULT_GENTLE_SURFACE_CONTENT,
      shopperWorldPositionsById,
      this.#origin,
      8, // regular-breakpoint cap; compact wiring is phase 2.3's Preact-layer concern
    );
    const bubbleColor = toPhaserColor(tokens.color.product.violet.base);
    for (const marker of tellMarkers) {
      g.fillStyle(bubbleColor, 1);
      g.fillCircle(marker.x, marker.y - 14, 4); // small token above the shopper marker
    }
  }
}
