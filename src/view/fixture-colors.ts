import tokens from '../../content/design/tokens.json';

/** Converts a token's hex string to Phaser's 0xRRGGBB number format. */
function toPhaserColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

const FIXTURE_COLORS: Record<string, number> = {
  shelf_basic: toPhaserColor(tokens.color.fixture['600']),
  shelf_endcap: toPhaserColor(tokens.color.fixture['500']),
  register: toPhaserColor(tokens.color.product.blue.base),
  cart_corral: toPhaserColor(tokens.color.fixture['300']),
};

const FALLBACK_COLOR = toPhaserColor(tokens.color.fixture['400']);
const SELECTION_COLOR = toPhaserColor(tokens.color.product.red.base);

export function colorForFixture(fixtureId: string): number {
  return FIXTURE_COLORS[fixtureId] ?? FALLBACK_COLOR;
}

export function selectionColor(): number {
  return SELECTION_COLOR;
}
