/**
 * Fixture id → world-atlas frame name, for the build-mode fixture palette icons.
 *
 * Kept separate from `content/fixtures/catalog.json`: that file is sim content
 * (footprint/walkable feed the simulation), and this mapping is UI-only.
 */
export const FIXTURE_ICON_FRAMES: Readonly<Record<string, string>> = {
  shelf_basic: 'shelf_basic__full__r0',
  shelf_endcap: 'shelf_endcap__full__r0',
  register: 'register__idle__r0',
  self_checkout: 'self_checkout__idle__r0',
  cart_corral: 'cart_corral__full',
};
