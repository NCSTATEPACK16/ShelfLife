// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PointerSource } from './pointer-source.js';
import type { Intent, Vec2 } from './types.js';

/**
 * The input seam is a P0 commitment (PLAN.md §7.1): mouse and touch must collapse into
 * the same intents, so there is never a separate touch path to forget about.
 *
 * jsdom has no PointerEvent, so we synthesize one that carries the fields we read.
 */
function pointerEvent(type: string, init: Partial<PointerEvent>): PointerEvent {
  const e = new Event(type, { bubbles: true }) as unknown as Record<string, unknown>;
  Object.assign(e, { pointerId: 1, pointerType: 'mouse', clientX: 0, clientY: 0 }, init);
  return e as unknown as PointerEvent;
}

const identity = (screen: Vec2): Vec2 => screen;

describe('PointerSource', () => {
  let el: HTMLElement;
  let intents: Intent[];
  let source: PointerSource;

  beforeEach(() => {
    vi.useFakeTimers();
    el = document.createElement('div');
    document.body.appendChild(el);
    intents = [];
    source = new PointerSource(el, { toWorld: identity });
    source.subscribe((i) => intents.push(i));
    source.attach();
  });

  const kinds = (): string[] => intents.map((i) => i.kind);

  it('turns a press-and-release into a tap', () => {
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointerup', { clientX: 100, clientY: 100 }));

    expect(kinds()).toEqual(['tap']);
    expect(intents[0]).toMatchObject({ kind: 'tap', screen: { x: 100, y: 100 } });
  });

  it('tolerates finger wobble below the drag threshold', () => {
    // 6px of movement — a mouse would call this a drag; a thumb should not.
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointermove', { clientX: 104, clientY: 104 }));
    el.dispatchEvent(pointerEvent('pointerup', { clientX: 104, clientY: 104 }));

    expect(kinds()).toEqual(['tap']);
  });

  it('promotes movement past the threshold into a drag', () => {
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointermove', { clientX: 130, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointermove', { clientX: 150, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointerup', { clientX: 150, clientY: 100 }));

    expect(kinds()).toEqual(['dragStart', 'dragMove', 'dragMove', 'dragEnd']);
    expect(intents.at(-1)).toMatchObject({ kind: 'dragEnd', delta: { x: 50, y: 0 } });
  });

  it('emits a longpress after the hold time, and no tap on release', () => {
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    vi.advanceTimersByTime(500);
    el.dispatchEvent(pointerEvent('pointerup', { clientX: 100, clientY: 100 }));

    expect(kinds()).toEqual(['longpress']);
  });

  it('cancels the longpress once a drag starts', () => {
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointermove', { clientX: 160, clientY: 100 }));
    vi.advanceTimersByTime(1000);
    el.dispatchEvent(pointerEvent('pointerup', { clientX: 160, clientY: 100 }));

    expect(kinds()).not.toContain('longpress');
  });

  it('reads two fingers as a pinch, not two drags', () => {
    el.dispatchEvent(pointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, pointerType: 'touch', clientX: 200, clientY: 100 }));
    el.dispatchEvent(pointerEvent('pointermove', { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 }));

    const pinch = intents.find((i) => i.kind === 'pinch');
    expect(pinch).toBeDefined();
    // Fingers went from 100px apart to 200px apart.
    expect(pinch).toMatchObject({ scale: 2 });
    expect(kinds()).not.toContain('dragStart');
  });

  it('emits hover for a mouse but never for a finger', () => {
    el.dispatchEvent(pointerEvent('pointermove', { pointerType: 'mouse', clientX: 10, clientY: 10 }));
    expect(kinds()).toEqual(['hover']);

    intents.length = 0;
    el.dispatchEvent(pointerEvent('pointermove', { pointerType: 'touch', clientX: 10, clientY: 10 }));
    expect(kinds()).toEqual([]);
  });

  it('suppresses the iOS long-press callout so the game owns that gesture', () => {
    const menu = new Event('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });

  it('stops emitting after detach', () => {
    source.detach();
    el.dispatchEvent(pointerEvent('pointerdown', { clientX: 1, clientY: 1 }));
    el.dispatchEvent(pointerEvent('pointerup', { clientX: 1, clientY: 1 }));
    expect(intents).toEqual([]);
  });

  it('projects screen coordinates into world space through the injected camera', () => {
    const scaled = new PointerSource(el, { toWorld: (s) => ({ x: s.x / 10, y: s.y / 10 }) });
    const seen: Intent[] = [];
    scaled.subscribe((i) => seen.push(i));
    scaled.attach();

    el.dispatchEvent(pointerEvent('pointerdown', { pointerId: 9, clientX: 500, clientY: 250 }));
    el.dispatchEvent(pointerEvent('pointerup', { pointerId: 9, clientX: 500, clientY: 250 }));

    expect(seen.at(-1)).toMatchObject({ kind: 'tap', world: { x: 50, y: 25 }, screen: { x: 500, y: 250 } });
    scaled.detach();
  });
});
