import './ui/styles/base.css';
import { breakpointFor, PointerSource, readSafeAreaInsets, type Intent } from './platform/index.js';
import { mountBuildMode } from './view/build-mode.js';

/**
 * Phase 1.0 entry point.
 *
 * The gate for this phase is "verify is green and an empty canvas deploys" — so this
 * deliberately does almost nothing. What it DOES do is exercise the platform seam end to
 * end on a real device, which is the point of building that seam first: the boot screen
 * below reports the breakpoint, the safe-area insets, and live input intents, so the
 * phone-first constraint is verifiable from the very first deploy rather than asserted.
 *
 * Phaser stays unopened until the sim kernel's gate is green (PLAN.md §21).
 */

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLDivElement>('#ui-root');

if (!canvas || !uiRoot) {
  throw new Error('Boot failed: #game-canvas or #ui-root is missing from index.html');
}

/* ── A placeholder floor, so the deploy is visibly alive ──────────────────── */

function paint(): void {
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  const w = canvas!.clientWidth;
  const h = canvas!.clientHeight;
  canvas!.width = Math.round(w * dpr);
  canvas!.height = Math.round(h * dpr);

  const ctx = canvas!.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = '#2b3a33';
  ctx.fillRect(0, 0, w, h);

  // 2:1 dimetric grid at the locked 128x64 tile footprint (PLAN.md §9.1).
  const tileW = 128;
  const tileH = 64;
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let i = -20; i < 20; i++) {
    for (const [dx, dy] of [
      [1, 0.5],
      [-1, 0.5],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(w / 2 + i * (tileW / 2), 0);
      ctx.lineTo(w / 2 + i * (tileW / 2) + dx * h * (tileH / tileW) * 2, h * dy * 2);
      ctx.stroke();
    }
  }
}

/* ── Boot readout: proves the platform seam works on the actual device ────── */

const panel = document.createElement('div');
panel.setAttribute('role', 'status');
panel.style.cssText = `
  position:absolute; top:var(--space-4); left:var(--space-4); right:var(--space-4);
  max-width:34rem; background:var(--surface); color:var(--ink);
  border-radius:var(--radius-lg); box-shadow:var(--shadow-panel);
  padding:var(--space-4); font-size:0.875rem;`;
uiRoot.appendChild(panel);

let lastIntent = '—';

function render(): void {
  const bp = breakpointFor(globalThis.innerWidth);
  const insets = readSafeAreaInsets(document.documentElement);
  panel.innerHTML = `
    <div style="font-family:var(--font-signage);font-weight:800;letter-spacing:-.02em;
                text-transform:uppercase;font-size:1.125rem">Shelf Life</div>
    <div style="color:var(--ink-muted);margin-bottom:var(--space-3)">
      Phase 1.0 — Foundations. The canvas is empty on purpose.
    </div>
    <dl style="display:grid;grid-template-columns:auto 1fr;gap:var(--space-1) var(--space-3);margin:0">
      <dt style="color:var(--ink-faint)">Breakpoint</dt>
      <dd class="num" style="margin:0">${bp} · ${globalThis.innerWidth}×${globalThis.innerHeight}</dd>
      <dt style="color:var(--ink-faint)">Safe area</dt>
      <dd class="num" style="margin:0">t${insets.top} r${insets.right} b${insets.bottom} l${insets.left}</dd>
      <dt style="color:var(--ink-faint)">Last intent</dt>
      <dd class="num" style="margin:0">${lastIntent}</dd>
    </dl>`;
}

function describe(intent: Intent): string {
  switch (intent.kind) {
    case 'pinch':
      return `pinch ×${intent.scale.toFixed(2)}`;
    case 'dragMove':
    case 'dragEnd':
      return `${intent.kind} Δ${Math.round(intent.delta.x)},${Math.round(intent.delta.y)}`;
    default:
      return `${intent.kind} @ ${Math.round(intent.screen.x)},${Math.round(intent.screen.y)}`;
  }
}

const input = new PointerSource(canvas, { toWorld: (screen) => screen });
input.subscribe((intent) => {
  lastIntent = describe(intent);
  render();
});
input.attach();

globalThis.addEventListener('resize', () => {
  paint();
  render();
});

paint();
render();

/* ── Phase 1.4: build mode ──────────────────────────────────────────────── */

mountBuildMode(canvas, uiRoot).catch((error: unknown) => {
  console.error('Build mode failed to mount:', error);
});
