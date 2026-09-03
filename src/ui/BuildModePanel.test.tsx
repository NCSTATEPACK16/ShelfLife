// @vitest-environment jsdom
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignBridge } from '../bridge/campaign-bridge.js';
import { BuildModePanel } from './BuildModePanel.js';

function mount(bridge: CampaignBridge, breakpoint: 'compact' | 'regular' = 'compact'): HTMLDivElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  render(
    <BuildModePanel
      bridge={bridge}
      breakpoint={breakpoint}
      onSelect={() => {}}
      onArm={() => {}}
      onUndo={() => {}}
      onRedo={() => {}}
      pathingDebugOn={false}
      onTogglePathingDebug={() => {}}
    />,
    root,
  );
  return root;
}

describe('BuildModePanel', () => {
  let bridge: CampaignBridge;
  let baselinePlacementCount: number;

  beforeEach(async () => {
    bridge = CampaignBridge.start('l1', 1);
    // l1's starting store (4 fixtures) is queued but not applied until the first world.step()
    // — flush it here so every test's counts are relative to a settled baseline, not zero.
    await bridge.tick();
    baselinePlacementCount = bridge.snapshot().placements.length;
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
    expect(root.querySelector('[data-testid="placement-count"]')?.textContent).toBe(
      String(baselinePlacementCount + 1),
    );
  });

  it('disables redo when nothing has been undone (undo itself is enabled — l1 always has an undoable starting store)', () => {
    const root = mount(bridge);
    const undoBtn = root.querySelector<HTMLButtonElement>('[data-testid="undo"]');
    const redoBtn = root.querySelector<HTMLButtonElement>('[data-testid="redo"]');
    expect(undoBtn?.disabled).toBe(false);
    expect(redoBtn?.disabled).toBe(true);
  });

  it('enables undo after a placement and calls onArm when a palette button is tapped', () => {
    bridge.place('shelf_basic', 0, 0, 0);
    const onArm = vi.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(
      <BuildModePanel
        bridge={bridge}
        breakpoint="compact"
        onSelect={() => {}}
        onArm={onArm}
        onUndo={() => {}}
        onRedo={() => {}}
        pathingDebugOn={false}
        onTogglePathingDebug={() => {}}
      />,
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

  it('calls onTogglePathingDebug when the debug button is clicked', () => {
    const onTogglePathingDebug = vi.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    render(
      <BuildModePanel
        bridge={bridge}
        breakpoint="compact"
        onSelect={() => {}}
        onArm={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        pathingDebugOn={false}
        onTogglePathingDebug={onTogglePathingDebug}
      />,
      root,
    );
    const toggleBtn = root.querySelector<HTMLButtonElement>('[data-testid="toggle-pathing-debug"]');
    toggleBtn?.click();
    expect(onTogglePathingDebug).toHaveBeenCalledOnce();
  });
});
