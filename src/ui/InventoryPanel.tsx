import type { InventoryLevel } from '../bridge/campaign-bridge.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface InventoryPanelProps {
  readonly levels: readonly InventoryLevel[];
  readonly breakpoint: Breakpoint;
}

export function InventoryPanel(props: InventoryPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-3);padding:var(--space-4)';

  return (
    <div style={containerStyle} data-testid="inventory-panel">
      {props.levels.map((level) => (
        <div
          key={level.goodId}
          data-testid={`inventory-row-${level.goodId}`}
          style="display:flex;align-items:center;gap:var(--space-2)"
        >
          <span style="flex:1;text-transform:capitalize">{level.goodId}</span>
          <span class="num">
            {level.stock.toFixed(0)} / {level.capacity.toFixed(0)}{' '}
            <span style="color:var(--ink-faint)">(reorder at {level.reorderPoint.toFixed(0)})</span>
          </span>
          <span class="num" style="color:var(--ink-faint)">
            freshness {Math.round(level.freshness * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
