// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { InventoryPanel } from './InventoryPanel.js';
import type { InventoryLevel } from '../bridge/campaign-bridge.js';

const levels: InventoryLevel[] = [
  { goodId: 'milk', stock: 30, capacity: 100, fraction: 0.3, reorderPoint: 40, freshness: 0.7 },
];

describe('InventoryPanel', () => {
  it("shows each good's stock against its reorder point, not as a bare number", () => {
    const root = document.createElement('div');
    render(<InventoryPanel levels={levels} breakpoint="compact" />, root);
    const row = root.querySelector('[data-testid="inventory-row-milk"]')!;
    expect(row.textContent).toContain('30');
    expect(row.textContent).toMatch(/reorder/i);
    expect(row.textContent).toContain('40');
  });
});
