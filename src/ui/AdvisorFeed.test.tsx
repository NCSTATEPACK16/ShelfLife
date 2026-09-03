// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { AdvisorFeed } from './AdvisorFeed.js';
import type { AdvisorLine } from './advisors.js';

const lines: AdvisorLine[] = [
  { advisor: 'diane', line: 'Dairy is bleeding.', showMe: { tab: 'finance', rowId: 'spoilage' } },
  { advisor: 'marcus', line: 'Line 2 has no one working it.', showMe: { tab: 'staff' } },
  { advisor: 'chloe', line: 'Sav-A-Lott cut prices.', showMe: { tab: 'rivals' } },
  { advisor: 'diane', line: 'A fourth line — should be dropped, max 3 shown.', showMe: { tab: 'finance' } },
];

describe('AdvisorFeed', () => {
  it('shows at most 3 lines at once, oldest dropped first', () => {
    const root = document.createElement('div');
    render(<AdvisorFeed lines={lines} breakpoint="compact" onShowMe={() => {}} onDismiss={() => {}} />, root);
    expect(root.querySelectorAll('[data-testid="advisor-line"]').length).toBe(3);
    expect(root.textContent).not.toContain('Dairy is bleeding.'); // the oldest, dropped
  });

  it('a "Show me" button calls onShowMe with the line\'s target tab', () => {
    const root = document.createElement('div');
    let clicked: { tab: string; rowId?: string } | null = null;
    render(
      <AdvisorFeed
        lines={[lines[1]!]}
        breakpoint="compact"
        onShowMe={(target) => {
          clicked = target;
        }}
        onDismiss={() => {}}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="advisor-show-me"]')!.click();
    expect(clicked).toEqual({ tab: 'staff', rowId: undefined });
  });
});
