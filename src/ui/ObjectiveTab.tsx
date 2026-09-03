import type { AdvisorLine as ChapterAdvisorLine } from '../sim/index.js';

export interface ObjectiveTabProps {
  readonly chapterTitle: string;
  readonly introLine: ChapterAdvisorLine;
  readonly current: number;
  readonly target: number;
}

export function ObjectiveTab(props: ObjectiveTabProps): preact.JSX.Element {
  const currentPct = Math.round(props.current * 100);
  const targetPct = Math.round(props.target * 100);

  return (
    <div style="padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-2)" data-testid="objective-tab">
      <h3>{props.chapterTitle}</h3>
      <p>
        <strong style="text-transform:capitalize">{props.introLine.advisor}: </strong>
        {props.introLine.line}
      </p>
      <div
        data-testid="objective-tab-progress"
        role="progressbar"
        aria-valuenow={currentPct}
        aria-valuemin={0}
        aria-valuemax={targetPct}
        style="height:8px;border-radius:999px;background:var(--line);overflow:hidden"
      >
        <div
          style={`height:100%;background:var(--accent);width:${Math.min(100, (currentPct / Math.max(1, targetPct)) * 100)}%`}
        />
      </div>
      <span class="num">
        {currentPct}% / {targetPct}% share
      </span>
    </div>
  );
}
