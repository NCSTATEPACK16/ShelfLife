export interface GoodDef {
  readonly id: string;
  readonly name: string;
  readonly unitPrice: number;
  /** Fraction of a household's pantry stock for this good consumed per sim day. */
  readonly depletionPerDay: number;
  /** Stock level (0-1) below which this good enters a household's shopping list. */
  readonly reorderThreshold: number;
  /** Base probability (0-1) of an impulse purchase when a shopper passes this good's shelf. */
  readonly impulseBase: number;
}
