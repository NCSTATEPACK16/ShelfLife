// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { PricingPanel } from './PricingPanel.js';
import { DEFAULT_GOODS_CATALOG } from '../sim/index.js';

describe('PricingPanel', () => {
  it("shows every catalog good's price relative to reference", () => {
    const root = document.createElement('div');
    render(
      <PricingPanel
        goods={DEFAULT_GOODS_CATALOG}
        priceOf={(id) => DEFAULT_GOODS_CATALOG.find((g) => g.id === id)!.unitPrice}
        referencePriceOf={(id) => DEFAULT_GOODS_CATALOG.find((g) => g.id === id)!.unitPrice}
        marketingSpend={0}
        breakpoint="compact"
        onSetPrice={() => {}}
        onStartPromotion={() => {}}
        onSetMarketingSpend={() => {}}
      />,
      root,
    );
    expect(root.querySelectorAll('div[data-testid^="pricing-row-"]').length).toBe(DEFAULT_GOODS_CATALOG.length);
    expect(root.textContent).toMatch(/reference|at ref/i);
  });

  it('the price stepper calls onSetPrice with an adjusted value', () => {
    const root = document.createElement('div');
    let called: [string, number] | null = null;
    const good = DEFAULT_GOODS_CATALOG[0]!;
    render(
      <PricingPanel
        goods={DEFAULT_GOODS_CATALOG}
        priceOf={() => good.unitPrice}
        referencePriceOf={() => good.unitPrice}
        marketingSpend={0}
        breakpoint="compact"
        onSetPrice={(id, price) => {
          called = [id, price];
        }}
        onStartPromotion={() => {}}
        onSetMarketingSpend={() => {}}
      />,
      root,
    );
    root.querySelector<HTMLButtonElement>(`[data-testid="pricing-row-${good.id}-increase"]`)!.click();
    expect(called?.[0]).toBe(good.id);
    expect(called?.[1]).toBeGreaterThan(good.unitPrice);
  });

  it('the marketing-spend input calls onSetMarketingSpend', () => {
    const root = document.createElement('div');
    let spend: number | null = null;
    render(
      <PricingPanel
        goods={DEFAULT_GOODS_CATALOG}
        priceOf={() => 1}
        referencePriceOf={() => 1}
        marketingSpend={0}
        breakpoint="compact"
        onSetPrice={() => {}}
        onStartPromotion={() => {}}
        onSetMarketingSpend={(v) => {
          spend = v;
        }}
      />,
      root,
    );
    const input = root.querySelector<HTMLInputElement>('[data-testid="pricing-marketing-spend"]')!;
    input.value = '75';
    input.dispatchEvent(new Event('input'));
    expect(spend).toBe(75);
  });
});
