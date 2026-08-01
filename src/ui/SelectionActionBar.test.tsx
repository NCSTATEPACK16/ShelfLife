// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { SelectionActionBar } from './SelectionActionBar.js';

describe('SelectionActionBar', () => {
  it('renders nothing when there is no selection', () => {
    const root = document.createElement('div');
    render(
      <SelectionActionBar screenPosition={null} onRotate={() => {}} onRemove={() => {}} onCancel={() => {}} />,
      root,
    );
    expect(root.children.length).toBe(0);
  });

  it('renders rotate/remove/cancel when a fixture is selected', () => {
    const onRotate = vi.fn();
    const root = document.createElement('div');
    render(
      <SelectionActionBar
        screenPosition={{ x: 10, y: 10 }}
        onRotate={onRotate}
        onRemove={() => {}}
        onCancel={() => {}}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>('[data-testid="action-rotate"]')?.click();
    expect(onRotate).toHaveBeenCalled();
  });
});
