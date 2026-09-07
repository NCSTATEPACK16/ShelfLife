import tokens from '../../content/design/tokens.json';

/** Converts a token's hex string to Phaser's 0xRRGGBB number format. */
export function toPhaserColor(hex: string): number {
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

// The two world marks docs/design/gentle-surface.md §1 asks for. Both come from the
// semantic ramp rather than the accent: `spoiled` exists in the token file precisely so
// nothing has to reach for a brown that means "off" and pick its own.
const SPOILED_TINT = toPhaserColor(tokens.color.semantic.spoiled);
const PRICE_MARK_TINT = toPhaserColor(tokens.color.semantic.critical);

/** Brown, for the shelf a shopper just found something rotten on. */
export function spoiledTint(): number {
  return SPOILED_TINT;
}

/** The brief highlight on the item a shopper put back because it cost too much. */
export function priceMarkTint(): number {
  return PRICE_MARK_TINT;
}
