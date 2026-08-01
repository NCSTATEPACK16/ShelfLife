// @vitest-environment jsdom
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildModeBridge } from '../bridge/build-bridge.js';
import { BuildModePanel } from './BuildModePanel.js';

function mount(bridge: BuildModeBridge, breakpoint: 'compact' | 'regular' = 'compact'): HTMLDivElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(
    <BuildModePanel bridge={bridge} breakpoint={breakpoint} onSelect={() => {}} onArm={() => {}} />,
    root,
  );
  return root;
}

describe('BuildModePanel', () => {
  let bridge: BuildModeBridge;

  beforeEach(() => {
    bridge = new BuildModeBridge({ width: 10, height: 10 });
  });

  it('renders a palette button for every catalog fixture', () => {
    const root = mount(bridge);
    expect(root.querySelectorAll('[data-testid^="fixture-"]').length).toBe(
      bridge.snapshot().catalog.length,
    );
  });

  it('shows the placement count', () => {
    bridge.place('shelf_basic', 0, 0, 0);
    const root = mount(bridge);
    expect(root.querySelector('[data-testid="placement-count"]')?.textContent).toBe('1');
  });

  it('disables undo/redo when their stacks are empty', () => {
    const root = mount(bridge);
    const undoBtn = root.querySelector<HTMLButtonElement>('[data-testid="undo"]');
    const redoBtn = root.querySelector<HTMLButtonElement>('[data-testid="redo"]');
    expect(undoBtn?.disabled).toBe(true);
    expect(redoBtn?.disabled).toBe(true);
  });

  it('enables undo after a placement and calls onArm when a palette button is tapped', () => {
    bridge.place('shelf_basic', 0, 0, 0);
    const onArm = vi.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(
      <BuildModePanel bridge={bridge} breakpoint="compact" onSelect={() => {}} onArm={onArm} />,
      root,
    );
    const undoBtn = root.querySelector<HTMLButtonElement>('[data-testid="undo"]');
    expect(undoBtn?.disabled).toBe(false);

    const button = root.querySelector<HTMLButtonElement>('[data-testid="fixture-shelf_basic"]');
    button?.click();
    expect(onArm).toHaveBeenCalledWith('shelf_basic');
  });

  it('renders at the regular breakpoint too (compact is not the only supported layout)', () => {
    const root = mount(bridge, 'regular');
    expect(root.querySelectorAll('[data-testid^="fixture-"]').length).toBeGreaterThan(0);
  });
});
