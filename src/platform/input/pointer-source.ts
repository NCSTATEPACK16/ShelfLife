import type { GestureThresholds, Intent, IntentHandler, Vec2 } from './types.js';
import { DEFAULT_THRESHOLDS } from './types.js';

/**
 * The ONLY place in the codebase allowed to touch raw pointer events (docs/adr/0002).
 *
 * Pointer Events unify mouse, touch, and pen, so there is a single code path rather than
 * a desktop one and a mobile one bolted on later. Everything downstream sees `Intent`.
 *
 * Phase 1.0 scope: the seam, its types, and enough gesture recognition to prove the shape
 * is right. Camera-aware world-coordinate projection arrives with the renderer in 1.4;
 * until then `toWorld` is injected so this module never needs to know about the camera.
 */

export interface PointerSourceOptions {
  /** Projects screen (CSS px) to sim world coordinates. Injected — this module owns no camera. */
  readonly toWorld: (screen: Vec2) => Vec2;
  readonly thresholds?: GestureThresholds;
}

interface ActivePointer {
  readonly id: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  dragging: boolean;
  longPressFired: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | undefined;
}

export class PointerSource {
  readonly #el: HTMLElement;
  readonly #opts: Required<PointerSourceOptions>;
  readonly #handlers = new Set<IntentHandler>();
  readonly #active = new Map<number, ActivePointer>();
  #pinchStartDistance = 0;
  #attached = false;

  constructor(el: HTMLElement, opts: PointerSourceOptions) {
    this.#el = el;
    this.#opts = { thresholds: DEFAULT_THRESHOLDS, ...opts };
  }

  subscribe(handler: IntentHandler): () => void {
    this.#handlers.add(handler);
    return () => this.#handlers.delete(handler);
  }

  attach(): void {
    if (this.#attached) return;
    this.#attached = true;
    this.#el.addEventListener('pointerdown', this.#onDown);
    this.#el.addEventListener('pointermove', this.#onMove);
    this.#el.addEventListener('pointerup', this.#onUp);
    this.#el.addEventListener('pointercancel', this.#onUp);
    // Long-press on iOS otherwise raises the system callout; the game owns that gesture.
    this.#el.addEventListener('contextmenu', this.#onContextMenu);
  }

  detach(): void {
    if (!this.#attached) return;
    this.#attached = false;
    this.#el.removeEventListener('pointerdown', this.#onDown);
    this.#el.removeEventListener('pointermove', this.#onMove);
    this.#el.removeEventListener('pointerup', this.#onUp);
    this.#el.removeEventListener('pointercancel', this.#onUp);
    this.#el.removeEventListener('contextmenu', this.#onContextMenu);
    for (const p of this.#active.values()) clearTimeout(p.longPressTimer);
    this.#active.clear();
  }

  #emit(intent: Intent): void {
    for (const h of this.#handlers) h(intent);
  }

  #context(screenX: number, screenY: number): { world: Vec2; screen: Vec2 } {
    const screen: Vec2 = { x: screenX, y: screenY };
    return { screen, world: this.#opts.toWorld(screen) };
  }

  #onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  #onDown = (e: PointerEvent): void => {
    this.#el.setPointerCapture?.(e.pointerId);

    const p: ActivePointer = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      dragging: false,
      longPressFired: false,
      longPressTimer: undefined,
    };

    p.longPressTimer = setTimeout(() => {
      if (p.dragging) return;
      p.longPressFired = true;
      this.#emit({ kind: 'longpress', ...this.#context(p.lastX, p.lastY) });
    }, this.#opts.thresholds.longPressMs);

    this.#active.set(e.pointerId, p);

    if (this.#active.size === 2) this.#pinchStartDistance = this.#distance();
  };

  #onMove = (e: PointerEvent): void => {
    const p = this.#active.get(e.pointerId);

    if (!p) {
      // No button down. Pointer devices only — touch never produces a bare move.
      if (e.pointerType !== 'touch') {
        this.#emit({ kind: 'hover', ...this.#context(e.clientX, e.clientY) });
      }
      return;
    }

    const dx = e.clientX - p.lastX;
    const dy = e.clientY - p.lastY;
    p.lastX = e.clientX;
    p.lastY = e.clientY;

    // Two fingers down: pinch supersedes drag.
    if (this.#active.size === 2 && this.#pinchStartDistance > 0) {
      const scale = this.#distance() / this.#pinchStartDistance;
      this.#emit({ kind: 'pinch', scale, center: this.#centroid() });
      return;
    }

    if (!p.dragging) {
      const movedFromStart = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (movedFromStart < this.#opts.thresholds.dragSlop) return;

      p.dragging = true;
      clearTimeout(p.longPressTimer);
      this.#emit({ kind: 'dragStart', ...this.#context(p.startX, p.startY) });
    }

    this.#emit({ kind: 'dragMove', delta: { x: dx, y: dy }, ...this.#context(e.clientX, e.clientY) });
  };

  #onUp = (e: PointerEvent): void => {
    const p = this.#active.get(e.pointerId);
    if (!p) return;

    clearTimeout(p.longPressTimer);
    this.#active.delete(e.pointerId);
    if (this.#active.size < 2) this.#pinchStartDistance = 0;

    const ctx = this.#context(e.clientX, e.clientY);

    if (p.dragging) {
      this.#emit({ kind: 'dragEnd', delta: { x: e.clientX - p.startX, y: e.clientY - p.startY }, ...ctx });
    } else if (!p.longPressFired) {
      this.#emit({ kind: 'tap', ...ctx });
    }
  };

  #distance(): number {
    const [a, b] = [...this.#active.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
  }

  #centroid(): Vec2 {
    const [a, b] = [...this.#active.values()];
    if (!a || !b) return { x: 0, y: 0 };
    return { x: (a.lastX + b.lastX) / 2, y: (a.lastY + b.lastY) / 2 };
  }
}
