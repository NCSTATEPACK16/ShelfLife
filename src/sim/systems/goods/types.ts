export interface GoodDef {
  readonly id: string;
  readonly name: string;
  readonly unitPrice: number;
  /** Cost of goods sold per unit (PLAN.md §5.7's COGS). Always <= unitPrice at content-author
   *  time, but nothing stops a player from setting a price below it via EconomySystem — that's
   *  what a loss leader is. */
  readonly cost: number;
  /** Fraction of a household's pantry stock for this good consumed per sim day. */
  readonly depletionPerDay: number;
  /** Stock level (0-1) below which this good enters a household's shopping list. */
  readonly reorderThreshold: number;
  /** Base probability (0-1) of an impulse purchase when a shopper passes this good's shelf. */
  readonly impulseBase: number;
  /** Category tag for §5.4's adjacencyBonus combo check (e.g. 'dairy', 'bakery'). */
  readonly category: string;
}
