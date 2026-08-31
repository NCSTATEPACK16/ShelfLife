import Phaser from 'phaser';
import type { BuildModeBridge } from '../bridge/build-bridge.js';
import tokens from '../../content/design/tokens.json';
import worldAtlasUrl from '../../assets/atlases/world.png';
import agentsAtlasUrl from '../../assets/atlases/agents.png';
import uiAtlasUrl from '../../assets/atlases/ui.png';
import worldAtlasData from '../../assets/atlases/world.json';
import agentsAtlasData from '../../assets/atlases/agents.json';
import uiAtlasData from '../../assets/atlases/ui.json';
import { breakpointFor } from '../platform/layout/index.js';
import { buildDrawPlan, type SpritePlan } from './draw-plan.js';
import { toPhaserColor } from './fixture-colors.js';
import {
  createGentleSurfaceState,
  gentleSurfaceDrawPlan,
  type GentleSurfaceState,
} from './gentle-surface-draw-plan.js';
import { buildFlowFieldDrawPlan } from './pathing-debug-plan.js';
import { buildShopperDrawPlan, ShopperAnimator } from './shopper-draw-plan.js';

/**
 * Renders the store. Reads the bridge's snapshot; never mutates it.
 *
 * Phaser's own input plugin is never touched here — real pointer input flows through
 * `PointerSource` (src/platform/input) per ADR 0002, and callers invoke `redraw()`/
 * `setSelected()` after every bridge mutation to keep the view in sync.
 *
 * Every sprite drawn is decided by the pure `*-draw-plan` modules; this class only turns
 * their output into pooled Phaser objects (ADR 0005). Keeping the split means the layout
 * of a frame is unit-testable without a renderer, and it is why the projection change
 * touched almost none of the drawing code.
 */
export class BuildScene extends Phaser.Scene {
  readonly #bridge: BuildModeBridge;
  readonly #origin: { x: number; y: number };
  readonly #animator = new ShopperAnimator();
  // The one piece of cross-tick state the gentle surface needs: which bubbles, marks and
  // poses are up, and last tick's shopper counters to diff against. All view-local —
  // nothing here reaches the world hash, and losing it costs at most a frame of bubbles.
  readonly #gentleSurface: GentleSurfaceState = createGentleSurfaceState();
  readonly #pool: Phaser.GameObjects.Image[] = [];
  #used = 0;
  #graphics!: Phaser.GameObjects.Graphics;
  #selectedInstanceId: number | null = null;
  #debugDestinationId: string | null = null;
  #stockLevels: ReadonlyMap<number, number> | undefined;
  #ready = false;

  constructor(bridge: BuildModeBridge, origin: { x: number; y: number }) {
    super({ key: 'build', active: true });
    this.#bridge = bridge;
    this.#origin = origin;
  }

  preload(): void {
    // Atlases are imported through Vite rather than fetched from a public directory, so
    // they get content hashing, long-cache headers, and — importantly — they count
    // against the bundle budget instead of hiding from it.
    this.load.atlas('world', worldAtlasUrl, worldAtlasData);
    this.load.atlas('agents', agentsAtlasUrl, agentsAtlasData);
    this.load.atlas('ui', uiAtlasUrl, uiAtlasData);
  }

