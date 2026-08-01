/**
 * Semantic input intents (PLAN.md §7.1).
 *
 * Everything outside this directory consumes these. Mouse, touch, and pen all collapse
 * into the same vocabulary here, which is why the phone build is never a second-class
 * citizen — there is no separate touch code path to forget about.
 */

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/**
 * `world` is in sim grid coordinates; `screen` is in CSS pixels. Consumers that place
 * UI want `screen`; consumers that place fixtures want `world`.
 */
export interface PointerContext {
  readonly world: Vec2;
  readonly screen: Vec2;
}

export type Intent =
  | ({ readonly kind: 'tap' } & PointerContext)
  | ({ readonly kind: 'longpress' } & PointerContext)
  | ({ readonly kind: 'dragStart' } & PointerContext)
  | ({ readonly kind: 'dragMove'; readonly delta: Vec2 } & PointerContext)
  | ({ readonly kind: 'dragEnd'; readonly delta: Vec2 } & PointerContext)
  | { readonly kind: 'pinch'; readonly scale: number; readonly center: Vec2 }
  /**
   * Pointer devices only, and NEVER load-bearing (docs/adr/0002). If something is
   * discoverable only by hovering, it does not exist on a phone. Use hover to enhance
   * — a highlight, a preview — never to reveal.
   */
  | ({ readonly kind: 'hover' } & PointerContext);

export type IntentKind = Intent['kind'];

export type IntentHandler = (intent: Intent) => void;

/** Thresholds that separate a tap from a drag, and a press from a long-press. */
export interface GestureThresholds {
  /** Movement (CSS px) beyond which a press becomes a drag. */
  readonly dragSlop: number;
  /** Milliseconds held without moving before a press becomes a long-press. */
  readonly longPressMs: number;
}

export const DEFAULT_THRESHOLDS: GestureThresholds = {
  // Deliberately larger than a desktop-only value would be: fingers are imprecise
  // and a 4px slop makes taps feel like they get "eaten" on a phone.
  dragSlop: 10,
  longPressMs: 450,
};
