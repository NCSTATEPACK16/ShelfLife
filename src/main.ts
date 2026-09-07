import './ui/styles/base.css';
import { breakpointFor, readSafeAreaInsets } from './platform/index.js';
import { mountCampaign } from './view/campaign-mode.js';

/**
 * Entry point.
 *
 * Mounts the store and gets out of the way. If the canvas cannot produce a rendering
 * context — a headless test, a hostile embedding, a browser with WebGL and 2D both
 * disabled — the game does not throw; it shows a diagnostic panel reporting the platform
 * seam's view of the device instead. That panel is the degraded path, not the normal one:
 * when the renderer works, the screen belongs to the store.
 */

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLDivElement>('#ui-root');

if (!canvas || !uiRoot) {
  throw new Error('Boot failed: #game-canvas or #ui-root is missing from index.html');
}

/**
 * Reports what the platform seam resolved, so a real device can confirm the breakpoint
 * and safe-area insets at a glance. Shown only when there is no renderer to look at.
 */
function showDiagnostics(reason: string): void {
  const breakpoint = breakpointFor(globalThis.innerWidth);
  const insets = readSafeAreaInsets(document.documentElement);

  const panel = document.createElement('div');
  panel.setAttribute('role', 'status');
  panel.style.cssText = `
    position:absolute; top:var(--space-4); left:var(--space-4); right:var(--space-4);
    max-width:34rem; background:var(--surface); color:var(--ink);
    border-radius:var(--radius-lg); box-shadow:var(--shadow-panel);
    padding:var(--space-4); font-size:0.875rem;`;
  panel.innerHTML = `
    <div style="font-family:var(--font-signage);font-weight:800;letter-spacing:-.02em;
                text-transform:uppercase;font-size:1.125rem">Shelf Life</div>
    <div style="color:var(--ink-muted);margin-bottom:var(--space-3)">${reason}</div>
    <dl style="display:grid;grid-template-columns:auto 1fr;gap:var(--space-1) var(--space-3);margin:0">
      <dt style="color:var(--ink-faint)">Breakpoint</dt>
      <dd class="num" style="margin:0">${breakpoint} · ${globalThis.innerWidth}×${globalThis.innerHeight}</dd>
      <dt style="color:var(--ink-faint)">Safe area</dt>
      <dd class="num" style="margin:0">t${insets.top} r${insets.right} b${insets.bottom} l${insets.left}</dd>
    </dl>`;
  uiRoot!.appendChild(panel);
}

// Awaited at the top level so a caller that awaits this module — the boot smoke test —
// sees the finished outcome rather than a pending promise.
try {
  const mounted = await mountCampaign(canvas, uiRoot);
  if (!mounted) {
    showDiagnostics('This browser gave us no drawing surface, so the store cannot render.');
  } else if (import.meta.env.DEV) {
    // Dev-only handle so end-to-end tests can drive the simulation directly — spawn four
    // hundred shoppers and measure the frame, which no amount of clicking buttons can do.
    // Stripped from production builds by the bundler's dead-code elimination.
    (globalThis as unknown as { shelfLife?: unknown }).shelfLife = mounted;
  }
} catch (error) {
  showDiagnostics(`The store failed to start: ${error instanceof Error ? error.message : String(error)}`);
}