  create(): void {
    this.#graphics = this.add.graphics();
    this.#graphics.setDepth(OVERLAY_DEPTH);
    this.#ready = true;
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

  /**
   * How full each fixture is, by instance id, 0..1 — which decides whether a shelf draws
   * stocked, picked-over, or bare.
   *
   * Supplied from outside because the simulation cannot yet answer it: stock is tracked
   * per good, and the shelf -> good assignment is private to `ShoppersSystem`. See the
   * note on `buildDrawPlan`'s options.
   */
  setStockLevels(levels: ReadonlyMap<number, number> | undefined): void {
    this.#stockLevels = levels;
    this.redraw();
  }

  /** Current camera scroll, in scene pixels. Callers need it to map a tap to a tile. */
  scroll(): { x: number; y: number } {
    if (!this.#ready) return { x: 0, y: 0 };
    return { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
  }

  /**
   * Scrolls the camera by a screen-space delta, clamped so the store cannot be dragged
   * off-screen entirely.
   *
   * Scroll is rounded to whole pixels: at integer zoom a fractional scroll is the one
   * remaining way to reintroduce the shimmer that ADR 0005 exists to prevent.
   */
  panBy(dx: number, dy: number, bounds: { width: number; height: number }): void {
    if (!this.#ready) return;
    const camera = this.cameras.main;
    const maxX = Math.max(0, bounds.width - camera.width / camera.zoom);
    const maxY = Math.max(0, bounds.height - camera.height / camera.zoom);
    camera.setScroll(
      Math.round(clamp(camera.scrollX - dx / camera.zoom, 0, maxX)),
      Math.round(clamp(camera.scrollY - dy / camera.zoom, 0, maxY)),
    );
  }

  redraw(): void {
    if (!this.#ready) return;

    const snapshot = this.#bridge.snapshot();
    const shoppers = this.#bridge.shoppersSnapshot();

    // This is the only consumer of `drainEvents()`, and draining is destructive — see the
    // note on the bridge method. Redraws happen more often than ticks, but events can only
    // exist immediately after a `world.step()`, which always advances the tick, so a
    // redraw with no tick behind it drains an empty batch. If two ticks do pass between
    // redraws the deltas simply span both, which fires the same tells one frame later.
    const gentle = gentleSurfaceDrawPlan(
      {
        events: this.#bridge.drainEvents(),
        shoppers,
        snapshot,
        tick: this.#bridge.currentTick(),
        origin: this.#origin,
        // Read off the live viewport rather than passed in: the bubble cap is about how
        // many fit on *this* screen, and nothing else then has to remember to keep it
        // current across a device rotation.
        breakpoint: breakpointFor(this.scale.width),
      },
      this.#gentleSurface,
    );

    const plan = buildDrawPlan(snapshot, this.#origin, this.#selectedInstanceId, {
      stockLevels: this.#stockLevels,
    });
    const shopperSprites = buildShopperDrawPlan(shoppers, this.#origin, this.#animator, {
      animationOverrides: gentle.animationOverrides,
    });

    this.#used = 0;
    for (const sprite of plan.floor) this.#draw(sprite);
    for (const sprite of plan.fixtures) this.#draw(sprite);
    for (const sprite of gentle.worldMarks) this.#draw(sprite);
    for (const sprite of gentle.cartMarkers) this.#draw(sprite);
    for (const sprite of shopperSprites) this.#draw(sprite);
    for (const sprite of gentle.particles) this.#draw(sprite);
    for (const sprite of gentle.bubbles) this.#draw(sprite);
    for (const sprite of plan.cursor) this.#draw(sprite);

    // Sprites are pooled rather than created and destroyed each frame: at 400 agents and
    // 10 ticks a second, per-frame allocation is what turns a smooth store into a stuttery
    // one. Anything left over from a busier frame is hidden, not freed.
    for (let i = this.#used; i < this.#pool.length; i++) this.#pool[i]!.setVisible(false);

    this.#drawDebugOverlay();
  }

  #draw(sprite: SpritePlan): void {
    let image = this.#pool[this.#used];
    if (image === undefined) {
      image = this.add.image(0, 0, sprite.atlas, sprite.key);
      this.#pool.push(image);
    } else {
      image.setTexture(sprite.atlas, sprite.key);
    }
    this.#used++;

    image
      .setVisible(true)
      .setPosition(Math.round(sprite.x), Math.round(sprite.y))
      .setOrigin(sprite.originX, sprite.originY)
      .setDepth(sprite.depth)
      .setFlipX(sprite.flipX);

    if (sprite.tint === null) image.clearTint();
    else image.setTint(sprite.tint);
  }

  #drawDebugOverlay(): void {
    const g = this.#graphics;
    g.clear();
    if (!this.#debugDestinationId) return;

    const field = this.#bridge.flowFieldDebug(this.#debugDestinationId);
    g.lineStyle(1, toPhaserColor(tokens.color.product.violet.base), 0.6);
    for (const arrow of buildFlowFieldDrawPlan(field, this.#origin)) {
      g.lineBetween(arrow.x1, arrow.y1, arrow.x2, arrow.y2);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Above every world sprite; the debug overlay is a tool, not part of the scene. */
const OVERLAY_DEPTH = 2_000_000;
