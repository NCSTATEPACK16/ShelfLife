import Phaser from 'phaser';
import type { BuildModeBridge } from '../bridge/build-bridge.js';
import { buildDrawPlan } from './draw-plan.js';

/**
 * Renders the build-mode grid. Reads the bridge's snapshot; never mutates it.
 *
 * Phaser's own input plugin is never touched here — real pointer input flows through
 * `PointerSource` (src/platform/input) per ADR 0002, and callers invoke `redraw()`/
 * `setSelected()` after every bridge mutation to keep the view in sync.
 */
export class BuildScene extends Phaser.Scene {
  readonly #bridge: BuildModeBridge;
  readonly #origin: { x: number; y: number };
  #graphics!: Phaser.GameObjects.Graphics;
  #selectedInstanceId: number | null = null;

  constructor(bridge: BuildModeBridge, origin: { x: number; y: number }) {
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
  }
}
