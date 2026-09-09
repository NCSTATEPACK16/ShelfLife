// @vitest-environment jsdom
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import { RivalsPanel } from './RivalsPanel.js';
import type { RivalIntel } from '../bridge/campaign-bridge.js';

const intel: RivalIntel = {
  rivals: [
    {
      id: 'sav-a-lott', name: 'Sav-A-Lott', archetype: 'discounter', communityLove: 22,
      quality: 0.3, service: 0.2, ambiance: 0.3, priceIndex: 0.7,
    },
  ],
  player: { priceLevel: 1, serviceScore: 0.82 },
};

describe('RivalsPanel', () => {
  it("shows each rival's terms alongside the player's comparable KPI, never a bare number", () => {
    const root = document.createElement('div');
    render(<RivalsPanel intel={intel} breakpoint="compact" />, root);
    const card = root.querySelector('[data-testid="rival-card-sav-a-lott"]')!;
    expect(card.textContent).toContain('Sav-A-Lott');
    expect(card.textContent).toMatch(/your service.*0\.82/is);
  });
});
