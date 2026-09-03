// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { HudTopBar } from './HudTopBar.js';

describe('HudTopBar', () => {
  it('shows the store name, cash, and objective progress', () => {
    const root = document.createElement('div');
    render(
      <HudTopBar
        storeName="Sav-A-Lott"
        cash={1234}
        chapterTitle="Open Your Doors"
        objectiveCurrent={0.08}
        objectiveTarget={0.15}
        mode="build"
        onToggleMode={() => {}}
      />,
      root,
    );
    expect(root.textContent).toContain('Sav-A-Lott');
    expect(root.textContent).toContain('1234');
    expect(root.textContent).toContain('Open Your Doors');
    expect(root.querySelector('[data-testid="objective-progress"]')?.textContent).toMatch(/8%.*15%/s);
  });

  it('the mode toggle button reflects the current mode and calls onToggleMode', () => {
    const root = document.createElement('div');
    let toggled = false;
    render(
      <HudTopBar
        storeName="Sav-A-Lott"
        cash={0}
        chapterTitle="Ch"
        objectiveCurrent={0}
        objectiveTarget={1}
        mode="build"
        onToggleMode={() => {
          toggled = true;
        }}
      />,
      root,
    );
    const button = root.querySelector<HTMLButtonElement>('[data-testid="mode-toggle"]')!;
    expect(button.getAttribute('aria-label')).toMatch(/manage/i);
    button.click();
    expect(toggled).toBe(true);
  });
});
