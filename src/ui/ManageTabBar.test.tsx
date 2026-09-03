// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ManageTabBar } from './ManageTabBar.js';

describe('ManageTabBar', () => {
  it('renders one button per tab, marking the active one', () => {
    const root = document.createElement('div');
    render(<ManageTabBar active="finance" breakpoint="compact" onSelect={() => {}} />, root);
    const tabs = root.querySelectorAll('button[data-testid^="manage-tab-"]');
    expect(tabs.length).toBe(6); // finance/pricing/staff/inventory/rivals/objective
    expect(root.querySelector('[data-testid="manage-tab-finance"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('[data-testid="manage-tab-pricing"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('tapping a tab calls onSelect with that tab', () => {
    const root = document.createElement('div');
    let selected: string | null = null;
    render(
      <ManageTabBar
        active="finance"
        breakpoint="compact"
        onSelect={(tab) => {
          selected = tab;
        }}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="manage-tab-staff"]')!.click();
    expect(selected).toBe('staff');
  });

  it('renders as a bottom bar at compact and a side rail at regular', () => {
    const compact = document.createElement('div');
    render(<ManageTabBar active="finance" breakpoint="compact" onSelect={() => {}} />, compact);
    expect(compact.querySelector('[data-testid="manage-tab-bar"]')?.getAttribute('data-layout')).toBe('bottom');

    const regular = document.createElement('div');
    render(<ManageTabBar active="finance" breakpoint="regular" onSelect={() => {}} />, regular);
    expect(regular.querySelector('[data-testid="manage-tab-bar"]')?.getAttribute('data-layout')).toBe('rail');
  });
});
