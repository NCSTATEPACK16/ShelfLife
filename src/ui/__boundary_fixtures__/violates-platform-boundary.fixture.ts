/**
 * FIXTURE — see tests/boundaries/boundaries.test.ts.
 *
 * Deliberate violations of the platform input boundary (docs/adr/0002). Raw pointer
 * events are legal only inside src/platform/input; everything else must consume
 * semantic intents.
 *
 * Excluded from `npm run lint`; the test re-lints it with `ignore: false`.
 */

export function violatesInputBoundary(el: HTMLElement): void {
  // Raw listeners.
  el.addEventListener('pointerdown', () => {});
  el.addEventListener('mousemove', () => {});
  el.addEventListener('touchstart', () => {});
  el.addEventListener('wheel', () => {});

  // Raw handler assignment.
  el.onpointerup = () => {};
  el.onmousedown = () => {};
}
