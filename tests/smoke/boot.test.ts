// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Boot smoke test.
 *
 * The phase 1.0 gate is "an empty canvas deploys and runs". This asserts the boot path
 * actually executes rather than trusting that a green build implies a working page —
 * runtime blindness is exactly what bites during the renderer and UI phases
 * (PLAN.md §17.4), so the habit starts here.
 */

async function boot(): Promise<void> {
  vi.resetModules();
  await import('../../src/main.js');
}

describe('boot', () => {
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui-root"></div>';
    // jsdom has no canvas backend; main.ts must degrade rather than throw.
    HTMLCanvasElement.prototype.getContext = (() => null) as never;
  });

  it('boots without throwing and renders the status panel', async () => {
    await boot();

    const panel = document.querySelector('#ui-root [role="status"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Shelf Life');
  });

  it('reports the breakpoint it resolved, so a device can confirm it at a glance', async () => {
    await boot();

    const text = document.querySelector('#ui-root [role="status"]')?.textContent ?? '';
    // jsdom defaults to 1024px wide.
    expect(text).toContain('regular');
    expect(text).toContain('Breakpoint');
    expect(text).toContain('Safe area');
  });

  it('fails loudly if the document is missing its mount points', async () => {
    document.body.innerHTML = '';
    await expect(boot()).rejects.toThrow(/Boot failed/);
  });
});
