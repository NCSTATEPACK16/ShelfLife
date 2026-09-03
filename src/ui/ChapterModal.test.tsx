// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { ChapterModal } from './ChapterModal.js';

describe('ChapterModal', () => {
  it('renders nothing when kind is null', () => {
    const root = document.createElement('div');
    render(<ChapterModal kind={null} copy={null} onContinue={() => {}} />, root);
    expect(root.querySelector('[data-testid="chapter-modal"]')).toBeNull();
  });

  it('renders an outro card with a Continue button', () => {
    const root = document.createElement('div');
    let continued = false;
    render(
      <ChapterModal
        kind="outro"
        copy={{ advisor: 'diane', line: "You're on the board." }}
        onContinue={() => {
          continued = true;
        }}
      />,
      root,
    );
    expect(root.textContent).toContain("You're on the board.");
    root.querySelector<HTMLButtonElement>('[data-testid="chapter-modal-continue"]')!.click();
    expect(continued).toBe(true);
  });

  it('renders a won modal with no copy required', () => {
    const root = document.createElement('div');
    render(<ChapterModal kind="won" copy={null} onContinue={() => {}} />, root);
    expect(root.textContent?.toLowerCase()).toContain('won');
  });

  it('renders a lost modal with a Retry label on its continue button', () => {
    const root = document.createElement('div');
    render(<ChapterModal kind="lost" copy={null} onContinue={() => {}} />, root);
    expect(root.querySelector('[data-testid="chapter-modal-continue"]')?.textContent).toMatch(/retry/i);
  });
});
