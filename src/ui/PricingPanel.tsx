import type { GoodDef } from '../sim/index.js';
import type { Breakpoint } from '../platform/layout/index.js';

export interface PricingPanelProps {
  readonly goods: readonly GoodDef[];
  readonly priceOf: (goodId: string) => number;
  readonly referencePriceOf: (goodId: string) => number;
  readonly marketingSpend: number;
  readonly breakpoint: Breakpoint;
  readonly onSetPrice: (goodId: string, price: number) => void;
  readonly onStartPromotion: (goodId: string) => void;
  readonly onSetMarketingSpend: (dailyAmount: number) => void;
}

const PRICE_STEP_FRACTION = 0.05;

function relativeLabel(price: number, reference: number): string {
  if (reference === 0) return 'at reference';
  const pct = Math.round(((price - reference) / reference) * 100);
  if (pct === 0) return 'at reference';
  return pct > 0 ? `${pct}% above reference` : `${Math.abs(pct)}% below reference`;
}

export function PricingPanel(props: PricingPanelProps): preact.JSX.Element {
  const containerStyle =
    props.breakpoint === 'compact'
      ? 'display:flex;flex-direction:column;gap:var(--space-2);padding:var(--space-3)'
      : 'display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-3);padding:var(--space-4)';

  return (
    <div>
      <div style={containerStyle} data-testid="pricing-panel">
        {props.goods.map((good) => {
          const price = props.priceOf(good.id);
          const reference = props.referencePriceOf(good.id);
          return (
            <div
              key={good.id}
              data-testid={`pricing-row-${good.id}`}
              style="display:flex;align-items:center;gap:var(--space-2)"
            >
              <span style="flex:1">{good.name}</span>
              <span class="num">${price.toFixed(2)}</span>
              <span style="color:var(--ink-faint);font-size:0.875rem">{relativeLabel(price, reference)}</span>
              <button
                type="button"
                data-testid={`pricing-row-${good.id}-decrease`}
                style="min-width:44px;min-height:44px"
                onClick={() => props.onSetPrice(good.id, Math.max(0, price * (1 - PRICE_STEP_FRACTION)))}
              >
                −
              </button>
              <button
                type="button"
                data-testid={`pricing-row-${good.id}-increase`}
                style="min-width:44px;min-height:44px"
                onClick={() => props.onSetPrice(good.id, price * (1 + PRICE_STEP_FRACTION))}
              >
                +
              </button>
              <button
                type="button"
                data-testid={`pricing-row-${good.id}-promote`}
                style="min-width:44px;min-height:44px"
                onClick={() => props.onStartPromotion(good.id)}
              >
                Promo
              </button>
            </div>
          );
        })}
      </div>
      <label style="display:flex;align-items:center;gap:var(--space-2);padding:var(--space-3)">
        Marketing spend / day
        <input
          type="number"
          data-testid="pricing-marketing-spend"
          value={props.marketingSpend}
          min={0}
          onInput={(e) => props.onSetMarketingSpend(Number((e.target as HTMLInputElement).value))}
        />
      </label>
    </div>
  );
}
