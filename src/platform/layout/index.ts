/**
 * Responsive layout (PLAN.md §7.2).
 *
 * Two breakpoints, and only two. `compact` is the PRIMARY layout — design and build it
 * first, then expand. A panel that renders only at `regular` fails review.
 */

export type Breakpoint = 'compact' | 'regular';

/** Below this width (CSS px) we are on a phone. */
export const REGULAR_MIN_WIDTH = 768;

/** iOS HIG minimum touch target, applied at BOTH breakpoints. */
export const MIN_HIT_TARGET_PX = 44;

/**
 * The home-indicator swipe area. Nothing interactive goes here — the system gesture
 * wins, and the player just experiences a button that doesn't work.
 */
export const HOME_INDICATOR_GUARD_PX = 34;

export function breakpointFor(width: number): Breakpoint {
  return width >= REGULAR_MIN_WIDTH ? 'regular' : 'compact';
}

export interface SafeAreaInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export const NO_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Reads the safe-area CSS custom properties set in `src/ui/styles/base.css`.
 *
 * We read the resolved custom property rather than `env()` directly because the
 * Capacitor system-bars plugin injects `--safe-area-inset-*` as a fallback where the
 * native `env()` values are unreliable (PLAN.md §7.3).
 */
export function readSafeAreaInsets(el: Element): SafeAreaInsets {
  const styles = getComputedStyle(el);
  const px = (name: string): number => Number.parseFloat(styles.getPropertyValue(name)) || 0;
  return {
    top: px('--inset-top'),
    bottom: px('--inset-bottom'),
    left: px('--inset-left'),
    right: px('--inset-right'),
  };
}
