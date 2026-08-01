/**
 * The platform seam (PLAN.md §7).
 *
 * Everything that differs between a browser tab and a WKWebView inside a Capacitor shell
 * lives behind this barrel. `src/view` and `src/ui` import from here; `src/sim` imports
 * nothing from here at all.
 */

export * from './input/index.js';
export * from './layout/index.js';
export * from './entitlements/index.js';
export * from './storage/index.js';
