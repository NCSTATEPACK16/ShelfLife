// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ObjectiveTab } from './ObjectiveTab.js';

describe('ObjectiveTab', () => {
  it('shows the chapter title, advisor line, and a progress bar', () => {
    const root = document.createElement('div');
    render(
      <ObjectiveTab
        chapterTitle="Open Your Doors"
        introLine={{ advisor: 'diane', line: 'Get the doors open.' }}
        current={0.08}
        target={0.15}
      />,
      root,
    );
    expect(root.textContent).toContain('Open Your Doors');
    expect(root.textContent).toContain('Get the doors open.');
    const bar = root.querySelector<HTMLElement>('[data-testid="objective-tab-progress"]')!;
    expect(bar.getAttribute('aria-valuenow')).toBe('8');
    expect(bar.getAttribute('aria-valuemax')).toBe('15');
  });
});
