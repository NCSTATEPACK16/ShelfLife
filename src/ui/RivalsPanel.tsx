import type { RivalIntel } from '../bridge/campaign-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface RivalsPanelProps {
  readonly intel: RivalIntel;
  readonly breakpoint: Breakpoint;
}

export function RivalsPanel(props: RivalsPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-3);padding:var(--space-4)';

  return (
    <div style={containerStyle} data-testid="rivals-panel">
      {props.intel.rivals.map((rival) => (
        <div
          key={rival.id}
          data-testid={`rival-card-${rival.id}`}
          style="background:var(--surface-raised);border-radius:var(--radius-lg);
            box-shadow:var(--shadow-raised);padding:var(--space-3);display:flex;flex-direction:column;gap:var(--space-1)"
        >
          <strong>{rival.name}</strong>
          <span style="color:var(--ink-faint)">
            {rival.archetype} — CL {rival.communityLove}
          </span>
          <span class="num">
            Their service: {rival.service.toFixed(2)} — Your service: {props.intel.player.serviceScore.toFixed(2)}
          </span>
          <span class="num">
            Their price index: {rival.priceIndex.toFixed(2)} — Your price level: {props.intel.player.priceLevel.toFixed(2)}
          </span>
          <span class="num">
            Their quality: {rival.quality.toFixed(2)} · ambiance: {rival.ambiance.toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}
