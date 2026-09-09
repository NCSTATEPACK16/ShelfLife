import type { AdvisorLine as ChapterAdvisorLine } from '../sim/index.js';

export type ChapterModalKind = 'intro' | 'outro' | 'won' | 'lost' | null;

export interface ChapterModalProps {
  readonly kind: ChapterModalKind;
  readonly copy: ChapterAdvisorLine | null;
  readonly onContinue: () => void;
}

const CONTINUE_LABEL: Record<Exclude<ChapterModalKind, null>, string> = {
  intro: 'Start',
  outro: 'Continue',
  won: 'Return to menu',
  lost: 'Retry',
};

/** Full-screen, blocking chapter/level transition card. Returns null (renders nothing) when kind is null. */
export function ChapterModal(props: ChapterModalProps): preact.JSX.Element | null {
  if (!props.kind) return null;

  const style = `position:fixed;inset:0;z-index:20;display:flex;align-items:center;
    justify-content:center;background:rgba(20,19,17,0.72);padding:var(--space-4)`;
  const cardStyle = `max-width:28rem;background:var(--surface-raised);border-radius:var(--radius-lg);
    box-shadow:var(--shadow-panel);padding:var(--space-5);text-align:center;color:var(--ink)`;

  const heading = props.kind === 'won' ? 'You won!' : props.kind === 'lost' ? 'Store closed' : null;

  return (
    <div style={style} data-testid="chapter-modal" role="dialog" aria-modal="true">
      <div style={cardStyle}>
        {heading && <h2>{heading}</h2>}
        {props.copy && (
          <p>
            <strong style="text-transform:capitalize">{props.copy.advisor}: </strong>
            {props.copy.line}
          </p>
        )}
        <button
          type="button"
          data-testid="chapter-modal-continue"
          style="min-width:44px;min-height:44px"
          onClick={props.onContinue}
        >
          {CONTINUE_LABEL[props.kind]}
        </button>
      </div>
    </div>
  );
}
